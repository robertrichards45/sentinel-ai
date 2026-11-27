/**
 * Keeps "Hey Alice" alive with the phone locked. iOS suspends a background app unless its audio is running,
 * and between speech-recognition sessions there's a gap where nothing is. So while Hey Alice is on and Alice is
 * in the background (and no conversation is running), she plays inaudible silence.
 * v2 (0.19.1): the first version changed the audio session and interrupted the microphone (seen in the log).
 * This one uses exactly the same audio settings as Hey Alice's microphone, so iOS has nothing to interrupt,
 * and it switches itself off for the session if an interruption still follows it.
 */
import { AppState } from 'react-native';
import { AudioContext, AudioManager } from 'react-native-audio-api';
import { getSettings, onSettings } from './settings';
import { isDeepAsleep } from './quiet';
import { note } from './diary';

let ctx: AudioContext | null = null;
let src: any = null;
let startedAt = 0;
let disabled = false;
let isLiveOn: () => boolean = () => false;
export const setLiveCheck = (f: () => boolean) => { isLiveOn = f; };

function on() {
  if (ctx || disabled) return;
  try {
    AudioManager.setSystemOptions({ ios: { category: 'playAndRecord', mode: 'default', options: ['defaultToSpeaker', 'allowBluetoothA2DP', 'mixWithOthers'] } });
    ctx = new AudioContext({ sampleRate: 16000 });
    const buf = ctx.createBuffer(1, 16000, 16000);
    src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(g); g.connect(ctx.destination); src.start();
    startedAt = Date.now();
    note('keepalive-on', { v: 2 });
  } catch (e: any) { note('keepalive-error', { msg: String(e?.message ?? e) }); off(); }
}
export function off() {
  try { src?.stop(); } catch {}
  try { ctx?.close(); } catch {}
  src = null; ctx = null;
}
/** Hey Alice reports interruptions here; if one follows the keep-alive closely, stop using it this session. */
export function wakeInterrupted() {
  if (ctx && Date.now() - startedAt < 5000) { disabled = true; off(); note('keepalive-disabled', {}); }
}
export function updateKeepAlive() {
  const want = getSettings().heyAlice && AppState.currentState !== 'active' && !isLiveOn() && !isDeepAsleep();
  if (want) on(); else off();
}
AppState.addEventListener('change', updateKeepAlive);
onSettings(() => updateKeepAlive());
