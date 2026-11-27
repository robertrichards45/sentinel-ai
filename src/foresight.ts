/**
 * Foresight: once a day Alice reads your recent notes, meeting notes, scanned documents, facts and
 * conversations, and picks out dates that matter and aren't on your calendar yet (renewals, expiry dates,
 * deadlines, birthdays, appointments you mentioned). She brings them up in the morning heads-up and when you
 * ask "anything coming up?", and offers to set reminders. She suggests; she never adds things on her own.
 */
import { readJson, writeJson } from './storage';
import { memory } from './memory';
import { listMeetings } from './meetingNotes';
import { recentTurns } from './convoLog';
import { agendaItems } from './agenda';
import { respond } from './ai';
import { getSettings } from './settings';
import { note } from './diary';
import { parseForesight, Foresee } from './foresightCore';

type Store = { day: string; items: Foresee[] };

export async function runForesight(force = false): Promise<Foresee[]> {
  const s = getSettings();
  const today = new Date().toDateString();
  const st = await readJson<Store>('foresight.json', { day: '', items: [] });
  if (!force && st.day === today) return st.items;
  if (!s.memoryEnabled || s.privacyMode) return [];
  const m = memory.get();
  const since = Date.now() - 45 * 86400000;
  const meetings = (await listMeetings()).filter((x) => x.started > since && x.summary).map((x) => `Meeting "${x.title}" (${new Date(x.started).toDateString()}): ${x.summary}`);
  const talk = (await recentTurns(200)).filter((x) => x.role === 'user').map((x) => `${new Date(x.t).toDateString()}: ${x.text}`);
  const material = [...m.facts.map((f) => 'Fact: ' + f.text), ...m.notes.slice(-60).map((n) => `Note (${new Date(n.created).toDateString()}): ${n.text}`), ...meetings, ...talk.slice(-120)].join('\n').slice(0, 40000);
  if (!material.trim()) return [];
  const cal = (await agendaItems(90).catch(() => [])).map((i) => i.text).join('; ');
  try {
    const r = await respond('general', `Today is ${new Date().toDateString()}. From the user's notes and conversations, find specific FUTURE dates in the next 90 days that matter to them: deadlines, renewals and expirations (registration, license, lease, insurance, bills), birthdays and anniversaries, appointments, application closing dates, follow-ups they promised. Skip anything already on their calendar: ${cal || '(empty)'}. Only use what is actually written; never guess dates. Reply with ONLY JSON: {"items":[{"title":"short title","date":"YYYY-MM-DD","why":"one short sentence, where you saw it"}]} (empty list if none).`, [], material);
    const items = parseForesight(r.text, new Date());
    await writeJson('foresight.json', { day: today, items });
    note('foresight', { n: items.length });
    return items;
  } catch { return st.items; }
}

export async function foresightText(): Promise<string> {
  const items = await runForesight();
  if (!items.length) return "Nothing coming up that isn't already on your calendar.";
  return `Coming up and not on your calendar: ${items.slice(0, 5).map((i) => `${i.title}, ${new Date(i.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} (${i.why})`).join('; ')}. Want reminders for any of these?`;
}
