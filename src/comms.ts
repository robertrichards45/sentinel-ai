import { playAppleMusic } from './music';
/** Calls, texts, timers, alarms and music: the everyday things you ask a phone assistant for. */
import { Linking } from 'react-native';
import * as SMS from 'expo-sms';
import * as Notifications from 'expo-notifications';
import { Contact, ContactField, requestPermissionsAsync as contactsPermission } from 'expo-contacts';
import { speak } from './voice';
import { note } from './diary';

// ---------- Contacts ----------
const RELATION: Record<string, string[]> = { mom: ['mom', 'mother', 'mama', 'mommy'], dad: ['dad', 'father', 'papa', 'daddy'], wife: ['wife', 'wifey'], husband: ['husband', 'hubby'] };
export async function findContact(who: string): Promise<{ name: string; number: string } | null> {
  const p = await contactsPermission();
  if (!p.granted) throw new Error('I need Contacts permission for that.');
  const q = who.trim().toLowerCase();
  const fields = [ContactField.FULL_NAME, ContactField.NICKNAME, ContactField.PHONES] as const;
  let list: any[] = await Contact.getAllDetails(fields, { name: who }).catch(() => []);
  if (!list.length) {
    // "Mom", "my wife": match nicknames / relation words across all contacts
    const all: any[] = await Contact.getAllDetails(fields).catch(() => []);
    const words = RELATION[q.replace(/^my\s+/, '')] ?? [q.replace(/^my\s+/, '')];
    list = all.filter((c) => words.some((w) => String(c.nickname ?? '').toLowerCase() === w || String(c.fullName ?? '').toLowerCase().split(/\s+/).includes(w)));
  }
  const c = list.find((x) => (x.phones ?? []).length);
  if (!c) return null;
  const phone = c.phones.find((ph: any) => /mobile|iphone|cell/i.test(ph.label ?? '')) ?? c.phones[0];
  return { name: c.fullName || c.nickname || who, number: String(phone.number ?? '').replace(/[^\d+]/g, '') };
}

export async function callContact(who: string): Promise<string> {
  const c = await findContact(who);
  if (!c) return `I couldn't find a phone number for ${who} in your contacts.`;
  await Linking.openURL(`tel:${c.number}`);
  return `Calling ${c.name}.`;
}

export async function textContact(who: string, body: string): Promise<string> {
  if (!(await SMS.isAvailableAsync())) return 'Messages is not available on this phone.';
  const c = await findContact(who);
  if (!c) return `I couldn't find a phone number for ${who} in your contacts.`;
  const r = await SMS.sendSMSAsync([c.number], body);
  return r.result === 'sent' ? `Sent to ${c.name}.` : r.result === 'cancelled' ? 'Message cancelled.' : `Message to ${c.name} is ready, tap Send.`;
}

// ---------- Timers & alarms (local notifications; they sound through the glasses when connected) ----------
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});
// If Alice is open when it goes off, she says it too.
Notifications.addNotificationReceivedListener((n) => {
  const d: any = n.request.content.data ?? {};
  if (d.alice) speak(d.say || n.request.content.title || 'Time is up.');
});
async function notifyPermission() {
  const p = await Notifications.requestPermissionsAsync();
  if (!p.granted) throw new Error('I need notification permission for timers and alarms.');
}
const human = (s: number) => (s >= 3600 ? `${Math.round(s / 360) / 10} hours` : s >= 60 ? `${Math.round(s / 6) / 10} minutes` : `${s} seconds`);

export async function setTimer(seconds: number, label?: string): Promise<string> {
  await notifyPermission();
  const title = label ? `${label} timer is done` : 'Timer is done';
  await Notifications.scheduleNotificationAsync({
    content: { title, body: label ? `Your ${human(seconds)} ${label} timer.` : `Your ${human(seconds)} timer.`, sound: 'default', data: { alice: true, say: `Hey, your ${label ? label + ' ' : ''}timer is done.` } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)) },
  });
  note('timer', { seconds });
  return `Timer set for ${human(seconds)}.`;
}

export async function setAlarm(atIso: string, label?: string): Promise<string> {
  await notifyPermission();
  let when = new Date(atIso);
  if (isNaN(when.getTime())) return "I didn't catch the time.";
  if (when.getTime() <= Date.now()) when = new Date(when.getTime() + 86400000); // "6 am" said in the evening = tomorrow
  await Notifications.scheduleNotificationAsync({
    content: { title: label || 'Alarm', body: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), sound: 'default', interruptionLevel: 'timeSensitive', data: { alice: true, say: label ? `It's time: ${label}.` : 'Good morning, this is your alarm.' } } as any,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
  note('alarm', { at: when.toISOString() });
  return `Alarm set for ${when.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}. Keep your ringer on so you hear it.`;
}

export async function cancelTimers(): Promise<string> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const mine = all.filter((n) => (n.content.data as any)?.alice);
  for (const n of mine) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  return mine.length ? `Cancelled ${mine.length} timer${mine.length > 1 ? 's and alarms' : ' or alarm'}.` : 'You have no timers or alarms from me.';
}

// ---------- Music ----------
export async function playMusic(query: string, app?: string): Promise<string> {
  const spotify = /spotify/i.test(app ?? '');
  if (!spotify) { const r = await playAppleMusic(query); if (r) return r; }
  const url = spotify ? `spotify:search:${encodeURIComponent(query)}` : `music://music.apple.com/us/search?term=${encodeURIComponent(query)}`;
  const ok = await Linking.canOpenURL(url).catch(() => false);
  if (!ok && spotify) return "Spotify isn't installed.";
  await Linking.openURL(url);
  return `Opening ${query} in ${spotify ? 'Spotify' : 'Apple Music'}. Tap play; after that your glasses button pauses and plays.`;
}
