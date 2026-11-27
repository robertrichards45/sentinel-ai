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

/**
 * Background-noise gate for the phone mic: learns the room's steady noise level (TV, fan, traffic) and only
 * lets sound through that is clearly louder than it — a voice close to the phone. While closed, the AI gets
 * silence, so it doesn't react to the TV or people nearby. The last ~300 ms before opening are let through
 * too, so the start of your first word isn't cut.
 */
export class NoiseGate {
  floor = 0.008;
  private openUntil = 0;
  private ring: Float32Array[] = [];
  constructor(private minOpen = 0.018, private ratio = 3, private holdMs = 900, private prefix = 3) {}
  /** Returns the frames to send (empty while closed). */
  process(f: Float32Array, now = Date.now()): Float32Array[] {
    let e = 0; for (let i = 0; i < f.length; i++) e += f[i] * f[i];
    const rms = Math.sqrt(e / Math.max(1, f.length));
    const threshold = Math.max(this.minOpen, this.floor * this.ratio);
    const wasOpen = now < this.openUntil;
    if (rms > threshold) this.openUntil = now + this.holdMs;
    else if (!wasOpen) this.floor = Math.min(0.2, rms < this.floor ? this.floor * 0.9 + rms * 0.1 : this.floor * 0.995 + rms * 0.005); // learn the room
    const open = now < this.openUntil;
    if (!open) { this.ring.push(f); if (this.ring.length > this.prefix) this.ring.shift(); return []; }
    const out = wasOpen ? [f] : [...this.ring, f];
    this.ring = [];
    return out;
  }
}
