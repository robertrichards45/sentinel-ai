import * as Speech from 'expo-speech';
import { glasses, LinkState } from './ble';
import { getSettings } from './settings';
import { ssidFromMac } from './protocol';

export type GlassesState = {
  link: LinkState;
  linkDetail?: string;
  mac?: string;
  ssid?: string;
  mediaCount?: number; // verified meaning
  heartbeat?: number; // LIKELY battery %
  busy: boolean; // LIKELY camera/mic active
  busySince?: number;
  clockSkewSec?: number; // glasses clock minus phone clock
  lastPacket?: number;
  newMediaSinceImport: number;
};

let s: GlassesState = { link: 'idle', busy: false, newMediaSinceImport: 0 };
let importedCount: number | undefined;
let lowWarned = false;
const listeners = new Set<(g: GlassesState) => void>();
const buttonListeners = new Set<() => void>();
const set = (p: Partial<GlassesState>) => { s = { ...s, ...p }; listeners.forEach((l) => l(s)); };

export const getGlasses = () => s;
export const onGlasses = (fn: (g: GlassesState) => void) => { listeners.add(fn); return () => listeners.delete(fn); };
/** EXPERIMENTAL: fires on the rising edge of the busy flag when the setting is on. */
export const onGlassesButton = (fn: () => void) => { buttonListeners.add(fn); return () => buttonListeners.delete(fn); };
export const markImported = () => { importedCount = s.mediaCount; set({ newMediaSinceImport: 0 }); };

let voiceSeen = false;
glasses.on((e: any) => {
  const now = Date.now();
  switch (e.kind) {
    case 'voice': if (e.on) voiceSeen = true; break;
    case 'link': set({ link: e.state, linkDetail: e.detail }); break;
    case 'address': set({ mac: e.mac, ssid: ssidFromMac(e.mac) }); break;
    case 'mediaCount':
      if (importedCount === undefined) importedCount = e.count;
      set({ mediaCount: e.count, newMediaSinceImport: Math.max(0, e.count - (importedCount ?? e.count)), lastPacket: now });
      break;
    case 'heartbeat': {
      set({ heartbeat: e.value, lastPacket: now });
      const lim = getSettings().lowBatteryAlert;
      if (e.value <= lim && !lowWarned) { lowWarned = true; Speech.speak(`Glasses battery may be low, ${e.value} percent.`, { language: getSettings().voiceLanguage }); }
      if (e.value > lim + 5) lowWarned = false;
      break;
    }
    case 'clock': set({ clockSkewSec: Math.round(e.unixSeconds - now / 1000) }); break;
    case 'busy': {
      const rising = e.on && !s.busy;
      set({ busy: e.on, busySince: e.on ? now : undefined, lastPacket: now });
      // The busy flag also rises when the glasses' AI microphone starts, so wait: if a voice
      // recording begins (54 12 04) it is the mic, not the camera, and we stay quiet.
      if (rising && getSettings().announceRecording) {
        voiceSeen = false;
        setTimeout(() => { if (s.busy && !voiceSeen) Speech.speak('Camera active.', { rate: 1.1, language: getSettings().voiceLanguage }); }, 4000);
      }
      break;
    }
  }
});

export function glassesStatusText(): string {
  if (s.link !== 'connected') return 'Your glasses are not connected right now.';
  const parts = ['Glasses connected.'];
  if (s.heartbeat !== undefined) parts.push(`Battery reads about ${s.heartbeat} percent.`);
  if (s.mediaCount !== undefined) parts.push(`${s.mediaCount} photos and videos stored, ${s.newMediaSinceImport} new.`);
  if (s.busy) parts.push('The camera is active right now.');
  return parts.join(' ');
}
