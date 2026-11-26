import { Buffer } from 'buffer';
/** Pure audio helpers for the live conversation (unit-tested on the PC). */

/** Float samples (-1..1) to 16-bit little-endian PCM, clipped. */
export function floatToPcm16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const v = Math.max(-1, Math.min(1, f[i]));
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return out;
}

/** Linear resampling, enough for speech going to a recogniser. */
export function resampleLinear(f: Float32Array, from: number, to: number): Float32Array {
  if (from === to || !f.length) return f;
  const n = Math.max(1, Math.round(f.length * to / from));
  const out = new Float32Array(n);
  const step = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * step, k = Math.floor(x), w = x - k;
    const a = f[Math.min(k, f.length - 1)], b = f[Math.min(k + 1, f.length - 1)];
    out[i] = a + (b - a) * w;
  }
  return out;
}

/** WebSocket frames arrive as text or binary (ArrayBuffer / typed array) depending on the platform. */
export function frameText(d: unknown): string {
  if (typeof d === 'string') return d;
  if (d instanceof ArrayBuffer) return Buffer.from(new Uint8Array(d)).toString('utf8');
  if (ArrayBuffer.isView(d)) return Buffer.from(new Uint8Array(d.buffer as ArrayBuffer, d.byteOffset, d.byteLength)).toString('utf8');
  return '';
}
