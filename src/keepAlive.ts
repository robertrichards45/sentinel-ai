/**
 * Keeps "Hey Alice" working with the phone locked or Alice in the background. iOS lets an app keep its
 * microphone open in the background only while its audio is running, and every minute or so it ends a
 * speech-recognition session; restarting one from the background is only allowed while the app is still
 * "playing". So while Hey Alice is on and Alice is in the background, she plays inaudible silence (mixed
 * with your music, nothing you can hear). Costs some battery; iOS shows the orange microphone dot.
 * If you swipe Alice away (force-quit), nothing can keep listening — that's an iOS rule.
 */
import { AppState } from 'react-native';
import { AudioContext } from 'react-native-audio-api';
import { getSettings, onSettings } from './settings';
import { note } from './diary';

let ctx: AudioContext | null = null;
let src: any = null;

function on() {
  if (ctx) return;
  try {
    ctx = new AudioContext({ sampleRate: 16000 });
    const buf = ctx.createBuffer(1, 16000, 16000); // one second of silence, looped
    src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(g); g.connect(ctx.destination);
    src.start();
    note('keepalive-on', {});
  } catch (e: any) { note('keepalive-error', { msg: String(e?.message ?? e) }); off(); }
}
function off() {
  try { src?.stop(); } catch {}
  try { ctx?.close(); } catch {}
  src = null; ctx = null;
}

function update() {
  const want = getSettings().heyAlice && AppState.currentState !== 'active';
  if (want) on(); else off();
}
AppState.addEventListener('change', update);
onSettings(() => update());
