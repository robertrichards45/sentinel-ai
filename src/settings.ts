import { readJson, writeJson } from './storage';

export type Settings = {
  chatModel: string; // text + image model
  transcribeModel: string;
  translateTo: string; // spoken language for translation mode
  voiceLanguage: string; // iOS TTS voice language, e.g. en-US
  speechRate: number;
  preferGlassesMic: boolean;
  memoryEnabled: boolean;
  privacyMode: boolean; // true = nothing leaves the phone (AI features off)
  announceRecording: boolean; // speak "camera active" when glasses report busy
  buttonTriggersAssistant: boolean; // EXPERIMENTAL: glasses busy flag starts listening
  lowBatteryAlert: number; // % (heartbeat value is only LIKELY battery)
  activeMode: string;
  confirmActions: boolean; // always ask before creating reminders/events/emails
};

/** Model IDs checked against OpenAI docs on 2026-11-25. Editable in Settings. */
export const DEFAULTS: Settings = {
  chatModel: 'gpt-6-luna',
  transcribeModel: 'gpt-transcribe',
  translateTo: 'Spanish',
  voiceLanguage: 'en-US',
  speechRate: 1.0,
  preferGlassesMic: true,
  memoryEnabled: true,
  privacyMode: false,
  announceRecording: true,
  buttonTriggersAssistant: false,
  lowBatteryAlert: 15,
  activeMode: 'general',
  confirmActions: true,
};

let cache: Settings = DEFAULTS;
const listeners = new Set<(s: Settings) => void>();

export async function loadSettings() {
  cache = await readJson('settings.json', DEFAULTS);
  listeners.forEach((l) => l(cache));
  return cache;
}
export const getSettings = () => cache;
export async function updateSettings(patch: Partial<Settings>) {
  cache = { ...cache, ...patch };
  await writeJson('settings.json', cache);
  listeners.forEach((l) => l(cache));
}
export function onSettings(fn: (s: Settings) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
