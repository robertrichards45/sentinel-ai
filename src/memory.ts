import { readJson, writeJson, deleteFile } from './storage';
import * as core from './memoryCore';

let state: core.MemoryState = core.EMPTY;
const listeners = new Set<(m: core.MemoryState) => void>();
const save = async () => {
  await writeJson('memory.json', state);
  listeners.forEach((l) => l(state));
};

export const memory = {
  async load() { state = await readJson('memory.json', core.EMPTY); listeners.forEach((l) => l(state)); return state; },
  get: () => state,
  on(fn: (m: core.MemoryState) => void) { listeners.add(fn); return () => listeners.delete(fn); },
  async remember(text: string) { state = core.addFact(state, text); await save(); },
  async forget(match: string) { const r = core.forget(state, match); state = r.state; await save(); return r.removed; },
  async note(text: string, image?: string) { state = core.addNote(state, text, Date.now(), image); await save(); },
  async deleteNote(id: string) { state = { ...state, notes: state.notes.filter((n) => n.id !== id) }; await save(); },
  async turn(role: core.Turn['role'], text: string) { state = core.addTurn(state, role, text); await save(); },
  async clearHistory() { state = { ...state, history: [] }; await save(); },
  /** Privacy: wipe everything Alice remembers. */
  async wipeAll() { state = core.EMPTY; deleteFile('memory.json'); listeners.forEach((l) => l(state)); },
  prompt: () => core.memoryPrompt(state),
};
