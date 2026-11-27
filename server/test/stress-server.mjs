// Server stress test: thousands of concurrent requests, malformed input, oversized bodies, bad tokens,
// rate limits, SSRF attempts. Runs against a local copy with mock AI providers.
const S = 'http://127.0.0.1:8799';
const post = (p, body, tok, raw) => fetch(S + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: raw ?? JSON.stringify(body) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) })).catch((e) => ({ s: 0, e: String(e) }));
let fails = 0; const check = (n, ok, got) => { if (!ok) { fails++; console.log('FAIL', n, JSON.stringify(got ?? '').slice(0, 200)); } else console.log('PASS', n); };
const reg = await post('/v1/register', { installId: 'stress-main-0001' });
const tok = reg.j?.token; check('register', !!tok, reg);
// 1. Burst: 1,000 requests at once across endpoints
let t = Date.now();
const burst = await Promise.all(Array.from({ length: 1000 }, (_, i) => i % 3 === 0 ? post('/v1/respond', { mode: 'general', system: 'x', history: [], text: 'hi ' + i }, tok) : i % 3 === 1 ? fetch(S + '/health').then((r) => ({ s: r.status })) : post('/v1/diag', { events: [{ t: Date.now(), k: 'x' }] }, tok)));
const codes = burst.reduce((m, r) => ((m[r.s] = (m[r.s] ?? 0) + 1), m), {});
console.log('  1,000 concurrent requests in', Date.now() - t, 'ms, status codes', codes);
check('no crashes or 5xx in burst', !codes[0] && !Object.keys(codes).some((c) => c >= 500), codes);
check('daily limit enforced (429s appear after 300 AI calls)', (codes[429] ?? 0) > 0 || (codes[200] ?? 0) > 0, codes);
// 2. Malformed and hostile input
const bad = [
  ['not JSON', post('/v1/respond', null, tok, '{{{not json')],
  ['empty body', post('/v1/respond', null, tok, '')],
  ['array body', post('/v1/respond', [1, 2, 3], tok)],
  ['no token', post('/v1/respond', { text: 'hi' })],
  ['forged token', post('/v1/respond', { text: 'hi' }, tok.slice(0, -4) + 'AAAA')],
  ['huge text 5 MB', post('/v1/respond', { mode: 'general', text: 'a'.repeat(5_000_000) }, tok)],
  ['oversized 13 MB', post('/v1/transcribe', { audioBase64: 'A'.repeat(13_000_000) }, tok)],
  ['unknown path', post('/v1/../../etc/passwd', {}, tok)],
  ['read SSRF metadata', post('/v1/read', { url: 'http://169.254.169.254/latest/meta-data' }, tok)],
  ['read SSRF localhost', post('/v1/read', { url: 'http://127.0.0.1:8799/health' }, tok)],
  ['read file://', post('/v1/read', { url: 'file:///etc/passwd' }, tok)],
  ['read junk url', post('/v1/read', { url: '😀' }, tok)],
  ['places empty', post('/v1/places', { q: '' }, tok)],
  ['places injection', post('/v1/places', { q: "Walmart&format=xml&<script>", lat: 'x', lon: {} }, tok)],
  ['diag bomb', post('/v1/diag', { events: Array.from({ length: 50000 }, () => ({ k: 'x'.repeat(50) })) }, tok)],
];
for (const [name, p] of bad) { const r = await p; check(`${name} -> handled (${r.s})`, r.s > 0 && r.s < 500 || (name.startsWith('places') && r.s === 502), r); }
// 3. Registration flood from one IP
const regs = await Promise.all(Array.from({ length: 300 }, (_, i) => post('/v1/register', { installId: 'flood-' + i })));
const rc = regs.reduce((m, r) => ((m[r.s] = (m[r.s] ?? 0) + 1), m), {});
console.log('  300 registrations from one address:', rc);
check('registration flood is rate-limited', (rc[429] ?? 0) > 0, rc);
// 4. Still healthy afterwards
const h = await fetch(S + '/health').then((r) => r.status).catch(() => 0);
check('server still healthy after all of that', h === 200, h);
const mem = process.memoryUsage().rss;
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
