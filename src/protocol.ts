/**
 * G2 glasses BLE protocol — decoded ONLY from packets captured on 2026-11-25
 * (notify_capture_1/2.jsonl). Every field says how sure we are.
 *   verified  = matched against an independent measurement
 *   likely    = strong pattern, not independently confirmed
 *   unknown   = seen, meaning not known (kept raw)
 * No command (write) formats are known yet, so this file only decodes.
 */

export const UUID = {
  // Vendor channel A: status records (verified source of all 33F4 traffic)
  SVC_A: '000056ff-0000-1000-8000-00805f9b34fb',
  A_NOTIFY: '000033f4-0000-1000-8000-00805f9b34fb',
  A_WRITE: '000033f3-0000-1000-8000-00805f9b34fb',
  // Vendor channel B: 9-byte state flags
  SVC_B: '000057ff-0000-1000-8000-00805f9b34fb',
  B_NOTIFY: '000033f6-0000-1000-8000-00805f9b34fb',
  B_WRITE: '000033f5-0000-1000-8000-00805f9b34fb',
  // Vendor channel C: silent so far
  SVC_C: '0000fa00-0000-1000-8000-00805f9b34fb',
  C_NOTIFY: '0000ea01-0000-1000-8000-00805f9b34fb',
  C_WRITE: '0000ea02-0000-1000-8000-00805f9b34fb',
  // Dialog/Renesas SUOTA = FIRMWARE UPDATE service. NEVER WRITE.
  SVC_FIRMWARE_UPDATE: '0000fef5-0000-1000-8000-00805f9b34fb',
} as const;

export const ADV_NAME = 'G2';
export const ADV_COMPANY_ID = 0x594a; // manufacturer-data company id seen in adverts

export type Confidence = 'verified' | 'likely' | 'unknown';

export type GlassesEvent =
  | { kind: 'mediaCount'; count: number; confidence: 'verified' }
  | { kind: 'clock'; unixSeconds: number; slot: number; confidence: 'verified' }
  | { kind: 'heartbeat'; value: number; confidence: 'likely' } // value probably battery %
  | { kind: 'address'; mac: string; confidence: 'verified' }
  | { kind: 'status'; fields: number[]; confidence: 'unknown' }
  | { kind: 'busy'; on: boolean; raw: string; confidence: 'likely' } // channel B flag
  | { kind: 'mediaEvent'; code: number; raw: string; confidence: 'unknown' } // e.g. 54 12
  | { kind: 'voice'; on: boolean; confidence: 'verified' } // 54 12 04 = glasses started listening, 54 12 00 = stopped
  | { kind: 'voiceAudio'; seq: number; frames: Uint8Array[]; confidence: 'verified' } // Opus frames from the glasses mic
  | { kind: 'voiceEnd'; packets: number; confidence: 'verified' }
  | { kind: 'raw'; channel: string; hex: string; confidence: 'unknown' };

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const mac = (b: Uint8Array, i: number) =>
  Array.from(b.slice(i, i + 6), (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(':');

/** Channel A (33F4) — 20-byte records, first byte = record type. */
export function parseChannelA(b: Uint8Array): GlassesEvent {
  if (b.length === 0) return { kind: 'raw', channel: 'A', hex: '', confidence: 'unknown' };
  const t = b[0];
  switch (t) {
    case 0x54:
      // 54 06 NN: NN rose 2->4->5->6 exactly as files were written (checked vs USB drive).
      if (b[1] === 0x06) return { kind: 'mediaCount', count: b[2], confidence: 'verified' };
      // 54 12 04 / 54 12 00 bracket every glasses-mic recording (verified 2026-11-26: 3 recordings,
      // transcribed as "How you doing, man?", "Hey sweetie, are you awake?", "How are you today?").
      if (b[1] === 0x12 && (b[2] === 0x04 || b[2] === 0x00)) return { kind: 'voice', on: b[2] === 0x04, confidence: 'verified' };
      return { kind: 'mediaEvent', code: b[1], raw: hex(b), confidence: 'unknown' };
    case 0x03:
    case 0x13:
      // little-endian Unix seconds; matched the capture wall-clock to the second.
      return { kind: 'clock', unixSeconds: u32(b, 1), slot: t, confidence: 'verified' };
    case 0x0b:
      return { kind: 'heartbeat', value: b[1], confidence: 'likely' };
    case 0xec:
      return { kind: 'address', mac: mac(b, 1), confidence: 'verified' };
    case 0xf6:
      // same 3 numbers (157, 57, 67) appear in the advertisement; meaning unknown.
      return { kind: 'status', fields: [u16(b, 2), u16(b, 11), u16(b, 13)], confidence: 'unknown' };
    default:
      return { kind: 'raw', channel: 'A', hex: hex(b), confidence: 'unknown' };
  }
}

/**
 * Channel B (33F6)
 *  - 9 bytes `01 00 01 00 01 00 01 00 XX`: busy flag (camera OR microphone in use).
 *  - Mic audio (verified): `02 00 00 00 | seq u16 LE | len u16 LE | count u8 | count x ([len u8][Opus frame])`.
 *    Every frame starts with TOC 0x50 = Opus SILK wideband, 16 kHz, mono, 40 ms.
 *  - End of recording: `02 00 CC DD | packets u32 LE`.
 */
export function parseChannelB(b: Uint8Array): GlassesEvent {
  if (b.length === 9 && b[0] === 0x01) return { kind: 'busy', on: b[8] === 1, raw: hex(b), confidence: 'likely' };
  if (b.length >= 8 && b[0] === 0x02 && b[1] === 0x00 && b[2] === 0xcc && b[3] === 0xdd) return { kind: 'voiceEnd', packets: u32(b, 4), confidence: 'verified' };
  if (b.length >= 9 && b[0] === 0x02 && b[1] === 0x00 && b[2] === 0x00 && b[3] === 0x00) {
    const len = u16(b, 6), body = b.subarray(8);
    if (len === body.length) {
      const n = body[0], frames: Uint8Array[] = [];
      let i = 1;
      for (let k = 0; k < n && i < body.length; k++) { const L = body[i]; frames.push(body.slice(i + 1, i + 1 + L)); i += 1 + L; }
      if (i === body.length) return { kind: 'voiceAudio', seq: u16(b, 4), frames, confidence: 'verified' };
    }
  }
  return { kind: 'raw', channel: 'B', hex: hex(b), confidence: 'unknown' };
}

/** Manufacturer data from the advert: [company LE][MAC 6][3 x u16]. */
export function parseAdvert(mfg: Uint8Array): { company: number; mac?: string; fields?: number[] } {
  const company = u16(mfg, 0);
  if (mfg.length >= 14) return { company, mac: mac(mfg, 2), fields: [u16(mfg, 8), u16(mfg, 10), u16(mfg, 12)] };
  return { company };
}

/** Glasses SSID is derived from the last 2 bytes of the BT address (verified: C4:01:03:00:4E:31 -> G2-4E31). */
export const ssidFromMac = (m: string) => 'G2-' + m.replace(/:/g, '').slice(-4).toUpperCase();
