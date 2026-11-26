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
import { live } from './live';
import { getSettings } from './settings';
import { onSpeaking } from './voice';

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
let busy = false;
let session = false; // Alice is driving the glasses' mic (conversation mode)
let heard = false; // this session produced at least one turn
let spoke = 0; // ms of speech in this turn
let quiet = 0; // ms of trailing silence
let followUpTimer: ReturnType<typeof setTimeout> | null = null;
export const glassesVoiceActive = () => recording;

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
  if (!session) return;
  await cmd('micOn');
  startTurn();
  followUpTimer = setTimeout(() => { if (recording && spoke === 0) { recording = false; emit('state', 'idle'); endSession(); } }, FOLLOW_UP_MS);
}

async function finish() {
  if (!recording) return;
  recording = false;
  busy = true; // claim the turn before any await, so the glasses' own "mic off" signal doesn't end the session
  if (followUpTimer) { clearTimeout(followUpTimer); followUpTimer = null; }
  if (session) await cmd('micOff');
  busy = false;
  const f = frames; frames = [];
  const said = f.filter((x) => !isSilent(x)).length;
  if (said < 5 || getSettings().privacyMode) { emit('state', 'idle'); endSession(); return; } // nothing said
  if (busy) return; // one turn at a time
  busy = true; heard = true; emit('state', 'thinking');
  const audio = { mime: 'audio/ogg', base64: Buffer.from(opusToOgg(f)).toString('base64') };
  try {
    if (live.state !== 'off' && live.state !== 'error') {
      const text = await transcribeAudio(audio);
      if (text) live.sendText(text);
    } else {
      const ex = await ask({ audioData: audio });
      emit('exchange', ex);
    }
  } catch (e: any) {
    emit('error', String(e?.message ?? e));
    endSession();
  } finally {
    busy = false; emit('state', 'idle');
  }
  if (session) setTimeout(followUp, 600);
}

glasses.on((e: any) => {
  if (e.kind === 'busy' && e.on && drive() && !session && !recording && !busy) {
    // Button pressed: answer it the way the official app does, then switch the glasses mic on.
    session = true; heard = false;
    cmd('ackButton').then(() => setTimeout(() => { if (session) cmd('micOn'); }, 300));
  } else if (e.kind === 'busy' && !e.on && session && !recording && !busy && !heard) {
    endSession(); // glasses closed the session before anything was said (or it was only a photo)
  } else if (e.kind === 'voice') {
    if (e.on) { if (!recording) startTurn(); }
    else finish();
  } else if (e.kind === 'voiceAudio') {
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
