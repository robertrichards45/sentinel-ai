/**
 * Meeting notes: "Alice, take notes." She stops talking and listens with the iPhone mic, transcribes every
 * 2 minutes in the background, and when you say stop (glasses button, the banner in the app, or 3 hours)
 * she writes a summary with decisions and action items. Notes stay on this iPhone (meetings.json).
 * Recording people can need their consent where you live; the app reminds you once when you start.
 */
import type { AudioRecorder } from 'expo-audio';
// expo-audio doesn't export the recorder class outside its hook; this is the same object useAudioRecorder makes.
import AudioModule from 'expo-audio/build/AudioModule';
import { readJson, writeJson } from './storage';
import { enableVoiceSession, enablePlaybackSession, speak, prepareRecorder, onSpeaking } from './voice';
import { transcribe, respond } from './ai';
import { live } from './live';
import { memory } from './memory';
import { setPhoneMic } from './micState';
import { note } from './diary';

export type Meeting = { id: string; title: string; started: number; ended?: number; transcript: string; summary?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let talking = false;
onSpeaking((on) => { talking = on; });
const isSpeaking = () => talking;

const CHUNK_MS = 2 * 60_000;
const MAX_MS = 3 * 60 * 60_000;

let meetings: Meeting[] = [];
let loaded = false;
let current: Meeting | null = null;
let rec: AudioRecorder | null = null;
let chunkTimer: ReturnType<typeof setTimeout> | null = null;
let pending: Promise<void>[] = [];
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export const onMeetings = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const takingNotes = () => !!current;
export const currentMeeting = () => current;
export async function listMeetings() { if (!loaded) { meetings = await readJson<Meeting[]>('meetings.json', []); loaded = true; } return meetings; }
const save = async () => { await writeJson('meetings.json', meetings.slice(-100)); changed(); };

async function newRecorder() {
  const r = new (AudioModule as any).AudioRecorder({}) as AudioRecorder;
  await prepareRecorder(r); // same known-good iOS settings as the voice button
  // The iPhone's own mic hears a room better, and keeps the glasses free so their button can stop notes.
  try { const b = r.getAvailableInputs().find((i) => /builtin|built-in|iphone/i.test(`${i.type} ${i.name}`)); if (b) r.setInput(b.uid); } catch {}
  r.record();
  return r;
}

/** Close the current 2-minute piece, start the next one right away, transcribe the closed one in the background. */
async function rotate(final = false) {
  if (!rec || !current) return;
  const old = rec;
  rec = null;
  try { await old.stop(); } catch {}
  const uri = old.uri;
  if (!final) { try { rec = await newRecorder(); } catch (e: any) { note('notes-error', { step: 'restart', msg: String(e?.message ?? e) }); } }
  const m = current;
  if (uri) pending.push(transcribe(uri).then((t) => { if (t) { m.transcript += (m.transcript ? ' ' : '') + t.trim(); save(); } })
    .catch((e) => note('notes-error', { step: 'transcribe', msg: String(e?.message ?? e) })));
  if (!final && rec) chunkTimer = setTimeout(() => {
    if (current && Date.now() - current.started > MAX_MS) stopNotes(); else rotate();
  }, CHUNK_MS);
}

export async function startNotes(title = 'Meeting'): Promise<string> {
  if (current) return "I'm already taking notes. Press the glasses button or tap Stop notes when you're done.";
  await listMeetings();
  setPhoneMic(true); // keeps "Hey Alice" out of the way
  current = { id: Date.now().toString(36), title: title.slice(0, 80) || 'Meeting', started: Date.now(), transcript: '' };
  meetings.push(current);
  pending = [];
  await save();
  // Let her finish saying "taking notes" first, then hang up the conversation and start recording.
  const m = current;
  (async () => {
    await sleep(1500);
    for (let t = 0; t < 40 && (live.state === 'speaking' || live.state === 'thinking' || isSpeaking()); t++) await sleep(250);
    if (current !== m) return;
    if (live.state !== 'off') { live.stop(); await sleep(500); }
    try {
      await enableVoiceSession();
      rec = await newRecorder();
      m.started = Date.now();
      chunkTimer = setTimeout(() => rotate(), CHUNK_MS);
      note('notes-start', {});
    } catch (e: any) {
      note('notes-error', { step: 'start', msg: String(e?.message ?? e) });
      meetings = meetings.filter((x) => x !== m); current = null; setPhoneMic(false); await save();
      speak("Sorry, I couldn't start the recording.").catch(() => {});
    }
    changed();
  })();
  return 'Taking notes. I\'ll stay quiet. Press the glasses button or tap Stop notes when you\'re done. Make sure everyone is OK being recorded.';
}

const SUMMARY = `You turn a meeting transcript into notes. Reply in plain text, no markdown symbols:
A one-line title on the first line.
Then "Summary:" with 2 to 5 short sentences.
Then "Decisions:" as lines starting with "- " (or "- None").
Then "Action items:" as lines starting with "- ", each with who and when if said (or "- None").
Use only what is in the transcript. The transcript comes from speech recognition and may have errors.`;

export async function stopNotes(): Promise<string> {
  if (!current) return "I wasn't taking notes.";
  const m = current;
  if (chunkTimer) clearTimeout(chunkTimer);
  chunkTimer = null;
  await rotate(true);
  current = null;
  setPhoneMic(false);
  await enablePlaybackSession();
  m.ended = Date.now();
  await save();
  const mins = Math.max(1, Math.round((m.ended - m.started) / 60000));
  speak(`Got it, ${mins} minute${mins === 1 ? '' : 's'}. Writing up the notes.`).catch(() => {});
  await Promise.allSettled(pending);
  if (!m.transcript.trim()) { m.summary = 'Nothing was heard.'; await save(); return "I didn't catch anything to take notes on."; }
  try {
    const r = await respond('general', SUMMARY, [], m.transcript.slice(-60000));
    m.summary = r.text.trim();
    const first = m.summary.split('\n')[0].trim();
    if (first && first.length < 90) m.title = first;
  } catch (e: any) { m.summary = ''; note('notes-error', { step: 'summary', msg: String(e?.message ?? e) }); }
  await save();
  await memory.note(`Meeting notes ${new Date(m.started).toLocaleDateString()} "${m.title}": ${(m.summary ?? '').replace(/\n+/g, ' ').slice(0, 400)}`);
  note('notes-done', { mins, chars: m.transcript.length });
  const actions = (m.summary ?? '').split(/Action items:/i)[1]?.trim();
  return m.summary ? `Notes saved on the Memory tab. ${actions && !/^- none/i.test(actions) ? 'Action items: ' + actions.replace(/^- /gm, '').replace(/\n/g, '. ') : 'No action items.'}` : 'I saved the transcript on the Memory tab, but couldn\'t write the summary. Try again later from there.';
}

/** Re-run the summary for a saved meeting (e.g. it failed offline). */
export async function resummarize(id: string) {
  const m = (await listMeetings()).find((x) => x.id === id);
  if (!m?.transcript) return;
  const r = await respond('general', SUMMARY, [], m.transcript.slice(-60000));
  m.summary = r.text.trim();
  await save();
}

export async function deleteMeeting(id: string) { meetings = (await listMeetings()).filter((m) => m.id !== id); await save(); }
