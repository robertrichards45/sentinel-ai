/**
 * "Alice, take a picture of this and add it to my calendar" (or notes / reminders). Opens the iPhone camera
 * (or your photos), reads the picture, and files it: an event with time, place and a leave-time alert; a
 * reminder; or a note that keeps the photo (Memory tab). Events and reminders ask you to confirm first.
 */
import * as ImagePicker from 'expo-image-picker';
import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { respond } from './ai';
import { memory } from './memory';
import { note } from './diary';
import { PHOTO_PROMPT, PhotoTarget, parsePhotoFiling } from './photoCore';

async function getPhoto(fromLibrary: boolean) {
  const opts: ImagePicker.ImagePickerOptions = { base64: true, quality: 0.6, mediaTypes: ['images'] };
  if (fromLibrary) return ImagePicker.launchImageLibraryAsync(opts);
  const p = await ImagePicker.requestCameraPermissionsAsync();
  if (!p.granted) throw new Error('I need camera permission for that.');
  return ImagePicker.launchCameraAsync(opts);
}

function keepPhoto(uri: string): string | undefined {
  try {
    const dir = new Directory(Paths.document, 'Alice Photos');
    if (!dir.exists) dir.create();
    const dest = new File(dir, `${Date.now()}.jpg`);
    new File(uri).copy(dest);
    return dest.uri;
  } catch { return undefined; }
}

/** runAction is passed in to avoid a circular import with actions.ts. */
export async function photoToPlanner(target: PhotoTarget, fromLibrary: boolean, runAction: (a: any) => Promise<string>): Promise<string> {
  if (AppState.currentState !== 'active') return 'Open Alice on your phone so I can show the camera, then ask again.';
  const r = await getPhoto(fromLibrary);
  if (r.canceled || !r.assets?.[0]?.base64) return 'No picture taken.';
  const a = r.assets[0];
  const reply = await respond('general', PHOTO_PROMPT(target, new Date()), [], 'File this photo.', a.base64!);
  const f = parsePhotoFiling(reply.text, target);
  note('photo-file', { kind: f?.kind ?? 'unreadable', target });
  if (!f) return "I couldn't read that picture. Try again a little closer, with good light.";
  if (f.kind === 'event') {
    const out = await runAction({ type: 'event', title: f.title, start: f.start, durationMin: f.durationMin, ...(f.place ? { place: f.place } : {}) });
    if (f.details) await memory.note(`${f.title}: ${f.details}`);
    return out + (f.details && /time not shown/i.test(f.details) ? " The photo didn't show a time, so I put 9 AM. Tell me if that's wrong." : '');
  }
  if (f.kind === 'reminder') {
    const out = await runAction({ type: 'reminder', title: f.title, ...(f.due ? { due: f.due } : {}) });
    if (f.details) await memory.note(`${f.title}: ${f.details}`);
    return out;
  }
  const img = keepPhoto(a.uri);
  await memory.note(`${f.title}: ${f.text}`, img);
  return `Saved a note, "${f.title}", with the photo. It's on the Memory tab.`;
}
