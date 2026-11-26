/**
 * Pure media logic, unit-tested on the PC against the real files from the glasses.
 * Handles three verified firmware bugs:
 *   1. EXIF month written one behind (e.g. 2026:10:25 for a Nov 25 photo)
 *   2. File names sometimes in UTC, sometimes local time
 *   3. FAT bitmap bug can leave a .jpeg that is actually overwritten video data
 */

export type Integrity = { ok: boolean; kind: 'jpeg' | 'mp4' | 'unknown'; reason?: string; durationSec?: number };

export function checkJpeg(b: Uint8Array): Integrity {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return { ok: false, kind: 'jpeg', reason: 'No JPEG header (file was likely overwritten by the glasses firmware bug)' };
  for (let i = b.length - 2; i >= Math.max(0, b.length - 32); i--) if (b[i] === 0xff && b[i + 1] === 0xd9) return { ok: true, kind: 'jpeg' };
  return { ok: false, kind: 'jpeg', reason: 'JPEG is cut off (no end marker)' };
}

const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const box = (b: Uint8Array, i: number) => String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);

export function checkMp4(b: Uint8Array): Integrity {
  const seen: string[] = [];
  let i = 0, durationSec: number | undefined;
  while (i + 8 <= b.length) {
    let size = be32(b, i);
    const t = box(b, i);
    if (size === 1) size = be32(b, i + 12) + be32(b, i + 8) * 2 ** 32;
    if (size === 0) size = b.length - i;
    if (size < 8 || i + size > b.length) return { ok: false, kind: 'mp4', reason: `Damaged '${t}' section` };
    seen.push(t);
    if (t === 'moov') {
      // mvhd is the first child of moov in these files
      const m = i + 8;
      if (box(b, m) === 'mvhd') {
        const v = b[m + 8];
        const ts = v === 0 ? be32(b, m + 20) : be32(b, m + 28);
        const dur = v === 0 ? be32(b, m + 24) : be32(b, m + 32) * 2 ** 32 + be32(b, m + 36);
        if (ts) durationSec = dur / ts;
      }
    }
    i += size;
  }
  for (const need of ['ftyp', 'mdat', 'moov']) if (!seen.includes(need)) return { ok: false, kind: 'mp4', reason: `Missing '${need}' (recording was not finished)` };
  return { ok: true, kind: 'mp4', durationSec };
}

export function checkMedia(name: string, b: Uint8Array): Integrity {
  const n = name.toLowerCase();
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return checkJpeg(b);
  if (n.endsWith('.mp4') || n.endsWith('.mov')) return checkMp4(b);
  return { ok: false, kind: 'unknown', reason: 'Not a photo or video from the glasses' };
}

/** Glasses file names: yyyyMMddHHmmss.ext */
export function nameDate(name: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } | null {
  const m = name.match(/(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { y, mo, d, h, mi, s } : null;
}

/**
 * EXIF date "YYYY:MM:DD HH:MM:SS" written one month behind. Returns the corrected
 * string, or null when it already matches the file name (nothing to fix).
 */
export function fixedExifDate(exif: string, fileName: string): string | null {
  const e = exif.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/);
  const n = nameDate(fileName);
  if (!e || !n) return null;
  const ey = +e[1], em = +e[2], ed = +e[3];
  if (ey === n.y && em === n.mo) return null; // already right
  const nextM = em === 12 ? 1 : em + 1, nextY = em === 12 ? ey + 1 : ey;
  if (nextM === n.mo && nextY === n.y && ed === n.d) return `${n.y}:${String(n.mo).padStart(2, '0')}:${e[3]} ${e[4]}`;
  return null; // some other mismatch: don't guess
}

/** Locate the EXIF (APP1) segment. Tolerates 0xFF fill bytes, which this firmware emits. */
export function findExifSegment(b: Uint8Array): { start: number; end: number } | null {
  let i = 2;
  while (i + 4 < b.length && i < 65536) {
    if (b[i] !== 0xff) return null;
    while (b[i + 1] === 0xff) i++; // fill bytes
    const marker = b[i + 1];
    if (marker === 0xda || marker === 0xd9) return null; // image data starts: no EXIF
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) return { start: i + 4, end: i + 2 + len };
    i += 2 + len;
  }
  return null;
}

const DATE_LEN = 19; // "YYYY:MM:DD HH:MM:SS"
const isDateAt = (b: Uint8Array, i: number) => {
  const p = 'dddd:dd:dd dd:dd:dd';
  for (let k = 0; k < DATE_LEN; k++) {
    const c = b[i + k];
    if (p[k] === 'd' ? c < 0x30 || c > 0x39 : c !== p.charCodeAt(k)) return false;
  }
  return true;
};

/**
 * Fixes the month bug by overwriting each EXIF date string IN PLACE with a string of
 * identical length. No bytes are inserted or removed, so image data cannot be affected.
 * Returns a new array (the original is never modified).
 */
export function repairJpegDate(name: string, jpeg: Uint8Array): { bytes: Uint8Array; changed: boolean; from?: string; to?: string; count: number } {
  const seg = findExifSegment(jpeg);
  if (!seg) return { bytes: jpeg, changed: false, count: 0 };
  const out = jpeg.slice();
  let from: string | undefined, to: string | undefined, count = 0;
  for (let i = seg.start; i + DATE_LEN <= seg.end; i++) {
    if (!isDateAt(out, i)) continue;
    const cur = String.fromCharCode(...out.subarray(i, i + DATE_LEN));
    const fixed = fixedExifDate(cur, name);
    if (fixed && fixed.length === DATE_LEN) {
      for (let k = 0; k < DATE_LEN; k++) out[i + k] = fixed.charCodeAt(k);
      from = cur; to = fixed; count++;
    }
    i += DATE_LEN - 1;
  }
  return count ? { bytes: out, changed: true, from, to, count } : { bytes: jpeg, changed: false, count: 0 };
}

/** Read the first EXIF date string (used by tests and the import report). */
export function readExifDate(jpeg: Uint8Array): string | null {
  const seg = findExifSegment(jpeg);
  if (!seg) return null;
  for (let i = seg.start; i + DATE_LEN <= seg.end; i++) if (isDateAt(jpeg, i)) return String.fromCharCode(...jpeg.subarray(i, i + DATE_LEN));
  return null;
}
