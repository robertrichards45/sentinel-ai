import { note } from './diary';
import { whenSleeping } from './quiet';
import { setPhoneMic } from './micState';
/**
 * Real-time conversation with Alice (Gemini Live), ChatGPT-voice style:
 * the microphone streams continuously, Alice answers in ~1-2 s, and you can interrupt her.
 *
 * Flow: Alice's server issues a short-lived token (the API key never reaches the phone)
 * -> WebSocket straight to Google -> 16 kHz PCM up, 24 kHz PCM down.
 * Tools let Alice set reminders, make documents, etc. through the same checked actions
 * as the rest of the app (src/actions.ts), including the confirmation prompts.
 */
import { AudioContext, AudioRecorder, AudioManager, decodePCMInBase64 } from 'react-native-audio-api';
import type { AudioBufferQueueSourceNode } from 'react-native-audio-api';
import { Buffer } from 'buffer';
import { liveSession } from './ai';
import { validateAction, Action } from './intents';
import { runAction } from './actions';
import { allModes } from './modeStore';
import { getSettings } from './settings';
import { memory } from './memory';
import { floatToPcm16, resampleLinear, frameText } from './liveCore';
import { VOICE_STYLES } from './voice';

export type LiveState = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
export type LiveLine = { who: 'you' | 'alice' | 'done'; text: string; t: number };
type Events = { state: (s: LiveState, detail?: string) => void; line: (l: LiveLine) => void };
type Sub = Partial<Events>;

const NATURAL = ['Sulafat', 'Aoede', 'Laomedeia', 'Achernar', 'Vindemiatrix', 'Despina', 'Gacrux', 'Kore', 'Callirrhoe', 'Erinome', 'Leda', 'Zephyr', 'Autonoe', 'Pulcherrima'];

/** Function declarations: what Alice may do during a live conversation. */
const TOOLS = [
  { name: 'remember', description: 'Save a lasting fact about the user: ALWAYS call it when they tell you something about themselves worth knowing later (their car, family, job, home, likes, plans, preferences) or say remember. Write it as a short standalone sentence, e.g. "Drives a 2021 Dodge Charger".', parameters: { type: 'OBJECT', properties: { fact: { type: 'STRING' } }, required: ['fact'] } },
  { name: 'reminder', description: 'Create an iPhone reminder. due is ISO 8601 with the user UTC offset.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, due: { type: 'STRING' } }, required: ['title'] } },
  { name: 'event', description: 'Add a calendar event.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, start: { type: 'STRING' }, durationMin: { type: 'NUMBER' } }, required: ['title', 'start'] } },
  { name: 'email', description: 'Open an email draft for the user to send.', parameters: { type: 'OBJECT', properties: { to: { type: 'STRING' }, subject: { type: 'STRING' }, body: { type: 'STRING' } }, required: ['subject', 'body'] } },
  { name: 'navigate', description: 'Start Apple Maps directions.', parameters: { type: 'OBJECT', properties: { destination: { type: 'STRING' }, mode: { type: 'STRING', enum: ['walking', 'driving', 'transit'] } }, required: ['destination'] } },
  { name: 'save_spot', description: 'Remember the user\'s current location, e.g. where they parked. label defaults to car.', parameters: { type: 'OBJECT', properties: { label: { type: 'STRING' } } } },
  { name: 'find_spot', description: 'Where did I park / take me back to a saved spot. Opens walking directions.', parameters: { type: 'OBJECT', properties: { label: { type: 'STRING' } } } },
  { name: 'stop_listening', description: 'End the conversation and stop listening when the user says stop listening, go to sleep, that\'s all, be quiet, or similar.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'report_problem', description: 'Add a problem report to Alice\'s diagnostic log, in the user\'s words, when they say something went wrong ("log that", "that didn\'t work", "note a problem").', parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] } },
  { name: 'weather', description: 'Live weather and forecast. Omit place for the user\'s current location.', parameters: { type: 'OBJECT', properties: { place: { type: 'STRING' }, days: { type: 'NUMBER' } } } },
  { name: 'where_am_i', description: "Tell the user where they are (street/city).", parameters: { type: 'OBJECT', properties: {} } },
  { name: 'agenda', description: 'What is coming up: calendar events and reminders for the next N days (default 7). Use for "what do I have today/this week/on Tuesday".', parameters: { type: 'OBJECT', properties: { days: { type: 'NUMBER' } } } },
  { name: 'glasses_status', description: 'Glasses connection, battery and photo count.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'document', description: 'Create a document (letter, report, list, plan, resume...) as a PDF. content is the COMPLETE document in Markdown.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, content: { type: 'STRING' }, format: { type: 'STRING', enum: ['pdf', 'text'] } }, required: ['title', 'content'] } },
];

