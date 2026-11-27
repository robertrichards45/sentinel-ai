/**
 * Daily recap: "Alice, recap my day", or a notification each evening (Settings: Evening recap) that she
 * reads when you tap it. Uses today's calendar, reminders you finished, notes, meeting notes and
 * new things she learned about you. Nothing is sent anywhere except the summary request to Alice's server.
 */
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import { memory } from './memory';
import { listMeetings } from './meetingNotes';
import { respond } from './ai';
import { speak } from './voice';
import { getSettings, onSettings } from './settings';
import { note } from './diary';

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export async function dayFacts(): Promise<string[]> {
  const from = startOfDay(), now = new Date();
  const lines: string[] = [];
  try {
    if ((await Calendar.getCalendarPermissions()).status === 'granted') {
      const evs: any[] = await Calendar.listEvents(await Calendar.getCalendars('event' as any), from, now);
      for (const e of evs) lines.push(`Calendar: ${e.title || 'event'}${e.allDay ? '' : ' at ' + t(new Date(e.startDate))}`);
    }
  } catch {}
  try {
    if ((await Calendar.getRemindersPermissions()).status === 'granted') {
      for (const l of await Calendar.getCalendars('reminder' as any)) {
        const done: any[] = await l.listReminders(from, now, 'completed' as any).catch(() => []);
        for (const r of done) lines.push(`Finished: ${r.title}`);
      }
    }
  } catch {}
  const m = memory.get();
  for (const n of m.notes.filter((x) => x.created >= from.getTime())) lines.push(`Note: ${n.text}`);
  for (const f of m.facts.filter((x) => x.created >= from.getTime())) lines.push(`Learned about you: ${f.text}`);
  for (const mt of (await listMeetings()).filter((x) => x.started >= from.getTime() && x.summary)) lines.push(`Meeting "${mt.title}": ${mt.summary!.replace(/\n+/g, ' ').slice(0, 600)}`);
  return lines.slice(0, 80);
}

export async function recapText(): Promise<string> {
  const facts = await dayFacts();
  if (!facts.length) return "I don't have much from today: nothing on your calendar, no notes and no meetings. Tomorrow, tell me things as they happen and I'll recap them tonight.";
  const r = await respond('general', 'You are Alice giving the user a short spoken recap of their day, warm and a little playful, 4 to 7 sentences. Cover what happened, decisions and action items still open, and end with one useful thing for tomorrow if there is one. Use only the facts given. Plain text.', [], facts.join('\n'));
  note('recap', { facts: facts.length });
  return r.text;
}

export async function speakRecap() { speak(await recapText().catch(() => "I couldn't put your recap together right now.")); }

// Evening notification; tapping it opens Alice and she reads the recap.
let scheduledFor = '';
async function schedule() {
  const s = getSettings();
  const key = s.eveningRecap ? `${s.recapHour}` : 'off';
  if (key === scheduledFor) return;
  scheduledFor = key;
  try {
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) if ((n.content.data as any)?.recap) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    if (!s.eveningRecap) return;
    const p = await Notifications.requestPermissionsAsync();
    if (!p.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Your day with Alice', body: 'Tap and I\'ll recap your day.', data: { recap: true } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: s.recapHour, minute: 0 },
    });
  } catch (e: any) { note('recap-error', { msg: String(e?.message ?? e) }); }
}
onSettings(() => { schedule(); });
Notifications.addNotificationResponseReceivedListener((r) => { if ((r.notification.request.content.data as any)?.recap) speakRecap(); });
export const recapReady = () => schedule();
