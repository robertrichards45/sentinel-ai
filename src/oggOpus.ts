/**
 * Wraps raw Opus frames from the glasses (16 kHz mono, 40 ms each) into an Ogg Opus file that
 * Gemini accepts as audio/ogg. Pure TS (unit-tested); byte-identical to pc-tools' ogg_opus.py.
 */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i << 24; for (let k = 0; k < 8; k++) c = c & 0x80000000 ? ((c << 1) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0; t[i] = c >>> 0; }
  return t;
})();
function crc32(d: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < d.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ d[i]) & 0xff]) >>> 0;
  return c >>> 0;
}
const SERIAL = 0x414c4943; // "ALIC"

function page(packets: Uint8Array[], granule: number, seq: number, flags: number): Uint8Array {
  const segs: number[] = [];
  for (const p of packets) { let n = p.length; while (n >= 255) { segs.push(255); n -= 255; } segs.push(n); }
  const body = packets.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(27 + segs.length + body);
  const v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53, 0, flags]); // "OggS", version 0, header type
  v.setUint32(6, granule >>> 0, true); v.setUint32(10, Math.floor(granule / 2 ** 32), true);
  v.setUint32(14, SERIAL, true); v.setUint32(18, seq, true); v.setUint32(22, 0, true);
  out[26] = segs.length; out.set(segs, 27);
  let o = 27 + segs.length; for (const p of packets) { out.set(p, o); o += p.length; }
  v.setUint32(22, crc32(out), true);
  return out;
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

export function opusToOgg(frames: Uint8Array[], frameMs = 40): Uint8Array {
  const head = new Uint8Array(19); head.set(ascii('OpusHead')); head[8] = 1; head[9] = 1;
  new DataView(head.buffer).setUint16(10, 312, true); new DataView(head.buffer).setUint32(12, 16000, true);
  const tags = new Uint8Array(8 + 4 + 5 + 4); tags.set(ascii('OpusTags')); new DataView(tags.buffer).setUint32(8, 5, true); tags.set(ascii('Alice'), 12);
  const pages = [page([head], 0, 0, 2), page([tags], 0, 1, 0)];
  let gran = 312, seq = 2;
  const per = 48 * frameMs; // granule = 48 kHz samples
  for (let i = 0; i < frames.length; i += 50) {
    const chunk = frames.slice(i, i + 50); gran += per * chunk.length;
    pages.push(page(chunk, gran, seq++, i + 50 >= frames.length ? 4 : 0));
  }
  const total = pages.reduce((a, p) => a + p.length, 0), out = new Uint8Array(total);
  let o = 0; for (const p of pages) { out.set(p, o); o += p.length; }
  return out;
}
