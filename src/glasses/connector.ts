/**
 * The active glasses connector. G2 uses Alice's own Bluetooth data link (src/ble.ts); every other kind of glasses
 * is used as normal iPhone Bluetooth audio, so Alice only needs to know whether they are the current audio route.
 */
import { AudioManager } from 'react-native-audio-api';
import { glasses as g2 } from '../ble';
import { getSettings, onSettings } from '../settings';
import { glassesInfo, GlassesModel } from './catalog';

export const activeModel = (): GlassesModel => (getSettings().glassesModel || 'g2') as GlassesModel;
export const activeGlasses = () => glassesInfo(activeModel());

/** Start whatever the chosen glasses need (G2: connect the data link; others: nothing). */
export function startGlasses() {
  if (activeGlasses().caps.dataLink) g2.connect().catch(() => {});
}

/** Name of the Bluetooth audio device iPhone is using right now, if any (e.g. "Bose Frames"). */
export async function bluetoothAudioName(): Promise<string | null> {
  try {
    const info: any = await AudioManager.getDevicesInfo();
    const all = [...(info.currentOutputs ?? []), ...(info.currentInputs ?? []), ...(info.availableInputs ?? [])];
    const bt = all.find((d: any) => /bluetooth|a2dp|hfp|headphones/i.test(String(d.category ?? d.type ?? '')));
    return bt ? String(bt.name || 'Bluetooth glasses') : null;
  } catch { return null; }
}

// Switching away from G2 drops its data link; switching to it connects.
let last = '';
onSettings((s) => {
  const m = s.glassesModel || '';
  if (m === last) return;
  const prev = last; last = m;
  if (!prev) return; // first load: App starts the glasses itself
  if (glassesInfo(m).caps.dataLink) g2.connect().catch(() => {});
  else g2.disconnect().catch(() => {});
});
