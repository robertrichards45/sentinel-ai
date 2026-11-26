import { note } from './diary';
/**
 * Talk to Alice through the glasses themselves (verified protocol, see src/protocol.ts and DIAGNOSTIC_LOG 22):
 * press the glasses button -> the glasses stream your voice from THEIR microphone over Bluetooth as Opus -> Alice answers.
 *
 * With "Conversation through the glasses" on, Alice drives the glasses the way the official app does:
 *   button pressed -> ackButton + micOn -> Alice notices when you stop talking -> micOff -> answer
 *   -> micOn again for a follow-up -> if you say nothing for a few seconds -> micOff + endSession.
 * With it off, Alice only listens to whatever the glasses send by themselves (as in 0.7).
 * Runs app-wide (any tab, and in the background while connected).
 */
import { Buffer } from 'buffer';
import { glasses } from './ble';
import { opusToOgg } from './oggOpus';
import { ask, Exchange } from './assistant';
import { transcribeAudio } from './ai';
import { live, liveReady } from './live';
import { getSettings } from './settings';
import { onSpeaking } from './voice';
import { setSessionCheck } from './micState';
import { isAsleep, wakeUp, whenSleeping } from './quiet';

type Listener = { state?: (s: 'listening' | 'thinking' | 'idle') => void; exchange?: (e: Exchange) => void; error?: (m: string) => void };
const listeners = new Set<Listener>();
export const onGlassesVoice = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
const emit = <K extends keyof Listener>(k: K, v: Parameters<NonNullable<Listener[K]>>[0]) => listeners.forEach((l) => (l[k] as any)?.(v));

const FRAME_MS = 40;
const SILENCE_END_MS = 1200; // pause that ends your turn
const FOLLOW_UP_MS = 7000; // how long Alice waits for a follow-up before ending the conversation
const MAX_TURN_MS = 30000;

let recording = false;
let frames: Uint8Array[] = [];
let session = false; // Alice is driving the glasses' mic (conversation mode)
let heard = false; // this session produced at least one turn
let processing = false; // a turn is being answered; ignore new audio until it's done
let liveByGlasses = false; // the live conversation was opened for the glasses button (no phone mic)
let liveIdle: ReturnType<typeof setTimeout> | null = null;
let spoke = 0; // ms of speech in this turn
let quiet = 0; // ms of trailing silence
let followUpTimer: ReturnType<typeof setTimeout> | null = null;
export const glassesVoiceActive = () => recording;
/** A glasses-button conversation is in progress (the glasses keep their busy flag up the whole time). */
export const glassesSessionActive = () => session || recording || processing;

const drive = () => getSettings().glassesConversation;
const cmd = (c: Parameters<typeof glasses.glassesCommand>[0]) => glasses.glassesCommand(c).catch(() => {});
const isSilent = (f: Uint8Array) => f.length <= 3; // the glasses send 1-byte frames when nothing is said
let speaking = false;
onSpeaking((on) => { speaking = on; });

function startTurn() {
  recording = true; frames = []; spoke = 0; quiet = 0;
  emit('state', 'listening');
}

function endSession() {
  if (followUpTimer) { clearTimeout(followUpTimer); followUpTimer = null; }
  // Close the glasses' live conversation after 90 s without use (saves AI cost; reopening takes ~1.5 s).
  if (liveByGlasses) { if (liveIdle) clearTimeout(liveIdle); liveIdle = setTimeout(() => { if (liveByGlasses && !session) { liveByGlasses = false; live.stop(); } }, 90000); }
  if (!session) return;
  session = false;
  cmd('micOff').then(() => cmd('endSession'));
}

async function followUp() {
  // After Alice has finished speaking, open the glasses mic again for a follow-up.
  // Wait until Alice has finished talking (normal voice or live conversation), plus a short gap, so the
  // glasses' mic doesn't pick up her own voice.
  while (speaking || live.state === 'speaking' || live.state === 'thinking') await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => setTimeout(r, 500));
  if (!session || isAsleep()) { endSession(); return; }
  await cmd('micOn');
  startTurn();
  followUpTimer = setTimeout(() => { if (recording && spoke === 0) { recording = false; emit('state', 'idle'); endSession(); } }, FOLLOW_UP_MS);
}