const BARGE_RMS = 0.045; // phone-mic loudness of a close voice; Alice's echo from the glasses is well below this

class LiveSession {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private queue: AudioBufferQueueSourceNode | null = null;
  private recorder: AudioRecorder | null = null;
  private pending = 0;
  private turnDone = true;
  private handle: string | undefined;
  private endpoints: string[] = [];
  private model = '';
  private youBuf = '';
  private aliceBuf = '';
  private stopping = false;
  private t0 = 0;
  connectMs = 0;
  private subs = new Set<Sub>();
  private ev = { state: (st: LiveState, d?: string) => this.subs.forEach((x) => x.state?.(st, d)), line: (l: LiveLine) => { this.lines = [l, ...this.lines].slice(0, 60); this.subs.forEach((x) => x.line?.(l)); } };
  state: LiveState = 'off';
  detail = '';
  lines: LiveLine[] = [];

  /** Screens subscribe while visible; the conversation itself keeps running (other tabs, locked phone). */
  subscribe(sub: Sub) { this.subs.add(sub); return () => { this.subs.delete(sub); }; }

  spokeAt = 0;
  private loudFrames = 0;
  private bargeUntil = 0;
  private muted = false; // drop the rest of a reply you cut off
  private set(s: LiveState, detail?: string) {
    if (s === 'error' || (s === 'listening' && this.state === 'connecting')) note(s === 'error' ? 'live-error' : 'live-connected', { detail, ms: Date.now() - this.t0 }); if (this.state === 'speaking' && s !== 'speaking') this.spokeAt = Date.now(); setPhoneMic(this.useMic && s !== 'off' && s !== 'error'); this.state = s; this.detail = detail ?? ''; this.ev.state(s, detail); }

  /** mic:false = no phone microphone; the words come from the glasses' own mic via sendText (glasses button). */
  useMic = true;
  async start(opts: { mic?: boolean } = {}) {
    if (this.state !== 'off' && this.state !== 'error') return;
    this.useMic = opts.mic !== false;
    this.stopping = false; this.handle = undefined;
    this.set('connecting');
    this.t0 = Date.now();
    try {
      if (this.useMic) {
        const perm = await AudioManager.requestRecordingPermissions();
        if (perm !== 'Granted') throw new Error('Microphone permission is needed.');
      }
      // Voice-chat session: Bluetooth glasses/headset mic + speaker, echo cancellation, loudspeaker otherwise.
      // Keep Bluetooth headphones (the glasses) in high-quality music mode (A2DP): never ask iOS for the
      // headset's call mic (HFP), which would drop Alice to phone-call quality. The mic is the phone's,
      // and the glasses' own mic reaches Alice separately over their data channel. Mode 'default', not
      // 'voiceChat' (voiceChat turns call mode back on); echo cancellation comes from the recorder's voice processing.
      AudioManager.setSystemOptions({ ios: { category: 'playAndRecord', mode: 'default', options: ['allowBluetoothA2DP', 'defaultToSpeaker', 'duckOthers'] } });
      await AudioManager.setAudioSessionActivity(true);
      const t = await liveSession();
      this.endpoints = t.endpoints; this.model = t.model;
      this.ctx = new AudioContext({ sampleRate: 24000 });
      this.newQueue();
      this.connect(0);
    } catch (e: any) {
      this.set('error', String(e?.message ?? e));
      await this.teardown();
    }
  }

