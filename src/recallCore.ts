/** Searching everything you've said to Alice (pure, unit-tested on the PC). */
export type LogTurn = { t: number; role: 'user' | 'assistant'; text: string };

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'about', 'what', 'did', 'i', 'you', 'me', 'my', 'we', 'say', 'said', 'tell', 'told', 'talk', 'talked', 'was', 'is', 'it', 'that', 'this', 'with', 'when', 'do', 'remember']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

/** Date range from words like "yesterday", "today", "last week", "on Monday". */
export function dateRange(q: string, now = new Date()): [number, number] | null {
  const day = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const l = q.toLowerCase();
  if (/\btoday\b|\bthis morning\b|\btonight\b/.test(l)) return [day(now), now.getTime()];
  if (/\byesterday\b/.test(l)) return [day(now) - 86400000, day(now)];
  if (/\blast week\b|\bthis week\b/.test(l)) return [day(now) - 7 * 86400000, now.getTime()];
  if (/\blast month\b/.test(l)) return [day(now) - 31 * 86400000, now.getTime()];
  const wd = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].findIndex((d) => l.includes(d));
  if (wd >= 0) { let back = (now.getDay() - wd + 7) % 7; if (back === 0) back = 7; const s = day(now) - back * 86400000; return [s, s + 86400000]; }
  return null;
}

export function recall(log: LogTurn[], query: string, opts: { last?: number; who?: 'user' | 'assistant' | 'any' } = {}, now = new Date()): LogTurn[] {
  const who = opts.who ?? 'any';
  const range = dateRange(query, now);
  let pool = log.filter((x) => (who === 'any' || x.role === who) && (!range || (x.t >= range[0] && x.t < range[1])));
  if (opts.last) return pool.slice(-opts.last);
  const q = words(query.replace(/\b(today|yesterday|last week|this week|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, ''));
  if (!q.length) return pool.slice(-10);
  const scored = pool.map((x, i) => { const w = new Set(words(x.text)); const hit = q.filter((k) => w.has(k) || [...w].some((v) => v.startsWith(k) && k.length > 3)).length; return { x, s: hit / q.length + i / pool.length / 100 }; })
    .filter((r) => r.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 12).map((r) => r.x);
  return scored.sort((a, b) => a.t - b.t);
}

export function describeTurns(turns: LogTurn[], now = new Date()): string {
  if (!turns.length) return "I couldn't find that in our past conversations.";
  const when = (t: number) => { const d = new Date(t); const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000); return `${days === 0 ? 'today' : days === 1 ? 'yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; };
  return turns.map((x) => `[${when(x.t)}] ${x.role === 'user' ? 'User' : 'Alice'}: ${x.text.slice(0, 400)}`).join('\n');
}
