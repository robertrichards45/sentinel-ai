/**
 * Diagnostic diary: what happened today, so problems can be found afterwards.
 * Records EVENTS only (glasses connected/dropped, commands sent, how long each answer took, errors) - never
 * what you or Alice said. Kept on the phone (last 3000 events) and, unless Privacy mode is on, sent every few
 * minutes to Alice's own server, where it shows up in the server log.
 */
import { readJson, writeJson } from './storage';
import { getSettings } from './settings';

export type DiaryEvent = { t: number; k: string; d?: Record<string, unknown> };
const FILE = 'diary.json';
const MAX = 3000;
let events: DiaryEvent[] = [];
let unsent: DiaryEvent[] = [];
let loaded = false;
let dirty = false;

const short = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : v);
export function note(k: string, d?: Record<string, unknown>) {
  const e: DiaryEvent = { t: Date.now(), k, d: d ? Object.fromEntries(Object.entries(d).map(([a, b]) => [a, short(b)])) : undefined };
  events.push(e); unsent.push(e);
  if (events.length > MAX) events.splice(0, events.length - MAX);
  if (unsent.length > 500) unsent.splice(0, unsent.length - 500);
  dirty = true;
}
export const diaryEvents = () => events;

async function load() {
  if (loaded) return;
  loaded = true;
  const saved = await readJson<DiaryEvent[]>(FILE, []);
  events = [...saved, ...events].slice(-MAX);
}
async function save() {
  if (!dirty) return;
  dirty = false;
  await writeJson(FILE, events).catch(() => {});
}

type Sender = (events: DiaryEvent[]) => Promise<void>;
let sender: Sender | null = null;
export const setDiarySender = (fn: Sender) => { sender = fn; };
async function upload() {
  if (!sender || !unsent.length || getSettings().privacyMode) return;
  const batch = unsent.slice(0, 200);
  try { await sender(batch); unsent.splice(0, batch.length); } catch {}
}

// Catch JavaScript errors anywhere in the app.
const EU: any = (globalThis as any).ErrorUtils;
if (EU?.getGlobalHandler) {
  const prev = EU.getGlobalHandler();
  EU.setGlobalHandler((err: any, fatal?: boolean) => {
    note('js-error', { msg: String(err?.message ?? err), stack: String(err?.stack ?? '').slice(0, 600), fatal: !!fatal });
    save();
    prev?.(err, fatal);
  });
}

load().then(() => note('app-start'));
setInterval(save, 20000);
setInterval(upload, 4 * 60 * 1000);
setTimeout(upload, 30000);

/** Save now and send soon (used when the user reports a problem). */
export const flushDiary = () => { dirty = true; save(); setTimeout(upload, 2000); };
