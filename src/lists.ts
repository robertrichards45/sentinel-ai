/**
 * Lists ("add milk to my shopping list", "what's on my to-do list") kept in iPhone Reminders, so they sync
 * through iCloud, show in the Reminders app and work with no internet.
 */
import * as Calendar from 'expo-calendar';
import { listMatches } from './matchCore';
export { listMatches };


async function permitted() {
  const p = await Calendar.requestRemindersPermissions();
  if (p.status !== 'granted') throw new Error('I need Reminders permission for lists.');
}
async function findList(name: string, create: boolean): Promise<any | null> {
  await permitted();
  const lists: any[] = await Calendar.getCalendars('reminder' as any);
  const hit = lists.find((l) => listMatches(l.title ?? '', name));
  if (hit || !create) return hit ?? null;
  const base = lists.find((l) => l.allowsModifications) ?? lists[0];
  const title = name.replace(/\blist\b/i, '').trim().replace(/^\w/, (c) => c.toUpperCase()) || 'List';
  return Calendar.createCalendar({ title, entityType: 'reminder', sourceId: base?.source?.id, source: base?.source, color: '#8C6BFF' } as any);
}

export async function addToList(list: string, items: string[]): Promise<string> {
  const l = await findList(list, true);
  for (const it of items) await l.createReminder({ title: it });
  return `Added ${items.join(', ')} to your ${l.title} list.`;
}

export async function readList(list: string): Promise<string> {
  const l = await findList(list, false);
  if (!l) return `You don't have a ${list} list yet.`;
  const items: any[] = await l.listReminders(null, null, 'incomplete' as any).catch(() => l.listReminders());
  const open = items.filter((r) => !r.completed).map((r) => r.title).filter(Boolean);
  if (!open.length) return `Your ${l.title} list is empty.`;
  return `${open.length} on your ${l.title} list: ${open.slice(0, 20).join(', ')}${open.length > 20 ? `, and ${open.length - 20} more` : ''}.`;
}

/** "Check off eggs" / "remove eggs from my shopping list": marks it done (still in Reminders' Completed). */
export async function checkOff(list: string, item: string): Promise<string> {
  const l = await findList(list, false);
  if (!l) return `You don't have a ${list} list.`;
  const items: any[] = await l.listReminders();
  const w = item.toLowerCase().trim();
  const r = items.find((x) => !x.completed && String(x.title).toLowerCase() === w) ?? items.find((x) => !x.completed && String(x.title).toLowerCase().includes(w));
  if (!r) return `I didn't see ${item} on your ${l.title} list.`;
  await r.update({ completed: true, completionDate: new Date() });
  return `Checked off ${r.title}.`;
}
