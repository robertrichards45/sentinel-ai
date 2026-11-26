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
export function forget(m: MemoryState, match: string): { state: MemoryState; removed: number } {
  const k = norm(match);
  const facts = m.facts.filter((f) => !norm(f.text).includes(k));
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
  if (m.facts.length) lines.push('Things the user asked you to remember:\n' + m.facts.map((f) => '- ' + f.text).join('\n'));
  const recentNotes = m.notes.slice(-10);
  if (recentNotes.length) lines.push('Recent notes:\n' + recentNotes.map((n) => '- ' + n.text).join('\n'));
  return lines.join('\n\n');
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