  private newQueue() {
    if (!this.ctx) return;
    try { this.queue?.stop(); } catch {}
    const q = this.ctx.createBufferQueueSource();
    q.connect(this.ctx.destination);
    q.onbufferended = () => { this.pending = Math.max(0, this.pending - 1); if (!this.pending && this.turnDone && this.state === 'speaking') this.set('listening'); };
    q.start();
    this.queue = q; this.pending = 0;
  }

  private setupMessage() {
    const s = getSettings();
    const mode = allModes().find((m) => m.id === s.activeMode) ?? allModes()[0];
    const voice = NATURAL.includes((s.modeVoices[mode.id] || s.voice)) ? (s.modeVoices[mode.id] || s.voice) : 'Sulafat';
    const tone = VOICE_STYLES.find((v) => v.id === s.voiceStyle);
    const prompt = [
      mode.prompt,
      tone && tone.id !== 'natural' ? `Your speaking voice: ${tone.style}.` : '',
      mode.id === 'translator' ? '' : 'Always speak English unless the user clearly speaks to you in another language or asks you to translate.',
      'This is a live spoken conversation through smart glasses. Speak naturally and briefly (1-3 sentences) unless asked for detail. The user can interrupt you.',
      mode.id === 'translator' ? `Translate everything the user says into ${s.translateTo} and speak only the translation.` : '',
      'Use the tools to take actions (reminders, events, email drafts, directions, documents, memory). Never claim an action is done until the tool result says so.',
      'When the user mentions a meeting, appointment or plan with a date ("I have a meeting Tuesday"), add it with the event tool; if no time was given, ask what time first. Use the reminder tool for to-dos with a time. Use the agenda tool when asked what is coming up.',
      `Today is ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}. For news, sports, scores, prices, people in the news, releases or anything that may have happened or changed recently, ALWAYS use Google Search first and answer from what you find. Never say you cannot access current information.`,
      s.memoryEnabled ? memory.prompt() : `Current local time: ${new Date().toString()}`,
    ].filter(Boolean).join('\n\n');
    return { setup: {
      model: `models/${this.model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: mode.id === 'translator' ? undefined : (s.voiceLanguage || 'en-US'), voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      systemInstruction: { parts: [{ text: prompt }] },
      tools: [{ googleSearch: {} }, { functionDeclarations: TOOLS }],
      inputAudioTranscription: {}, outputAudioTranscription: {},
      sessionResumption: this.handle ? { handle: this.handle } : {},
      contextWindowCompression: { slidingWindow: {} },
      // Fluid turn-taking: answer ~0.6 s after you stop; need a clear voice (not Alice's echo) to interrupt her.
      realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: 'START_SENSITIVITY_LOW', endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH', prefixPaddingMs: 200, silenceDurationMs: 600 } },
    } };
  }

  private connect(i: number) {
    const url = this.endpoints[i];
    if (!url) { this.set('error', "Couldn't reach Alice's live voice. Check your internet, or turn off Live conversation in Settings to ask one question at a time."); this.teardown(); return; }
    let ready = false;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer'; // Google sends JSON in binary frames
    this.ws = ws;
    const guard = setTimeout(() => { if (!ready && this.ws === ws) { try { ws.close(); } catch {} } }, 12000);
    ws.onopen = () => ws.send(JSON.stringify(this.setupMessage()));
    ws.onmessage = (e) => this.onMessage(frameText(e.data), () => { ready = true; clearTimeout(guard); });
    ws.onerror = () => {};
    ws.onclose = () => {
      clearTimeout(guard);
      if (this.ws !== ws || this.stopping) return;
      if (!ready) return this.connect(i + 1); // try the other API version
      if (this.handle) { this.set('connecting', 'Reconnecting…'); this.connect(i); } // resume after the ~10 min connection limit
      else { this.set('error', 'The conversation ended.'); this.teardown(); }
    };
  }

  private async startMic() {
    if (this.recorder) return;
    const rec = new AudioRecorder({ iosVoiceProcessing: true }); // echo cancellation: Alice won't hear herself
    rec.onAudioReady({ sampleRate: 16000, bufferLength: 1600, channelCount: 1 }, ({ buffer }) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== 1) return;
      let f: Float32Array = buffer.getChannelData(0);
      if (buffer.sampleRate !== 16000) f = resampleLinear(f, buffer.sampleRate, 16000);
      // While Alice talks, only YOUR voice gets through: her own voice leaking back (quiet at the phone mic) is
      // dropped, a clear, close voice ("stop", "shut up", a new question) passes and interrupts her.
      if (this.state === 'speaking' || Date.now() - this.spokeAt < 500) {
        let e = 0; for (let i = 0; i < f.length; i++) e += f[i] * f[i];
        const rms = Math.sqrt(e / Math.max(1, f.length));
        if (rms > BARGE_RMS) this.loudFrames++; else this.loudFrames = 0;
        if (this.loudFrames >= 2) this.bargeUntil = Date.now() + 2500;
        if (Date.now() > this.bargeUntil) return;
      }
      const pcm = floatToPcm16(f);
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: Buffer.from(pcm.buffer as ArrayBuffer, pcm.byteOffset, pcm.byteLength).toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
    });
    const r = await rec.start();
    if ((r as any)?.status === 'error') throw new Error((r as any).message ?? 'Microphone did not start.');
    this.recorder = rec;
  }

  private async onMessage(raw: string, markReady: () => void) {
    let m: any; try { m = JSON.parse(raw); } catch { return; }
    if (m.setupComplete) {
      markReady();
      try { if (this.useMic) await this.startMic(); this.connectMs = Date.now() - this.t0; this.set('listening', `Connected in ${(this.connectMs / 1000).toFixed(1)} s`); }
      catch (e: any) { this.set('error', String(e?.message ?? e)); this.stop(); }
      return;
    }
    if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) this.handle = m.sessionResumptionUpdate.newHandle;
    if (m.goAway) { try { this.ws?.close(); } catch {} return; } // onclose resumes with the handle
    if (m.toolCall?.functionCalls?.length) { this.handleTools(m.toolCall.functionCalls); return; }
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.interrupted) { this.muted = false; this.newQueue(); this.flushAlice(); this.set('listening'); }
    if (sc.inputTranscription?.text) { this.youBuf += sc.inputTranscription.text; if (this.state === 'listening') this.set('thinking'); }
    if (sc.outputTranscription?.text) this.aliceBuf += sc.outputTranscription.text;
    for (const p of sc.modelTurn?.parts ?? []) {
      if (!p.inlineData?.data || !this.ctx || !this.queue || this.muted) continue;
      this.turnDone = false;
      const rate = Number(/rate=(\d+)/.exec(p.inlineData.mimeType ?? '')?.[1] ?? 24000);
      try {
        const buf = await decodePCMInBase64(p.inlineData.data, rate, 1);
        this.queue.enqueueBuffer(buf); this.pending++;
        if (this.state !== 'speaking') { this.flushYou(); this.set('speaking'); }
      } catch {}
    }
    if (sc.turnComplete) {
      this.turnDone = true;
      if (this.muted) { this.muted = false; this.aliceBuf = ''; }
      this.flushYou(); this.flushAlice();
      if (!this.pending && this.state !== 'listening') this.set('listening');
    }
  }

  private flushYou() { const t = this.youBuf.trim(); this.youBuf = ''; if (t) { this.ev.line({ who: 'you', text: t, t: Date.now() }); if (getSettings().memoryEnabled) memory.turn('user', t); } }
  private flushAlice() { const t = this.aliceBuf.trim(); this.aliceBuf = ''; if (t) { this.ev.line({ who: 'alice', text: t, t: Date.now() }); if (getSettings().memoryEnabled) memory.turn('assistant', t); } }

  private async handleTools(calls: { id: string; name: string; args?: any }[]) {
    this.set('thinking');
    const modes = allModes().map((m) => m.id);
    const functionResponses = [];
    for (const c of calls) {
      const a = validateAction({ type: c.name, ...(c.args ?? {}) }, modes) as Action | null;
      let result: string;
      try { result = a ? await runAction(a) : `Could not do ${c.name}: missing or invalid details.`; }
      catch (e: any) { result = `Could not do ${c.name}: ${e?.message ?? e}`; }
      this.ev.line({ who: 'done', text: result, t: Date.now() });
      functionResponses.push({ id: c.id, name: c.name, response: { result } });
    }
    try { this.ws?.send(JSON.stringify({ toolResponse: { functionResponses } })); } catch {}
  }

  /** Show Alice a photo (glasses photo or phone camera); ask about it by voice. */
  sendImage(jpegBase64: string) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify({ realtimeInput: { video: { data: jpegBase64, mimeType: 'image/jpeg' } } }));
    return true;
  }

  /** Type to Alice during a live conversation. */
  sendText(text: string) {
    if (this.ws?.readyState !== 1 || !text.trim()) return false;
    this.ws.send(JSON.stringify({ realtimeInput: { text: text.trim() } }));
    return true;
  }

  /** Cut Alice off mid-reply (glasses button pressed while she talks): silence now, drop the rest of this answer. */
  cutOff() {
    if (this.state !== 'speaking' && this.state !== 'thinking') return;
    this.muted = true; this.newQueue(); this.flushAlice(); this.set('listening');
  }

  async stop() {
    this.stopping = true;
    this.flushYou(); this.flushAlice();
    await this.teardown();
    this.set('off');
  }

  private async teardown() {
    const ws = this.ws; this.ws = null;
    try { ws?.close(); } catch {}
    try { this.recorder?.clearOnAudioReady(); await this.recorder?.stop(); } catch {}
    this.recorder = null;
    try { this.queue?.stop(); } catch {}
    this.queue = null;
    try { await this.ctx?.close(); } catch {}
    this.ctx = null;
    try { await AudioManager.setAudioSessionActivity(false); } catch {}
  }
}

export const live = new LiveSession();

/** Wait until the live conversation is connected (or failed). */
export async function liveReady(ms = 10000): Promise<boolean> {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (live.state === 'listening' || live.state === 'speaking' || live.state === 'thinking') return true;
    if (live.state === 'error' || live.state === 'off') return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

// "Stop listening" (voice) ends the live conversation too, after Alice finishes her goodbye.
whenSleeping(() => { if (live.state !== 'off') setTimeout(() => live.stop(), live.state === 'speaking' ? 2500 : 0); });

/**
 * Voice preview that sounds exactly like the conversation: plays a line through the SAME live voice
 * (the separate text-to-speech voice used for previews before sounds noticeably different).
 * Uses a running conversation if there is one, otherwise opens a short one without the microphone.
 */
export async function previewLiveVoice(line = "Hi, I'm Alice. This is how I sound in our conversations.") {
  const fresh = live.state === 'off' || live.state === 'error';
  if (!fresh) { await live.stop(); } // restart so the new voice/style is used
  await live.start({ mic: false });
  if (!(await liveReady())) return false;
  live.sendText(`Say exactly this, in your own voice and style, and nothing else: "${line}"`);
  const t = Date.now();
  while (Date.now() - t < 8000 && live.state !== 'speaking') await new Promise((r) => setTimeout(r, 100));
  while (Date.now() - t < 15000 && live.state === 'speaking') await new Promise((r) => setTimeout(r, 150));
  if (fresh) await live.stop();
  return true;
}
