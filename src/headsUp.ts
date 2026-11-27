/**
 * Daily heads-up: the first time each day (after 5 AM) that your glasses connect, or for glasses without a data
 * link the first time you open Alice, she tells you what's on today.
 */
import { glasses } from './ble';
import { agendaItems } from './agenda';
import { getSettings } from './settings';
import { readJson, writeJson } from './storage';
import { speak } from './voice';
import { note } from './diary';
import { runForesight } from './foresight';

const key = () => new Date().toDateString();
export async function maybeHeadsUp(delayMs = 6000) {
  if (!getSettings().dailyHeadsUp || new Date().getHours() < 5) return;
  const last = await readJson<{ day: string }>('headsup.json', { day: '' });
  if (last.day === key()) return;
  await writeJson('headsup.json', { day: key() });
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const today = (await agendaItems(1)).filter((i) => i.when <= end && i.when >= new Date());
  // Things coming up within 10 days that aren't on the calendar (found in notes and conversations).
  const soon = (await runForesight().catch(() => [])).filter((i) => new Date(i.date + 'T12:00:00').getTime() - Date.now() < 10 * 86400000);
  if (!today.length && !soon.length) return;
  note('heads-up', { count: today.length, foresight: soon.length });
  const a = today.length ? `Heads up, today you have ${today.slice(0, 4).map((i) => i.text.replace(/ today/, '')).join(', and ')}.` : 'Morning.';
  const b = soon.length ? ` Also coming up: ${soon.slice(0, 2).map((i) => `${i.title} on ${new Date(i.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`).join(', and ')}. Want a reminder?` : '';
  setTimeout(() => speak(a + b), delayMs);
}
glasses.on((e: any) => { if (e.kind === 'link' && e.state === 'connected') maybeHeadsUp(); });
