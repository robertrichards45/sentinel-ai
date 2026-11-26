/**
 * "Hey Alice" wake word, without Siri. Uses Apple's on-device speech recognition (free, private, nothing
 * leaves the phone until Alice actually wakes). It listens with the PHONE's microphone while Alice is open
 * or running in the background; iOS does not allow any app to listen after it has been fully closed.
 * It steps aside whenever Alice herself is listening or talking, and restarts itself every time iOS ends a
 * recognition session (about once a minute).
 */
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { getSettings, onSettings } from './settings';
import { appMicBusy } from './micState';
import { onSpeaking } from './voice';
import { live } from './live';
import { glassesVoiceActive } from './glassesVoice';
import { wake } from './triggers';
import { note } from './diary';

const WAKE = /\b(hey|hi|hay|okay|ok)[\s,.!]*(alice|alyce|alis|allis|elise|alys)\b/i;
export const heardWakeWord = (t: string) => WAKE.test(t);

let running = false;
let speaking = false;
let lastWake = 0;
let enabled = false;
let timer: ReturnType<typeof setInterval> | null = null;
onSpeaking((on) => { speaking = on; });

const aliceBusy = () => speaking || appMicBusy() || glassesVoiceActive() || (live.state !== 'off' && live.state !== 'error');

function start() {
  if (running || !enabled || aliceBusy()) return;
  running = true;
  try {
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: false,
      contextualStrings: ['Hey Alice', 'Alice'],
      // Keep Bluetooth glasses in music-quality mode and don't stop other audio.
      iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetoothA2DP', 'mixWithOthers'], mode: 'default' },
    });
  } catch { running = false; }
}
function stop() {
  if (!running) return;
  running = false;
  try { ExpoSpeechRecognitionModule.abort(); } catch {}
}

ExpoSpeechRecognitionModule.addListener('result', (ev: any) => {
  const text = (ev?.results ?? []).map((r: any) => r?.transcript ?? '').join(' ');
  if (!heardWakeWord(text) || Date.now() - lastWake < 4000) return;
  lastWake = Date.now();
  note('wake-word');
  stop();
  setTimeout(wake, 500); // let iOS release the microphone before Alice opens it
});
ExpoSpeechRecognitionModule.addListener('end', () => { running = false; });
ExpoSpeechRecognitionModule.addListener('error', (e: any) => { running = false; if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') note('wake-error', { error: e.error, msg: e.message }); });

async function setEnabled(on: boolean) {
  if (on === enabled) return;
  if (on) {
    const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync().catch(() => null);
    if (!p?.granted) return;
    enabled = true;
    // Supervisor: (re)start when idle, step aside when Alice is busy.
    timer = setInterval(() => { if (aliceBusy()) stop(); else start(); }, 1000);
    start();
  } else {
    enabled = false;
    if (timer) { clearInterval(timer); timer = null; }
    stop();
  }
}

onSettings((s) => { setEnabled(!!s.heyAlice); });
export const wakeWordReady = () => setEnabled(!!getSettings().heyAlice);
