/**
 * Everything said with Alice (typed, spoken, live), kept on this iPhone so she can remember past conversations:
 * "what did I tell you about the truck?", "read me the last three things I sent you". Up to 20,000 turns.
 * Wiped with the rest of memory (Settings, Privacy).
 */
import { readJson, writeJson, deleteFile } from './storage';
import { LogTurn, recall, describeTurns } from './recallCore';

let log: LogTurn[] = [];
let loaded: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const load = () => (loaded ??= readJson<LogTurn[]>('convlog.json', []).then((l) => { log = Array.isArray(l) ? l : []; }));
const saveSoon = () => { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(() => { writeJson('convlog.json', log).catch(() => {}); }, 1500); };

export async function logTurn(role: LogTurn['role'], text: string) {
  await load();
  const t = text.trim(); if (!t) return;
  log.push({ t: Date.now(), role, text: t.slice(0, 4000) });
  if (log.length > 20000) log = log.slice(-20000);
  saveSoon();
}
export async function recentTurns(n: number) { await load(); return log.slice(-n); }
export async function recallText(query: string, last?: number, who?: 'user' | 'assistant' | 'any'): Promise<string> {
  await load();
  return describeTurns(recall(log, query, { last, who }));
}
export async function wipeLog() { log = []; deleteFile('convlog.json'); }
load();
