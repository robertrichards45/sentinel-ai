/**
 * Talk to Alice through the glasses themselves (verified protocol, see src/protocol.ts):
 * trigger the glasses' AI (button / wake word) -> the glasses stream your voice from THEIR
 * microphone over Bluetooth as Opus -> Alice answers.
 *  - During a live conversation: the words are transcribed and sent into the conversation
 *    (Alice replies in her live voice).
 *  - Otherwise: the recording goes straight to the AI in one call, and Alice speaks the answer.
 * Runs app-wide (any tab, and in the background while connected), not only on the Talk screen.
 */
import { Buffer } from 'buffer';
import { glasses } from './ble';
import { opusToOgg } from './oggOpus';
import { ask, Exchange } from './assistant';
import { transcribeAudio } from './ai';
import { live } from './live';
import { getSettings } from './settings';
import { runSpeakerTestIfArmed } from './speakerTest';

type Listener = { state?: (s: 'listening' | 'thinking' | 'idle') => void; exchange?: (e: Exchange) => void; error?: (m: string) => void };
const listeners = new Set<Listener>();
export const onGlassesVoice = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
const emit = <K extends keyof Listener>(k: K, v: Parameters<NonNullable<Listener[K]>>[0]) => listeners.forEach((l) => (l[k] as any)?.(v));

let recording = false;
let frames: Uint8Array[] = [];
let busy = false;
export const glassesVoiceActive = () => recording;

async function finish() {
  if (!recording) return;
  recording = false;
  const f = frames; frames = [];
  if (getSettings().speakerTestArmed) { emit('state', 'idle'); runSpeakerTestIfArmed(); return; } // test turn: no AI reply, so only the glasses could make sound
  if (f.length < 5 || getSettings().privacyMode) { emit('state', 'idle'); return; } // < 0.2 s: nothing said
  if (busy) return; // one turn at a time
  busy = true; emit('state', 'thinking');
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
  } finally {
    busy = false; emit('state', 'idle');
  }
}

glasses.on((e: any) => {
  if (e.kind === 'voice') {
    if (e.on) { recording = true; frames = []; emit('state', 'listening'); }
    else finish();
  } else if (e.kind === 'voiceAudio') {
    if (!recording) { recording = true; frames = []; emit('state', 'listening'); } // start record missed
    frames.push(...e.frames);
  } else if (e.kind === 'voiceEnd') {
    finish();
  }
});
