/**
 * No-signal mode. When Alice's server can't be reached, "Hey Alice", the glasses button and the orb still
 * work for the basics: she listens with Apple's on-device speech recognition, understands a fixed set of
 * commands (offlineCore.ts) and answers with the iPhone's own voice.
 */
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { parseOffline, OFFLINE_HELP } from './offlineCore';
import { runAction } from './actions';
import { validateAction, Action } from './intents';
import { speak } from './voice';
import { getSettings } from './settings';
import { setPhoneMic } from './micState';
import { note } from './diary';

let active = false;
let resolveHeard: ((t: string) => void) | null = null;
let lastText = '';
export const offlineListening = () => active;

ExpoSpeechRecognitionModule.addListener('result', (ev: any) => {
  if (!active) return;
  lastText = (ev?.results ?? []).map((r: any) => r?.transcript ?? '').join(' ').trim() || lastText;
  if (ev?.isFinal && resolveHeard) { resolveHeard(lastText); resolveHeard = null; }
});
ExpoSpeechRecognitionModule.addListener('end', () => { if (active && resolveHeard) { resolveHeard(lastText); resolveHeard = null; } });

function hear(): Promise<string> {
  lastText = '';
  return new Promise((resolve) => {
    resolveHeard = resolve;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US', interimResults: true, continuous: false, requiresOnDeviceRecognition: true, addsPunctuation: false,
        iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetoothA2DP'], mode: 'default' },
      });
    } catch { resolve(''); }
    setTimeout(() => { if (resolveHeard === resolve) { try { ExpoSpeechRecognitionModule.stop(); } catch {} } }, 9000);
    setTimeout(() => { if (resolveHeard === resolve) { resolveHeard = null; resolve(lastText); } }, 11000);
  });
}

/** One offline exchange: listen, do it, say the result. */
export async function offlineTurn(): Promise<void> {
  if (active) return;
  active = true; setPhoneMic(true);
  try {
    const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync().catch(() => null);
    if (!p?.granted) { await speak('I need speech recognition permission to work offline.'); return; }
    await speak("I'm offline. What do you need?");
    const text = await hear();
    note('offline-heard', { chars: text.length });
    if (!text) { await speak("I didn't catch that."); return; }
    const r = parseOffline(text, getSettings().shortcuts ?? []);
    if (!r) { await speak(OFFLINE_HELP); return; }
    if ('say' in r) { await speak(r.say); return; }
    const a = validateAction(r.action as any, []) as Action | null;
    if (!a) { await speak(OFFLINE_HELP); return; }
    const out = await runAction(a).catch((e) => String(e?.message ?? e));
    await speak(out);
  } finally { active = false; setPhoneMic(false); }
}
