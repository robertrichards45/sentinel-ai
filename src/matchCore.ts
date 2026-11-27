/** Pure name matching for lists and shortcuts (unit-tested on the PC). */
const ALIAS: Record<string, string[]> = { shopping: ['shopping', 'grocery', 'groceries'], 'to-do': ['to do', 'to-do', 'todo', 'tasks', 'reminders'] };
export const clean = (s: string) => s.toLowerCase().replace(/\blist\b/g, '').replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
export function listMatches(title: string, want: string): boolean {
  const t = clean(title), w = clean(want).replace(/^(my|the)\s+/, '');
  if (!w) return false;
  if (t === w || t.includes(w) || w.includes(t)) return true;
  const group = Object.values(ALIAS).find((g) => g.includes(w));
  return !!group && group.some((g) => t.includes(g));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Best saved shortcut name for what was asked, or the asked name itself. */
export function pickShortcut(asked: string, saved: string[]): string {
  const a = norm(asked);
  const exact = saved.find((s) => norm(s) === a);
  if (exact) return exact;
  const words = a.split(' ').filter((w) => w.length > 2);
  let best = '', score = 0;
  for (const s of saved) {
    const sw = norm(s).split(' ');
    const n = words.filter((w) => sw.includes(w)).length / Math.max(1, Math.max(words.length, sw.length));
    if (n > score) { score = n; best = s; }
  }
  return score >= 0.5 ? best : asked.trim();
}
