/**
 * Words Alice should know: your contacts' names, people you've told her about, saved places, Shortcut and
 * list names, and words you teach her ("Alice, learn the name Kylee, K-Y-L-E-E"). Given to every speech
 * recognizer (Gemini live, server transcription, on-device) so "Kylee" isn't heard as "college".
 */
import { Contact, ContactField, getPermissionsAsync } from 'expo-contacts';
import { getSettings, updateSettings } from './settings';
import { peopleNames } from './people';
import { readJson } from './storage';

let contactNames: string[] = [];
let loadedAt = 0;

async function refreshContacts() {
  if (Date.now() - loadedAt < 3600_000) return;
  loadedAt = Date.now();
  try {
    if ((await getPermissionsAsync()).status !== 'granted') return;
    const all: any[] = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.NICKNAME] as any).catch(() => []);
    const names = new Set<string>();
    for (const c of all) for (const n of [c.fullName, c.nickname]) if (typeof n === 'string' && n.trim() && n.length < 40) names.add(n.trim());
    contactNames = [...names].slice(0, 250);
  } catch {}
}

let spots: string[] = [];
async function refreshSpots() { try { const j = await readJson<any>('spots.json', {}); spots = Object.keys(j?.spots ?? j ?? {}).filter((k) => k.length < 30); } catch {} }

/** Unique list, the words you taught first, capped so prompts stay small. */
export function vocabList(max = 300): string[] {
  const s = getSettings();
  const seen = new Set<string>(); const out: string[] = [];
  for (const w of [...(s.customWords ?? []), ...peopleNames(), ...contactNames, ...(s.shortcuts ?? []), ...spots]) {
    const k = w.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(w); }
    if (out.length >= max) break;
  }
  return out;
}
export const vocabHint = (max = 300) => vocabList(max).join(', ');
export async function refreshVocab() { await Promise.all([refreshContacts(), refreshSpots()]); }

export async function learnWord(word: string): Promise<string> {
  const w = word.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!w) return 'What word should I learn?';
  const cur = getSettings().customWords ?? [];
  if (!cur.some((x) => x.toLowerCase() === w.toLowerCase())) await updateSettings({ customWords: [w, ...cur].slice(0, 100) });
  return `Got it, ${w}. I'll listen for that from now on.`;
}
refreshVocab();
