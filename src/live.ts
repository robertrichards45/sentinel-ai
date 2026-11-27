import { note } from './diary';
import { whenSleeping, goToSleep } from './quiet';

/** Phrases that end the conversation immediately, whatever the AI makes of them. */
export const STOP_WORDS = /\b(stop listening|stop listening to me|go to sleep|that'?s all(?: for now)?|good ?bye,? alice|bye,? alice|alice,? stop|be quiet|quit listening|you can stop|stop the conversation|end the conversation)\b/i;
import { setLiveRestarter } from './liveRestart';
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
import { peopleNames } from './people';
import { vocabHint } from './vocab';
import { runAction, byVoice } from './actions';
import { allModes } from './modeStore';
import { getSettings } from './settings';
import { memory } from './memory';
import { floatToPcm16, resampleLinear, frameText, NoiseGate } from './liveCore';
import { VOICE_STYLES, setLiveSpeaker } from './voice';

export type LiveState = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
export type LiveLine = { who: 'you' | 'alice' | 'done'; text: string; t: number };
type Events = { state: (s: LiveState, detail?: string) => void; line: (l: LiveLine) => void };
type Sub = Partial<Events>;

const NATURAL = ['Sulafat', 'Aoede', 'Laomedeia', 'Achernar', 'Vindemiatrix', 'Despina', 'Gacrux', 'Kore', 'Callirrhoe', 'Erinome', 'Leda', 'Zephyr', 'Autonoe', 'Pulcherrima'];

/** Function declarations: what Alice may do during a live conversation. */
const TOOLS = [
  { name: 'remember', description: 'Save a lasting fact about the user: ALWAYS call it when they tell you something about themselves worth knowing later (their car, family, job, home, likes, plans, preferences) or say remember. Write it as a short standalone sentence, e.g. "Drives a 2021 Dodge Charger".', parameters: { type: 'OBJECT', properties: { fact: { type: 'STRING' } }, required: ['fact'] } },
  { name: 'reminder', description: 'Create an iPhone reminder. due is ISO 8601 with the user UTC offset.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, due: { type: 'STRING' } }, required: ['title'] } },
  { name: 'event', description: 'Add an event to the iPhone Calendar right away (no need to ask first; it can be undone). start: ISO 8601 with the local UTC offset, worked out from today\'s date. place (optional): where it is; adds a time-to-leave alert. Read back the title, day and time from the result.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, start: { type: 'STRING' }, durationMin: { type: 'NUMBER' }, place: { type: 'STRING' } }, required: ['title', 'start'] } },
  { name: 'email', description: 'Open an email draft for the user to send.', parameters: { type: 'OBJECT', properties: { to: { type: 'STRING' }, subject: { type: 'STRING' }, body: { type: 'STRING' } }, required: ['subject', 'body'] } },
  { name: 'navigate', description: 'Start Apple Maps directions.', parameters: { type: 'OBJECT', properties: { destination: { type: 'STRING' }, mode: { type: 'STRING', enum: ['walking', 'driving', 'transit'] } }, required: ['destination'] } },
  { name: 'save_spot', description: 'Remember the user\'s current location, e.g. where they parked. label defaults to car.', parameters: { type: 'OBJECT', properties: { label: { type: 'STRING' } } } },
  { name: 'find_spot', description: 'Where did I park / take me back to a saved spot. Opens walking directions.', parameters: { type: 'OBJECT', properties: { label: { type: 'STRING' } } } },
  { name: 'place_reminder', description: 'Reminder that goes off when the user arrives at or leaves a place ("remind me when I get home"). place: home, work, a saved spot, an address or a store name.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, place: { type: 'STRING' }, when: { type: 'STRING', enum: ['arrive', 'leave'] } }, required: ['title', 'place'] } },
  { name: 'what_you_know', description: 'List what Alice remembers about the user ("what do you know about me?").', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'forget', description: 'Forget a remembered fact. match: the exact fact text as it appears in what you know.', parameters: { type: 'OBJECT', properties: { match: { type: 'STRING' } }, required: ['match'] } },
  { name: 'take_notes', description: 'Meeting notes. action start: Alice goes quiet, records and transcribes the meeting; stop: writes summary, decisions and action items. Say the result back.', parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['start', 'stop'] }, title: { type: 'STRING' } }, required: ['action'] } },
  { name: 'directions', description: 'Spoken turn-by-turn directions through the glasses from where the user is now (the app knows their location). to: address, business or place; mode: driving or walking. If the result lists options and asks which one, read them, let the user pick, then call again with the same to and choice 1-3. Otherwise read back the overview.', parameters: { type: 'OBJECT', properties: { to: { type: 'STRING' }, mode: { type: 'STRING', enum: ['driving', 'walking'] }, choice: { type: 'NUMBER' } }, required: ['to'] } },
  { name: 'stop_directions', description: 'Stop turn-by-turn directions.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'catch_up', description: 'What did I miss: rest of today, next events, timers, weather. Say the result.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'person_note', description: 'Remember something about a person the user introduces or describes ("this is Mike from work", "Sarah\'s birthday is May 3").', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['name', 'note'] } },
  { name: 'person_info', description: 'What Alice knows about a person ("who is Mike?", "what do I know about Sarah?").', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] } },
  { name: 'read_this', description: 'Read an article or text aloud: what the user copied, or url. summarize true to sum it up instead. If it says it is reading, just say okay.', parameters: { type: 'OBJECT', properties: { url: { type: 'STRING' }, summarize: { type: 'BOOLEAN' } } } },
  { name: 'daily_recap', description: 'Recap the user\'s day (calendar, finished reminders, notes, meetings). Say the result.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'learn_word', description: 'Learn how to hear and spell a name or word the user says ("learn the name Kylee, K-Y-L-E-E"), or one you got wrong.', parameters: { type: 'OBJECT', properties: { word: { type: 'STRING' } }, required: ['word'] } },
  { name: 'undo_last', description: 'Undo the event or reminder just added ("undo", "remove that").', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'scan_doc', description: 'Scan a paper document (one or more pages) into a PDF with its text, saved in Files. Say the result.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'photo_file', description: 'Take a picture (flyer, appointment card, ticket, receipt, whiteboard...) and file it: target calendar, reminder, note or auto. fromLibrary true to pick an existing photo. Say the result.', parameters: { type: 'OBJECT', properties: { target: { type: 'STRING', enum: ['auto', 'calendar', 'reminder', 'note'] }, fromLibrary: { type: 'BOOLEAN' } } } },
  { name: 'run_shortcut', description: 'Run one of the user\'s Siri Shortcuts by name (e.g. smart-home lights, thermostat, scenes).', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] } },
  { name: 'list_add', description: 'Add items to a list in iPhone Reminders (shopping, to-do, any name; created if missing).', parameters: { type: 'OBJECT', properties: { list: { type: 'STRING' }, items: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['list', 'items'] } },
  { name: 'list_read', description: 'Read what is on a list.', parameters: { type: 'OBJECT', properties: { list: { type: 'STRING' } }, required: ['list'] } },
  { name: 'list_check', description: 'Check off / remove an item from a list.', parameters: { type: 'OBJECT', properties: { list: { type: 'STRING' }, item: { type: 'STRING' } }, required: ['list', 'item'] } },
  { name: 'emergency', description: 'User needs help: prepares a text with their location to their emergency contacts.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'call_911', description: 'Call 911. ONLY after the user clearly says yes to calling 911.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'call', description: 'Phone call to a contact ("call Mom").', parameters: { type: 'OBJECT', properties: { who: { type: 'STRING' } }, required: ['who'] } },
  { name: 'text', description: 'Text message to a contact; opens Messages filled in.', parameters: { type: 'OBJECT', properties: { who: { type: 'STRING' }, body: { type: 'STRING' } }, required: ['who', 'body'] } },
  { name: 'timer', description: 'Countdown timer in seconds, optional label.', parameters: { type: 'OBJECT', properties: { seconds: { type: 'NUMBER' }, label: { type: 'STRING' } }, required: ['seconds'] } },
  { name: 'alarm', description: 'Alarm at a local date-time (ISO 8601 with offset), optional label.', parameters: { type: 'OBJECT', properties: { at: { type: 'STRING' }, label: { type: 'STRING' } }, required: ['at'] } },
  { name: 'show_camera', description: 'Turn the live camera view on so you can SEE: use it when the user asks what they are looking at, to read something, identify something, or "look at this". Then describe what you see in the incoming frames. on:false to close it.', parameters: { type: 'OBJECT', properties: { on: { type: 'BOOLEAN' } }, required: ['on'] } },
  { name: 'cancel_timers', description: 'Cancel the timers and alarms Alice set.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'play_music', description: 'Play an artist, song, album or playlist. app: apple (default) or spotify.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' }, app: { type: 'STRING' } }, required: ['query'] } },
  { name: 'translator', description: 'Turn the two-way interpreter on (with a language) or off.', parameters: { type: 'OBJECT', properties: { language: { type: 'STRING' }, on: { type: 'BOOLEAN' } }, required: ['on'] } },
  { name: 'briefing', description: 'Daily briefing: today\'s schedule, the weather here and the top headlines. Use for "brief me", "good morning", "what does my day look like".', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'look_up', description: 'Search the web for current, live information: news, sports scores, stock and crypto prices, events, opening hours, people in the news, anything recent or that changes. Use it whenever you are not sure your knowledge is current.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
  { name: 'stop_listening', description: 'End the conversation and stop listening when the user says stop listening, go to sleep, that\'s all, be quiet, or similar.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'report_problem', description: 'Add a problem report to Alice\'s diagnostic log, in the user\'s words, when they say something went wrong ("log that", "that didn\'t work", "note a problem").', parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] } },
  { name: 'weather', description: 'Live weather and forecast. Omit place for the user\'s current location.', parameters: { type: 'OBJECT', properties: { place: { type: 'STRING' }, days: { type: 'NUMBER' } } } },
  { name: 'where_am_i', description: "Tell the user where they are (street/city).", parameters: { type: 'OBJECT', properties: {} } },
  { name: 'agenda', description: 'What is coming up: calendar events and reminders for the next N days (default 7). Use for "what do I have today/this week/on Tuesday".', parameters: { type: 'OBJECT', properties: { days: { type: 'NUMBER' } } } },
  { name: 'glasses_status', description: 'Glasses connection, battery and photo count.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'recall', description: 'Search everything the user and Alice said in past conversations (any day). query: topic words and/or a time ("yesterday", "last week"). last: N for "the last N things I said". who: user, assistant or any.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' }, last: { type: 'NUMBER' }, who: { type: 'STRING', enum: ['user', 'assistant', 'any'] } } } },
  { name: 'shop', description: 'Order or buy something from a store (Walmart, Target, Amazon, Instacart, Kroger, Costco, Chewy...): opens the store app at that item. Remembers the usual store, brand and pickup/delivery, so only pass what the user said. The user confirms payment themselves.', parameters: { type: 'OBJECT', properties: { item: { type: 'STRING' }, store: { type: 'STRING' }, fulfillment: { type: 'STRING', enum: ['delivery', 'pickup'] }, brand: { type: 'STRING' } }, required: ['item'] } },
  { name: 'self_check', description: 'Run a self-check and repair ("fix yourself", "something is wrong with you"): permissions, server, glasses, wake word. Say the result.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'open_app', description: 'Open an app on the iPhone by name (Spotify, Instagram, Uber, Calendar, Settings...).', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] } },
  { name: 'make_file', description: 'Create a real file: a resume, letter, report, form, plan (word or pdf), a spreadsheet/budget/tracker (excel) or a presentation (powerpoint). It looks up and follows any official standard (e.g. federal resume / USAJOBS rules) and uses a file the user just gave you. request: everything the user asked for, in detail. Say the result; never read the document aloud.', parameters: { type: 'OBJECT', properties: { kind: { type: 'STRING', enum: ['word', 'pdf', 'excel', 'powerpoint'] }, request: { type: 'STRING' }, title: { type: 'STRING' } }, required: ['kind', 'request'] } },
];

const BARGE_RMS = 0.045; // phone-mic loudness of a close voice; Alice's echo from the glasses is well below this

class LiveSession {
  /** 'speaker' = a voice-only session that reads text aloud word for word (no tools, no memory). */
  constructor(readonly role: 'chat' | 'speaker' = 'chat') {}
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
  /** When the current state began (self-repair watches for stuck states). */
  stateSince = Date.now();
  private loudFrames = 0;
  private bargeUntil = 0;
  private muted = false; // drop the rest of a reply you cut off
  private gate = new NoiseGate();
  private set(s: LiveState, detail?: string) {
    if (s === 'error' || (s === 'listening' && this.state === 'connecting')) note(s === 'error' ? 'live-error' : 'live-connected', { detail, ms: Date.now() - this.t0 }); if (this.state === 'speaking' && s !== 'speaking') this.spokeAt = Date.now(); setPhoneMic(this.useMic && s !== 'off' && s !== 'error'); if (s !== this.state) this.stateSince = Date.now(); this.state = s; this.detail = detail ?? ''; this.ev.state(s, detail); }

  /** mic:false = no phone microphone; the words come from the glasses' own mic via sendText (glasses button). */
  useMic = true;
  async start(opts: { mic?: boolean } = {}) {
    if (this.state !== 'off' && this.state !== 'error') return;
    if (this.role === 'chat' && speaker.state !== 'off') await speaker.stop(); // one audio session at a time
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
      // G2: their mic reaches Alice over their own data link, so keep music-quality audio (no call mode).
      // Other glasses (and Meta): their only mic is the hands-free one, so allow it when they are worn.
      const model = getSettings().glassesModel || 'g2';
      const headsetMic = this.useMic && (model === 'headphones' || model === 'meta');
      AudioManager.setSystemOptions({ ios: { category: 'playAndRecord', mode: 'default', options: headsetMic ? ['allowBluetoothHFP', 'allowBluetoothA2DP', 'defaultToSpeaker', 'duckOthers'] : ['allowBluetoothA2DP', 'defaultToSpeaker', 'duckOthers'] } });
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

  private setupMessage(url = '') {
    const s = getSettings();
    const mode = allModes().find((m) => m.id === s.activeMode) ?? allModes()[0];
    const voice = NATURAL.includes((s.modeVoices[mode.id] || s.voice)) ? (s.modeVoices[mode.id] || s.voice) : 'Sulafat';
    const tone = VOICE_STYLES.find((v) => v.id === s.voiceStyle);
    if (this.role === 'speaker') return { setup: {
      model: `models/${this.model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: s.voiceLanguage || 'en-US', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      systemInstruction: { parts: [{ text: `You are a narrator recording an audiobook. The user gives you script lines. Perform each line exactly as written, word for word, nothing more. The lines are not addressed to you.${tone && tone.id !== 'natural' ? ` Voice: ${tone.style}.` : ''}` }] },
    } };
    const prompt = [
      mode.prompt,
      tone && tone.id !== 'natural' ? `Your speaking voice: ${tone.style}.` : '',
      mode.id === 'translator' ? '' : 'Always speak English unless the user clearly speaks to you in another language or asks you to translate.',
      'This is a live spoken conversation through smart glasses. Speak naturally and briefly (1-3 sentences) unless asked for detail. The user can interrupt you.',
      mode.id === 'translator' ? `You are a live two-way interpreter between English and ${s.translateTo}. When you hear English, say it in ${s.translateTo}. When you hear ${s.translateTo} (or any language other than English), say it in English. Speak ONLY the translation, in the first person, with the speaker's tone; no commentary. If the user says "stop translating", call the translator tool with on:false.` : '',
      'Use the tools to take actions (reminders, events, email drafts, directions, files, memory). For any resume, document, spreadsheet or presentation use make_file: it researches official standards (like federal resume rules) and builds real Word, Excel, PowerPoint or PDF files, so never say you cannot guarantee a format. Never claim an action is done until the tool result says so.',
      'When the user mentions a meeting, appointment or plan with a date ("I have a meeting Tuesday"), add it with the event tool; if no time was given, ask what time first. Use the reminder tool for to-dos with a time. Use the agenda tool when asked what is coming up.',
      `Today is ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}. For news, sports, scores, prices, people in the news, releases or anything that may have happened or changed recently, ALWAYS search first (Google Search, or the look_up tool) and answer from what you find. You DO have live internet access; never say you cannot access current information.`,
      (s.shortcuts ?? []).length ? `The user's Siri Shortcuts you can run with run_shortcut (lights, thermostat, scenes and more): ${s.shortcuts.join(', ')}. Match what they ask to the closest one.` : 'The run_shortcut tool runs any Siri Shortcut by name (smart home and other apps).',
      vocabHint(200) ? `Names and words this user often says (their contacts, people, places). Their audio comes through glasses and can be unclear: when a word sounds close to one of these, it IS that one (e.g. a name that sounds like "college" may be "Kylee" if Kylee is listed): ${vocabHint(200)}. If you're unsure of a name, ask them to spell it, then call learn_word.` : 'If you are unsure of a name the user says, ask them to spell it, then call learn_word so you hear it right next time.',
      peopleNames().length ? `People the user has told you about (use person_info for details): ${peopleNames().slice(-40).join(', ')}.` : '',
      'Smart home (lights, thermostat, locks, scenes) and connected apps (remote-start the car, garage door, robot vacuum, etc. — FordPass, Uconnect, myChevrolet, Toyota, Tesla, Ring, Hue and many others add actions to the Shortcuts app): use run_shortcut with the matching Siri Shortcut; if none fits, tell them to make one in the Shortcuts app (it can control anything in the Home app) and add its name in Settings.',
      'If the user says they need help, are hurt, in danger or it is an emergency, call the emergency tool at once, then ask if they want 911. Only call call_911 after they say yes.',
      'Always reply in English unless the user speaks to you in another language. The microphone can pick up TV, music and other people: only respond to speech clearly directed at you; if what you hear is noise, unclear or someone else talking, stay silent. Never switch language because of background noise.',
      s.memoryEnabled ? memory.prompt() : `Current local time: ${new Date().toString()}`,
      s.memoryEnabled && memory.get().history.length ? `Recent conversation with the user (oldest first, may be from earlier sessions):\n${memory.get().history.slice(-30).map((h) => `${h.role === 'user' ? 'User' : 'Alice'}: ${h.text.slice(0, 300)}`).join('\n')}` : '',
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
      // Lets the AI ignore talk that isn't meant for it (TV, other people). Verified accepted on v1alpha (PC test).
      ...(/v1alpha/.test(url) && mode.id !== 'translator' && s.noiseFilter !== false ? { proactivity: { proactiveAudio: true } } : {}),
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
    ws.onopen = () => ws.send(JSON.stringify(this.setupMessage(url)));
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
      // Background noise: send silence instead of the room, unless you're clearly talking (Settings: Ignore background noise).
      const frames = getSettings().noiseFilter === false ? [f] : this.gate.process(f);
      for (const fr of frames.length ? frames : [new Float32Array(f.length)]) {
        const pcm = floatToPcm16(fr);
        ws.send(JSON.stringify({ realtimeInput: { audio: { data: Buffer.from(pcm.buffer as ArrayBuffer, pcm.byteOffset, pcm.byteLength).toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
      }
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
    if (sc.inputTranscription?.text) {
      this.youBuf += sc.inputTranscription.text;
      if (this.state === 'listening') this.set('thinking');
      // "Stop listening" is handled right here, not left to the AI (which once heard it as a request to translate).
      if (this.role === 'chat' && STOP_WORDS.test(this.youBuf)) { note('stop-words', {}); this.flushYou(); goToSleep(); this.stop(); return; }
    }
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

  private flushYou() { const t = this.youBuf.trim(); this.youBuf = ''; if (t && this.role === 'chat') { this.ev.line({ who: 'you', text: t, t: Date.now() }); if (getSettings().memoryEnabled) memory.turn('user', t); } }
  private flushAlice() { const t = this.aliceBuf.trim(); this.aliceBuf = ''; if (t && this.role === 'chat') { this.ev.line({ who: 'alice', text: t, t: Date.now() }); if (getSettings().memoryEnabled) memory.turn('assistant', t); } }

  private async handleTools(calls: { id: string; name: string; args?: any }[]) {
    this.set('thinking');
    const modes = allModes().map((m) => m.id);
    const functionResponses = [];
    const saidRecently = [this.youBuf, ...this.lines.filter((l) => l.who === 'you').slice(0, 2).map((l) => l.text)].join(' ');
    for (const c of calls) {
      // Only switch to the interpreter when the user actually asked for translation.
      const toTranslator = (c.name === 'translator' && c.args?.on) || (c.name === 'set_mode' && c.args?.mode === 'translator');
      if (toTranslator && !/translat|interpret|in (spanish|french|german|italian|portuguese|chinese|japanese|korean|arabic|russian|hindi|vietnamese|tagalog)|speak (spanish|french|german)/i.test(saidRecently)) {
        note('translator-blocked', {});
        functionResponses.push({ id: c.id, name: c.name, response: { result: 'Not done: the user did not ask for translation. Stay in English.' } });
        continue;
      }
      const a = validateAction({ type: c.name, ...(c.args ?? {}) }, modes) as Action | null;
      let result: string;
      try { result = a ? await byVoice(() => runAction(a)) : `Could not do ${c.name}: missing or invalid details.`; }
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
  sendText(text: string, log = false) {
    if (this.ws?.readyState !== 1 || !text.trim()) return false;
    if (log && this.role === 'chat' && getSettings().memoryEnabled) { memory.turn('user', text.trim()); this.ev.line({ who: 'you', text: text.trim(), t: Date.now() }); }
    this.ws.send(JSON.stringify({ realtimeInput: { text: text.trim() } }));
    return true;
  }

  /** Feed audio from somewhere other than the phone mic (the glasses' own microphone), 16 kHz mono floats. */
  sendAudio16k(f: Float32Array) {
    if (this.ws?.readyState !== 1 || !f.length) return false;
    const pcm = floatToPcm16(f);
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: Buffer.from(pcm.buffer as ArrayBuffer, pcm.byteOffset, pcm.byteLength).toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
    return true;
  }
  /** That audio has paused: answer now instead of waiting for more. */
  endAudio() {
    if (this.ws?.readyState !== 1) return;
    this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
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
// ---- One voice everywhere: announcements are spoken by a voice-only live session in the conversation voice.
const speaker = new LiveSession('speaker');
let speakerIdle: ReturnType<typeof setTimeout> | null = null;
let speakerBusy = false;
const waitFor = async (ok: () => boolean, ms: number) => { const t = Date.now(); while (!ok() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 80)); return ok(); };
async function speakLine(text: string, isCurrent: () => boolean): Promise<boolean> {
  return sayImpl(text, isCurrent);
}
setLiveSpeaker({
  say: (text, isCurrent) => sayImpl(text, isCurrent),
  stop() { if (speakerBusy) { try { speaker.cutOff(); } catch {} } },
});
async function sayImpl(text: string, isCurrent: () => boolean): Promise<boolean> {
  {
    // In a conversation that's waiting for you, say it in that same session; otherwise use the speaker session.
    // During a conversation the regular voice says it (injecting text into the chat makes the AI reply to it).
    const useChat = false;
    const target = speaker;
    if (!useChat) {
      if (live.state !== 'off' && live.state !== 'error') return false;
      if (speakerIdle) { clearTimeout(speakerIdle); speakerIdle = null; }
      if (speaker.state === 'off' || speaker.state === 'error') await speaker.start({ mic: false });
      if (!(await waitFor(() => speaker.state === 'listening', 6000))) { await speaker.stop(); return false; }
    }
    if (!isCurrent()) return true;
    speakerBusy = true;
    try {
      target.sendText(`Script line: "${text.replace(/"/g, "'")}"`);
      if (!(await waitFor(() => target.state === 'speaking' || !isCurrent(), 7000))) return false;
      const maxMs = 8000 + text.length * 90;
      await waitFor(() => target.state !== 'speaking' && target.state !== 'thinking' || !isCurrent(), maxMs);
      if (!isCurrent()) target.cutOff();
      return true;
    } finally {
      speakerBusy = false;
      if (!useChat) speakerIdle = setTimeout(() => { if (!speakerBusy) speaker.stop(); }, 45000);
    }
  }
}

export async function previewLiveVoice(line = "Hi, I'm Alice. This is how I sound in our conversations.") {
  // Same voice-only session that says everything outside a conversation, restarted so a new voice applies.
  if (live.state !== 'off' && live.state !== 'error') await live.stop();
  await speaker.stop();
  return speakLine(line, () => true);
}

// A mode change (e.g. translator on/off) restarts a running conversation so the new instructions apply.
setLiveRestarter(async () => { if (live.state === 'off' || live.state === 'error') return; const mic = live.useMic; await live.stop(); await live.start({ mic }); });
