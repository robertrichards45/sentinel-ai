/** What's coming up: calendar events and unfinished reminders for the next few days, spoken naturally. */
import * as Calendar from 'expo-calendar';

const day = (d: Date) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((that.getTime() - today.getTime()) / 86400000);
  return diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};
const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export type AgendaItem = { when: Date; text: string };

export async function agendaItems(days = 7): Promise<AgendaItem[]> {
  const from = new Date(), to = new Date(Date.now() + days * 86400000);
  const items: AgendaItem[] = [];
  try {
    if ((await Calendar.getCalendarPermissions()).status === 'granted' || (await Calendar.requestCalendarPermissions()).status === 'granted') {
      const cals = await Calendar.getCalendars('event' as any);
      const events = await Calendar.listEvents(cals, from, to);
      for (const e of events as any[]) {
        const start = new Date(e.startDate);
        items.push({ when: start, text: `${e.title || 'An event'} ${day(start)}${e.allDay ? '' : ' at ' + time(start)}` });
      }
    }
  } catch {}
  try {
    if ((await Calendar.getRemindersPermissions()).status === 'granted' || (await Calendar.requestRemindersPermissions()).status === 'granted') {
      const lists = await Calendar.getCalendars('reminder' as any);
      for (const l of lists) {
        const rs = await l.listReminders(null, to, 'incomplete' as any).catch(() => []);
        for (const r of rs as any[]) {
          if (!r.dueDate) continue;
          const due = new Date(r.dueDate);
          if (due.getTime() < Date.now() - 86400000) continue; // ignore long-overdue clutter
          items.push({ when: due, text: `reminder: ${r.title} ${day(due)} at ${time(due)}` });
        }
      }
    }
  } catch {}
  return items.sort((a, b) => a.when.getTime() - b.when.getTime());
}

export async function agendaText(days = 7): Promise<string> {
  const items = await agendaItems(days);
  if (!items.length) return days <= 1 ? 'Nothing on your calendar today.' : `Nothing coming up in the next ${days} days.`;
  const list = items.slice(0, 8).map((i) => i.text);
  return `Coming up: ${list.join('; ')}${items.length > 8 ? `, and ${items.length - 8} more` : ''}.`;
}
