/**
 * Runs the user's own Siri Shortcuts ("Alice, lights off"), which can control HomeKit scenes, the thermostat
 * and other apps. iOS opens the Shortcuts app to run it and comes straight back to Alice afterwards.
 * Names the user lists in Settings are given to Alice so she can match what you say to the right shortcut.
 */
import { Linking } from 'react-native';
import { getSettings } from './settings';
import { note } from './diary';
import { pickShortcut } from './matchCore';
export { pickShortcut };


export async function runShortcut(name: string): Promise<string> {
  const pick = pickShortcut(name, getSettings().shortcuts ?? []);
  const url = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(pick)}&x-success=${encodeURIComponent('alice://done')}&x-error=${encodeURIComponent('alice://shortcut-failed')}`;
  note('shortcut', { name: pick });
  try { await Linking.openURL(url); } catch { return "I couldn't open Shortcuts on this iPhone."; }
  return `Running ${pick}.`;
}
