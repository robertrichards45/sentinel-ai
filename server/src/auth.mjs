import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { config } from './config.mjs';

// Install tokens: "<installId>.<hmac>". No database needed; the server secret makes them unforgeable.
const sign = (id) => createHmac('sha256', config.secret).update('alice-install:' + id).digest('base64url');

export function issueToken(installId) {
  const id = /^[A-Za-z0-9_-]{8,64}$/.test(installId ?? '') ? installId : randomUUID().replace(/-/g, '');
  return { installId: id, token: `${id}.${sign(id)}` };
}

export function verifyToken(header) {
  const t = (header ?? '').replace(/^Bearer\s+/i, '');
  const dot = t.lastIndexOf('.');
  if (dot < 8) return null;
  const id = t.slice(0, dot), mac = Buffer.from(t.slice(dot + 1));
  const want = Buffer.from(sign(id));
  return mac.length === want.length && timingSafeEqual(mac, want) ? id : null;
}

// In-memory daily counters (reset at UTC midnight and on redeploy). Good enough to cap spend;
// swap for Redis/Postgres before large-scale launch.
let day = '';
const counts = new Map();
const today = () => new Date().toISOString().slice(0, 10);
function roll() { const d = today(); if (d !== day) { day = d; counts.clear(); } }

export function take(bucket, limit) {
  roll();
  const n = (counts.get(bucket) ?? 0) + 1;
  if (n > limit) return false;
  counts.set(bucket, n);
  return true;
}
export function usageSnapshot() { roll(); return { day, global: counts.get('global') ?? 0, installs: [...counts.keys()].filter((k) => k.startsWith('i:')).length }; }
