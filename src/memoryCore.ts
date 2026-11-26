/** Pure memory logic (unit-tested on the PC). Persistence lives in memory.ts. */
export type Fact = { id: string; text: string; created: number };
export type Turn = { role: 'user' | 'assistant'; text: string; t: number };
export type Note = { id: string; text: string; created: number };
export type MemoryState = { facts: Fact[]; history: Turn[]; notes: Note[] };

export const EMPTY: MemoryState = { facts: [], history: [], notes: [] };
export const MAX_FACTS = 200;
export const MAX_HISTORY = 24; // turns kept for conversational context

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const id = (now: number) => now.toString(36) + Math.random().toString(36).slice(2, 6);

export function addFact(m: MemoryState, text: string, now = Date.now()): MemoryState {
  if (m.facts.some((f) => norm(f.text) === norm(text))) return m;
  return { ...m, facts: [...m.facts, { id: id(now), text, created: now }].slice(-MAX_FACTS) };
}

/** Removes every fact/note containing the phrase. Returns how many were removed. */
const words = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length > 2));
/** Share of the match's words found in the text (0..1). */
export function overlap(text: string, match: string): number {
  const a = words(match), b = words(text);
  if (!a.size) return 0;
  let n = 0; for (const w of a) if (b.has(w)) n++;
  return n / a.size;
}

export function forget(m: MemoryState, match: string): { state: MemoryState; removed: number } {
  const k = norm(match);
  let facts = m.facts.filter((f) => !norm(f.text).includes(k));
  // Nothing matched word-for-word: drop the single closest fact if it's clearly the one meant.
  if (facts.length === m.facts.length && m.facts.length) {
    const best = m.facts.map((f) => ({ f, s: overlap(f.text, match) })).sort((x, y) => y.s - x.s)[0];
    if (best.s >= 0.6) facts = m.facts.filter((f) => f !== best.f);
  }
  const notes = m.notes.filter((n) => !norm(n.text).includes(k));
  return { state: { ...m, facts, notes }, removed: m.facts.length - facts.length + m.notes.length - notes.length };
}

export function addNote(m: MemoryState, text: string, now = Date.now()): MemoryState {
  return { ...m, notes: [...m.notes, { id: id(now), text, created: now }].slice(-500) };
}

export function addTurn(m: MemoryState, role: Turn['role'], text: string, now = Date.now()): MemoryState {
  return { ...m, history: [...m.history, { role, text, t: now }].slice(-MAX_HISTORY) };
}

/** Context block sent with each request. Only facts the user explicitly asked to keep. */
export function memoryPrompt(m: MemoryState, now = new Date()): string {
  const lines = [`Current local time: ${now.toString()}`];
  if (m.facts.length) lines.push('What you know about the user (use it naturally when it helps, e.g. their car for car questions; never recite the list unprompted):\n' + m.facts.map((f) => '- ' + f.text).join('\n'));
  const recentNotes = m.notes.slice(-10);
  if (recentNotes.length) lines.push('Recent notes:\n' + recentNotes.map((n) => '- ' + n.text).join('\n'));
  return lines.join('\n\n');
}

/** Learner reply: {"add":[...], "outdated":[...]} (or a bare array of new facts). */
export function parseLearnedUpdate(reply: string): { add: string[]; outdated: string[] } {
  const clean = (arr: unknown) => Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').map((x: string) => x.trim()).filter((x) => x.length >= 4 && x.length <= 200).slice(0, 10) : [];
  const o = reply.match(/\{[\s\S]*\}/);
  if (o) { try { const j = JSON.parse(o[0]); if (j && (j.add || j.outdated)) return { add: clean(j.add), outdated: clean(j.outdated) }; } catch {} }
  return { add: parseLearned(reply), outdated: [] };
}

/** Parse the fact-extractor's reply: a JSON array of short sentences (tolerates code fences / extra text). */
export function parseLearned(reply: string): string[] {
  const m = reply.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').map((x) => x.trim()).filter((x) => x.length >= 4 && x.length <= 200).slice(0, 10) : [];
  } catch { return []; }
}
