import { AppState } from 'react-native';
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
import { wakeInterrupted, updateKeepAlive, setLiveCheck, off as keepAliveOff } from './keepAlive';
import { isDeepAsleep, whenSleeping, whenWoken } from './quiet';
import { glassesVoiceActive } from './glassesVoice';
import { wake } from './triggers';
import { note } from './diary';
import { wakeUp } from './quiet';

const WAKE = /\b(hey|hi|hay|okay|ok)[\s,.!]*(alice|alyce|alis|allis|elise|alys)\b/i;
export const heardWakeWord = (t: string) => WAKE.test(t);

let running = false;
let speaking = false;
let lastWake = 0;
let enabled = false;
let timer: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
let quickFails = 0;
let pauseUntil = 0;
onSpeaking((on) => { speaking = on; });

const aliceBusy = () => isDeepAsleep() || speaking || appMicBusy() || glassesVoiceActive() || (live.state !== 'off' && live.state !== 'error');

function start() {
  if (running || !enabled || aliceBusy() || Date.now() < pauseUntil) return;
  running = true; startedAt = Date.now();
  if (AppState.currentState !== 'active') note('wake-start-bg', {});
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
  wakeUp();
  stop();
  setTimeout(wake, 500); // let iOS release the microphone before Alice opens it
});
// If recognition keeps ending straight away, back off instead of restarting every second (each restart
// reconfigures the iPhone's audio, which can upset Bluetooth audio devices).
function ended() {
  running = false;
  if (Date.now() - startedAt < 5000) quickFails++; else quickFails = 0;
  if (quickFails >= 3) { pauseUntil = Date.now() + 60000; note('wake-paused', { quickFails }); quickFails = 0; return; }
  // iOS ends each session after about a minute. Restart right away (in the background a 1-second wait can
  // be long enough for iOS to suspend the app).
  setTimeout(() => { if (enabled && !aliceBusy()) start(); }, 200);
}
ExpoSpeechRecognitionModule.addListener('end', ended);
ExpoSpeechRecognitionModule.addListener('error', (e: any) => { if (e?.error === 'interrupted') wakeInterrupted(); ended(); if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') note('wake-error', { error: e.error, msg: e.message }); });

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
/** For self-repair: is "Hey Alice" supposed to be on, and has it been idle (not listening) too long? */
export const wakeWordHealth = () => ({ enabled, running, idleMs: running ? 0 : Date.now() - startedAt, busy: aliceBusy(), paused: Date.now() < pauseUntil });
export function restartWakeWord() { stop(); pauseUntil = 0; quickFails = 0; setTimeout(() => { if (enabled && !aliceBusy()) start(); }, 300); }

// "Stop listening": mic fully off (orange dot goes away) until you wake her; then Hey Alice comes back.
whenSleeping(() => { if (isDeepAsleep()) { stop(); keepAliveOff(); note('wake-paused-by-user', {}); } });
whenWoken(() => { setTimeout(() => { if (enabled && !aliceBusy()) start(); updateKeepAlive(); }, 500); });
setLiveCheck(() => live.state !== 'off' && live.state !== 'error');
