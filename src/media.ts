import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import { File, Paths } from 'expo-file-system';
import { Asset, Album, requestPermissionsAsync } from 'expo-media-library';
import { checkMedia, repairJpegDate } from './mediaCore';
import { readJsonArray, writeJson } from './storage';
import { markImported } from './glassesState';

export type ImportResult = { name: string; status: 'saved' | 'duplicate' | 'damaged' | 'error'; note?: string };
const ALBUM = 'SENTINEL Glasses';

/**
 * Import photos/videos picked in the Files app (e.g. the glasses' USB drive on a
 * USB-C iPhone, or files AirDropped from the PC). Originals are never modified:
 * a repaired copy is written to the app cache and that copy is saved to Photos.
 */
export async function importFromFiles(onProgress?: (r: ImportResult) => void): Promise<ImportResult[]> {
  const pick = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: ['image/jpeg', 'video/mp4', 'video/quicktime'] });
  if (pick.canceled) return [];
  const perm = await requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('Photos permission is needed to save imports.');

  const seen = new Set(await readJsonArray<string>('imported-hashes.json'));
  let album = await Album.get(ALBUM);
  const results: ImportResult[] = [];

  for (const a of pick.assets) {
    const name = a.name ?? 'file';
    let r: ImportResult;
    try {
      const src = new File(a.uri);
      const bytes = await src.bytes();
      const hash = Buffer.from(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)).toString('hex');
      const integrity = checkMedia(name, bytes);
      if (seen.has(hash)) r = { name, status: 'duplicate' };
      else if (!integrity.ok) r = { name, status: 'damaged', note: integrity.reason };
      else {
        let note: string | undefined;
        let toSave = src;
        if (integrity.kind === 'jpeg') {
          const fix = repairJpegDate(name, bytes);
          if (fix.changed) {
            const out = new File(Paths.cache, 'fixed-' + name);
            if (out.exists) out.delete();
            out.create();
            await out.write(fix.bytes);
            toSave = out;
            note = `date fixed ${fix.from} → ${fix.to}`;
          }
        } else if (integrity.durationSec !== undefined) note = `${integrity.durationSec.toFixed(1)} s video`;
        const asset = await Asset.create(toSave.uri);
        if (album) await album.add(asset);
        else album = await Album.create(ALBUM, [asset]);
        seen.add(hash);
        r = { name, status: 'saved', note };
      }
    } catch (e: any) {
      r = { name, status: 'error', note: String(e?.message ?? e).slice(0, 120) };
    }
    results.push(r);
    onProgress?.(r);
  }
  await writeJson('imported-hashes.json', [...seen]);
  if (results.some((r) => r.status === 'saved')) markImported();
  return results;
}
