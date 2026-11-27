/**
 * "Alice, open Spotify." Opens apps by their iPhone link. For an app that isn't in Alice's list, she runs a
 * Siri Shortcut called "Open <App>" if you've made one (Shortcuts app: new shortcut, Open App action, name it
 * "Open <App>", and add that name in Settings, Siri Shortcuts).
 */
import { Linking } from 'react-native';
import { appUrl } from './appsCore';
import { getSettings } from './settings';
import { runShortcut } from './shortcutsRun';
import { note } from './diary';

export async function openApp(name: string): Promise<string> {
  const a = appUrl(name);
  if (a) {
    try { await Linking.openURL(a.url); note('open-app', { app: a.label }); return `Opening ${a.label}.`; }
    catch { return `${a.label} doesn't seem to be installed.`; }
  }
  const sc = (getSettings().shortcuts ?? []).find((s) => s.toLowerCase() === `open ${name.toLowerCase()}`);
  if (sc) return runShortcut(sc);
  return `I can't open ${name} directly yet. In the Shortcuts app, make a shortcut that opens it, name it "Open ${name}", and add that name in Alice's Settings under Siri Shortcuts. Then just ask me again.`;
}
