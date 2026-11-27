/** Parsing foresight suggestions (pure, unit-tested). */
export type Foresee = { title: string; date: string; why: string };
export function parseForesight(text: string, now: Date): Foresee[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let j: any; try { j = JSON.parse(m[0]); } catch { return []; }
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 92 * 86400000;
  const seen = new Set<string>();
  return (Array.isArray(j.items) ? j.items : [])
    .map((x: any) => ({ title: String(x?.title ?? '').trim().slice(0, 80), date: String(x?.date ?? '').slice(0, 10), why: String(x?.why ?? '').trim().slice(0, 140) }))
    .filter((x: Foresee) => x.title && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && (() => { const t = new Date(x.date + 'T12:00:00').getTime(); return t >= start.getTime() && t <= end; })())
    .filter((x: Foresee) => { const k = x.title.toLowerCase() + x.date; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a: Foresee, b: Foresee) => a.date.localeCompare(b.date))
    .slice(0, 10);
}
