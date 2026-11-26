import { speak } from './voice';
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
      // A new photo/video was saved on the glasses (count only rises when a file is written).
      if (s.mediaCount !== undefined && e.count > s.mediaCount && getSettings().announceRecording) speak(e.count - s.mediaCount > 1 ? 'Saved.' : 'Photo saved.');
      if (importedCount === undefined) importedCount = e.count;
      set({ mediaCount: e.count, newMediaSinceImport: Math.max(0, e.count - (importedCount ?? e.count)), lastPacket: now });
      break;
    case 'heartbeat': {
      set({ heartbeat: e.value, lastPacket: now });
      const lim = getSettings().lowBatteryAlert;
      if (e.value <= lim && !lowWarned) { lowWarned = true; speak(`Your glasses battery is at ${e.value} percent.`); }
      if (e.value > lim + 5) lowWarned = false;
      break;
    }
    case 'clock': set({ clockSkewSec: Math.round(e.unixSeconds - now / 1000) }); break;
    case 'busy': {
      const rising = e.on && !s.busy;
      set({ busy: e.on, busySince: e.on ? now : undefined, lastPacket: now });
      // The busy flag rises for a photo, a video AND the AI microphone, so don't announce it.
      // Photos are announced when the photo count rises; a long busy with no voice is a video.
      if (rising && getSettings().announceRecording) {
        voiceSeen = false;
        const started = now;
        setTimeout(() => { if (s.busy && s.busySince === started && !voiceSeen) speak('Recording video.'); }, 8000);
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