async function finish() {
  if (!recording || processing) return;
  recording = false;
  processing = true; // claim the turn before any await, so the glasses' own "mic off" signal doesn't end the session
  if (followUpTimer) { clearTimeout(followUpTimer); followUpTimer = null; }
  try {
    if (session) await cmd('micOff');
    const f = frames; frames = [];
    const said = f.filter((x) => !isSilent(x)).length;
    if (said < 5 || getSettings().privacyMode) { emit('state', 'idle'); endSession(); return; } // nothing said
    heard = true; emit('state', 'thinking');
    const tEnd = Date.now();
    note('glasses-turn', { speechMs: spoke, frames: f.length });
    const audio = { mime: 'audio/ogg', base64: Buffer.from(opusToOgg(f)).toString('base64') };
    // Fast path: answer through the live conversation (streams Alice's voice as it is generated, ~2-3 s)
    // instead of the one-question path (whole answer, then a separate voice step, 5-10 s).
    const useLive = getSettings().liveConversation;
    if (isAsleep()) { emit('state', 'idle'); endSession(); return; }
    if (useLive && (live.state === 'off' || live.state === 'error')) { liveByGlasses = true; live.start({ mic: false }); }
    if (liveIdle) { clearTimeout(liveIdle); liveIdle = null; }
    if (useLive || (live.state !== 'off' && live.state !== 'error')) {
      const [text, ready] = await Promise.all([transcribeAudio(audio), liveReady()]); // in parallel
      const tHeard = Date.now();
      if (text && ready) { live.sendText(text); const first = await waitLiveReply(); note('reply-timing', { path: 'live', transcribeMs: tHeard - tEnd, firstVoiceMs: first ? first - tEnd : null }); }
      else if (text) { const ex = await ask({ text }); emit('exchange', ex); note('reply-timing', { path: 'fallback', liveReady: ready, totalMs: Date.now() - tEnd }); }
      else note('reply-timing', { path: 'live', heard: false, transcribeMs: tHeard - tEnd });
    } else {
      const ex = await ask({ audioData: audio });
      emit('exchange', ex);
      note('reply-timing', { path: 'classic', totalMs: Date.now() - tEnd });
    }
  } catch (e: any) {
    note('glasses-turn-error', { msg: String(e?.message ?? e) });
    emit('error', String(e?.message ?? e));
    endSession();
  } finally {
    processing = false; emit('state', 'idle');
  }
  if (session && !isAsleep()) setTimeout(followUp, 300); else if (isAsleep()) endSession();
}

/** Wait for the live reply to start and finish (or give up after 30 s). */
async function waitLiveReply(): Promise<number | null> {
  const t = Date.now();
  while (Date.now() - t < 8000 && live.state !== 'speaking') await new Promise((r) => setTimeout(r, 100));
  const first = live.state === 'speaking' ? Date.now() : null;
  while (Date.now() - t < 30000 && (live.state === 'speaking' || live.state === 'thinking')) await new Promise((r) => setTimeout(r, 150));
  return first;
}

glasses.on((e: any) => {
  if (e.kind === 'busy' && e.on && drive() && !session && !recording && !processing) {
    // Button pressed: answer it the way the official app does, then switch the glasses mic on.
    wakeUp(); // pressing the button is you asking for Alice
    session = true; heard = false;
    cmd('ackButton').then(() => setTimeout(() => { if (session) cmd('micOn'); }, 300));
  } else if (e.kind === 'busy' && !e.on && session && !recording && !processing && !heard) {
    endSession(); // glasses closed the session before anything was said (or it was only a photo)
  } else if (e.kind === 'voice') {
    if (e.on) { if (!recording && !processing) startTurn(); }
    else finish();
  } else if (e.kind === 'voiceAudio') {
    if (processing) return; // still answering the last turn
    if (isAsleep() && !session) return; // you told her to stop listening
    if (!recording) startTurn(); // start record missed
    frames.push(...e.frames);
    for (const f of e.frames) {
      if (isSilent(f)) quiet += FRAME_MS; else { spoke += FRAME_MS; quiet = 0; if (followUpTimer) { clearTimeout(followUpTimer); followUpTimer = null; } }
    }
    // In conversation mode Alice decides when you've finished (the glasses keep streaming until told to stop).
    if (session && ((spoke >= 300 && quiet >= SILENCE_END_MS) || frames.length * FRAME_MS >= MAX_TURN_MS)) finish();
  } else if (e.kind === 'voiceEnd') {
    finish();
  }
});

setSessionCheck(glassesSessionActive);

// "Stop listening": close the glasses conversation right away and stop the live session it opened.
whenSleeping(() => {
  recording = false; frames = [];
  endSession();
  if (liveByGlasses) { liveByGlasses = false; live.stop(); }
  emit('state', 'idle');
});
