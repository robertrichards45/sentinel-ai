/**
 * Alice knows what she can do and what changed. After an update she mentions the new things once (at the start
 * of the next conversation, and on the Home screen), and "what's new?" / "what can you do now?" always works.
 * Add a line to RELEASES with every update.
 */
import * as Application from 'expo-application';
import { readJson, writeJson } from './storage';
import { getSettings } from './settings';

export const RELEASES: { version: string; date: string; items: string[] }[] = [
  { version: '0.18.1', date: '2026-11-27', items: [
    'Say good morning and I give you a full briefing: your day, weather, the drive to work, deadlines coming up and the news',
  ] },
  { version: '0.18.0', date: '2026-11-27', items: [
    'I can control your smart home through Home Assistant, IFTTT or your own webhooks (Settings, Connections)',
    'I read your Apple Health (sleep, steps, heart rate, workouts) if you install the Health version and allow it',
    'I coach workouts with the camera: counting reps and calling out form',
    'I spot deadlines and dates in your notes and conversations that aren\'t on your calendar yet',
    'I can explain what I did and why, and I tell you what\'s new after each update',
    'Long conversations no longer drop after about 10 minutes',
    'There\'s a tour of everything I can do in Settings',
  ] },
  { version: '0.16.0', date: '2026-11-26', items: [
    'Real Word, Excel, PowerPoint and PDF files that follow official standards like federal resumes',
    'I remember everything from past conversations and can look things up in them',
    'I open apps, shop for you, ignore background noise, and fix myself when something gets stuck',
  ] },
  { version: '0.15.0', date: '2026-11-26', items: [
    'Calendar events by voice no longer get stuck, and you can say undo',
    'Better at names you teach me, nearby place choices for directions, Hey Alice in the background',
  ] },
];

export const appVersion = () => Application.nativeApplicationVersion ?? RELEASES[0].version;

let freshUpdate: string[] | null = null;
/** Call once at app start: remembers which version you last used. */
export async function checkUpdated() {
  const v = appVersion();
  const st = await readJson<{ v: string; told: boolean }>('version.json', { v: '', told: true });
  if (st.v && st.v !== v) {
    freshUpdate = RELEASES.filter((r) => cmp(r.version, st.v) > 0 && cmp(r.version, v) <= 0).flatMap((r) => r.items);
    await writeJson('version.json', { v, told: false });
  } else if (!st.v) {
    // First version that tracks this: an existing user (already set up) gets told what's new once.
    const existing = !!getSettings().glassesModel;
    if (existing) freshUpdate = RELEASES[0].items;
    await writeJson('version.json', { v, told: !existing });
  }
  else if (!st.told) freshUpdate = RELEASES.find((r) => r.version === v)?.items ?? null;
}
const cmp = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0; };

/** New since the last version the user had (until she has mentioned it once). */
export const pendingNews = () => freshUpdate;
export async function markNewsTold() { if (!freshUpdate) return; freshUpdate = null; await writeJson('version.json', { v: appVersion(), told: true }); }

export function whatsNewText(): string {
  const r = RELEASES.find((x) => x.version === appVersion()) ?? RELEASES[0];
  return `I'm version ${appVersion()}. New in this update: ${r.items.join('; ')}.`;
}

/** For Alice's own instructions: who she is right now. */
export function selfKnowledge(): string {
  const news = pendingNews();
  return [
    `You are Alice, version ${appVersion()}. Be self-aware: if asked what you can do, what changed, or how you work, answer from your tools and this list; call the capabilities or whats_new tools for details.`,
    news?.length ? `You were just updated. At the start of this conversation, briefly mention one or two of these new abilities in a sentence (only once), then help as usual: ${news.join('; ')}.` : '',
  ].filter(Boolean).join(' ');
}
