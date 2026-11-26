/**
 * Streams the glasses' microphone straight into the live conversation WHILE you talk: the glasses send Opus,
 * Alice decodes it on the phone (built-in libopus) and forwards 16 kHz audio, so there is no separate
 * speech-to-text step after you stop talking. Decodes everything so far each time and sends only what is new
 * (keeps the decoder's state continuous, so no glitches between chunks).
 */
import { decodeAudioData } from 'react-native-audio-api';
import { opusToOgg } from './oggOpus';
import { live } from './live';

let frames: Uint8Array[] = [];
let sent = 0; // samples already sent
let timer: ReturnType<typeof setInterval> | null = null;
let decoding = false;
let active = false;

async function pump(final = false) {
  if (decoding || !frames.length) return;
  decoding = true;
  try {
    const ogg = opusToOgg(frames);
    const buf = await decodeAudioData(ogg.buffer.slice(ogg.byteOffset, ogg.byteOffset + ogg.byteLength) as ArrayBuffer, 16000);
    const pcm = buf.getChannelData(0);
    // Hold back the last 80 ms until the end (the decoder may still revise its tail).
    const upto = final ? pcm.length : Math.max(sent, pcm.length - 1280);
    if (upto > sent) { live.sendAudio16k(pcm.subarray(sent, upto)); sent = upto; }
  } catch {}
  decoding = false;
}

/** Start streaming a new turn (live must be connected). */
export function streamStart() {
  frames = []; sent = 0; active = true;
  if (timer) clearInterval(timer);
  timer = setInterval(() => { if (active) pump(); }, 250);
}
export function streamFrames(f: Uint8Array[]) { if (active) frames.push(...f); }
/** You stopped talking: send the rest and tell the AI to answer now. */
export async function streamEnd() {
  if (!active) return;
  active = false;
  if (timer) { clearInterval(timer); timer = null; }
  while (decoding) await new Promise((r) => setTimeout(r, 20));
  await pump(true);
  live.endAudio();
}
export const streaming = () => active;
