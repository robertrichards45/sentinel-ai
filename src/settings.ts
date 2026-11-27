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
  serverUrl: string; // blank = Alice's hosted server
  providerOverride: '' | 'gemini' | 'openai'; // testing only; server must allow it
  voice: string; // a natural voice name from Alice's server, or 'iphone' for the built-in offline voice
  voiceStyle: string; // id from VOICE_STYLES in voice.ts
  voicePitch: number; // -2 (deeper) .. +2 (higher)
  modeVoices: Record<string, string>; // optional per-mode voice overrides, e.g. { research: 'Charon' }
  glassesModel: '' | 'g2' | 'headphones' | 'meta' | 'none'; // '' = not chosen yet (first-launch setup)
  dailyHeadsUp: boolean; // first time the glasses connect each day, Alice tells you what's on today
  catchUp: boolean; // 'welcome back' summary when the glasses reconnect after 2+ hours
  eveningRecap: boolean; // daily recap notification
  recapHour: number; // 0-23
  customWords: string[]; // names/words to bias speech recognition toward
  shortcuts: string[]; // Siri Shortcut names Alice may run
  emergencyContacts: string[]; // names from Contacts, or phone numbers
  heyAlice: boolean; // listen for "Hey Alice" (on-device, phone mic, while Alice is open or in the background)
  glassesConversation: boolean; // hands-free back-and-forth through the glasses mic (official app's commands)
  glassesAudio: boolean; // headset mode: glasses connect as Bluetooth headphones so Alice is heard through them
  liveConversation: boolean; // real-time, interruptible conversation (Gemini Live) instead of one question at a time
};

/** AI models are chosen on Alice's server (server/src/config.mjs), not on the phone. */
export const DEFAULTS: Settings = {
  chatModel: '',
  transcribeModel: '',
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
  serverUrl: '',
  providerOverride: '',
  voice: 'Sulafat',
  voiceStyle: 'natural',
  voicePitch: 0,
  modeVoices: {},
  liveConversation: true,
  glassesModel: '',
  dailyHeadsUp: true,
  catchUp: true,
  eveningRecap: false,
  recapHour: 21,
  customWords: [],
  shortcuts: [],
  emergencyContacts: [],
  heyAlice: false,
  glassesConversation: false, // off until Robert approves the commands
  glassesAudio: false, // off until Robert approves the command
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
