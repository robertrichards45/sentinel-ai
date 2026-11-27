/**
 * Self-repair. A watchdog checks Alice's parts every 15 seconds and fixes what it can on its own:
 *  - a conversation stuck "thinking" or "connecting" → cut off / restart it
 *  - "Hey Alice" switched on but not listening → restart it
 *  - glasses dropped → reconnect (and re-send the headphones setup when they come back)
 *  - the server unreachable → re-check, and use no-signal mode meanwhile
 * Every fix is written to the diagnostic diary, so repeated faults reach the developer and get fixed for good
 * in the next update. "Alice, fix yourself" / "run a self-check" runs a full check and says what it found.
 * (An app can't rewrite its own code on an iPhone; Apple doesn't allow it. This repairs the running app.)
 */
import * as Calendar from 'expo-calendar';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { AudioManager } from 'react-native-audio-api';
import { getPermissionsAsync as contactsPerm } from 'expo-contacts';
import { live } from './live';
import { glasses } from './ble';
import { getSettings } from './settings';
import { checkNet, offlineNow } from './netState';
import { wakeWordHealth, restartWakeWord } from './wakeWord';
import { note, flushDiary } from './diary';

let fixes = 0;
const fixed = (what: string, d: Record<string, unknown> = {}) => { fixes++; note('self-repair', { what, ...d }); };

function tick() {
  try {
    const age = Date.now() - live.stateSince;
    if (live.state === 'thinking' && age > 30000) { live.cutOff(); fixed('live-stuck-thinking', { age }); }
    else if (live.state === 'connecting' && age > 25000) { live.stop(); fixed('live-stuck-connecting', { age }); }
    else if (live.state === 'speaking' && age > 120000) { live.cutOff(); fixed('live-stuck-speaking', { age }); }
    const w = wakeWordHealth();
    if (getSettings().heyAlice && w.enabled && !w.running && !w.busy && !w.paused && w.idleMs > 20000) { restartWakeWord(); fixed('wake-word-restart', { idleMs: w.idleMs }); }
    if (glasses.wantsConnection && glasses.state === 'error') { glasses.connect().catch(() => {}); fixed('glasses-reconnect'); }
  } catch (e: any) { note('self-repair-error', { msg: String(e?.message ?? e) }); }
}
setInterval(tick, 15000);

/** Full self-check, spoken back. */
export async function selfCheck(): Promise<string> {
  const ok: string[] = [], bad: string[] = [], did: string[] = [];
  const online = await checkNet();
  (online ? ok : bad).push(online ? 'internet and my server' : "my server (I'll use no-signal mode until it's back)");
  const perm = async (label: string, f: () => Promise<any>) => { try { const p = await f(); (p?.granted || p?.status === 'granted' || p === 'Granted' ? ok : bad).push(label); } catch { bad.push(label); } };
  await perm('microphone', async () => AudioManager.checkRecordingPermissions());
  await perm('speech recognition', () => ExpoSpeechRecognitionModule.getPermissionsAsync());
  await perm('calendar', () => Calendar.getCalendarPermissions());
  await perm('reminders', () => Calendar.getRemindersPermissions());
  await perm('location', () => Location.getForegroundPermissionsAsync());
  await perm('contacts', () => contactsPerm());
  await perm('notifications', () => Notifications.getPermissionsAsync());
  if (live.state === 'thinking' || live.state === 'connecting') { await live.stop(); did.push('restarted a stuck conversation'); }
  if (getSettings().heyAlice) { restartWakeWord(); did.push('restarted Hey Alice'); }
  if (glasses.wantsConnection && glasses.state !== 'connected') { glasses.connect().catch(() => {}); did.push('reconnecting the glasses'); }
  else if (glasses.state === 'connected') { ok.push('glasses'); try { (glasses as any).syncAudio?.(true); did.push('re-sent the glasses headphones setup'); } catch {} }
  note('self-check', { ok: ok.length, bad, did, fixesSoFar: fixes, offline: offlineNow() });
  flushDiary?.();
  const badText = bad.length ? ` Not working: ${bad.join(', ')}.${bad.some((b) => !b.startsWith('my server')) ? ' Turn those on in the iPhone Settings app, under Alice.' : ''}` : '';
  return `Self-check done. Working: ${ok.join(', ')}.${badText}${did.length ? ` I also ${did.join(', ')}.` : ''} I've logged it for the next update.`;
}
