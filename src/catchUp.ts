/**
 * "What did I miss?": what's next on your calendar, reminders due today, running timers and alarms, and the
 * weather. Said automatically when your glasses reconnect after 2+ hours away (Settings: Catch me up).
 */
import * as Notifications from 'expo-notifications';
import { agendaItems } from './agenda';
import { glasses } from './ble';
import { getSettings } from './settings';
import { speak } from './voice';
import { note } from './diary';

export async function catchUpText(weather?: () => Promise<string>): Promise<string> {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const tomorrow = new Date(end.getTime() + 86400000);
  const items = (await agendaItems(2).catch(() => [])).filter((i) => i.when >= new Date() && i.when <= tomorrow);
  const today = items.filter((i) => i.when <= end);
  const parts: string[] = [];
  if (today.length) parts.push(`Still today: ${today.slice(0, 4).map((i) => i.text.replace(/ today/, '')).join('; ')}.`);
  else if (items.length) parts.push(`Nothing else today. Next up: ${items[0].text}.`);
  else parts.push('Nothing else on your calendar today.');
  try {
    const sched = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => (n.content.data as any)?.alice && !(n.content.data as any)?.recap);
    if (sched.length) parts.push(`You have ${sched.length} timer${sched.length > 1 ? 's or alarms' : ' or alarm'} set.`);
  } catch {}
  if (weather) { const w = await weather().catch(() => ''); if (w) parts.push(w); }
  return parts.join(' ');
}

let lastSeen = Date.now();
let sawToday = '';
glasses.on(async (e: any) => {
  if (e.kind !== 'link') return;
  if (e.state !== 'connected') { lastSeen = Date.now(); return; }
  const away = Date.now() - lastSeen;
  lastSeen = Date.now();
  const s = getSettings();
  if (!s.catchUp || away < 2 * 3600_000 || new Date().getHours() < 6) return;
  if (sawToday !== new Date().toDateString()) { sawToday = new Date().toDateString(); return; } // the daily heads-up covers the first one
  const t = await catchUpText();
  note('catch-up', { awayMin: Math.round(away / 60000) });
  setTimeout(() => speak(`Welcome back. ${t}`), 6000);
});
