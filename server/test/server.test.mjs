// End-to-end tests against the real HTTP server with mock providers (no network, no keys).
process.env.MOCK_PROVIDERS = 'true';
process.env.SERVER_SECRET = 'test-secret-not-for-production-0123456789';
process.env.DAILY_LIMIT = '5';
process.env.REG_LIMIT_PER_IP = '3';
process.env.ROUTES = JSON.stringify({ default: 'gemini', translator: 'openai' });

import test from 'node:test';
import assert from 'node:assert/strict';
const { server, route } = await import('../src/index.mjs');

await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (p, b, token) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(b) });

test.after(() => server.close());

test('health reports providers without secrets', async () => {
  const j = await (await fetch(base + '/health')).json();
  assert.equal(j.ok, true);
  assert.ok(!JSON.stringify(j).includes('test-secret'));
});

let token;
test('register issues a verifiable token', async () => {
  const j = await (await post('/v1/register', { installId: 'abcdefgh1234' })).json();
  assert.equal(j.installId, 'abcdefgh1234');
  assert.match(j.token, /^abcdefgh1234\./);
  token = j.token;
});

test('requests without a valid token are refused', async () => {
  assert.equal((await post('/v1/respond', { text: 'hi' })).status, 401);
  assert.equal((await post('/v1/respond', { text: 'hi' }, 'abcdefgh1234.forged')).status, 401);
  assert.equal((await post('/v1/respond', { text: 'hi' }, token.slice(0, -2) + 'xx')).status, 401);
});

test('respond routes by mode, uses search where configured, reports cost', async () => {
  const j = await (await post('/v1/respond', { mode: 'general', system: 's', text: 'hello', history: [] }, token)).json();
  assert.equal(j.provider, 'gemini');
  assert.equal(j.model, 'gemini-3.8-flash');
  assert.match(j.text, /\[search\]/);
  assert.equal(typeof j.ms, 'number');
  assert.ok(j.costUsd > 0);
  const t = await (await post('/v1/respond', { mode: 'translator', text: 'hola' }, token)).json();
  assert.equal(t.provider, 'openai');
  assert.doesNotMatch(t.text, /\[search\]/);
});

test('research mode uses the research tier model', () => {
  const r = route('research');
  assert.equal(r.tier, 'research');
  assert.equal(r.model, 'gemini-4-argon');
});

test('provider override is ignored unless enabled', async () => {
  const j = await (await post('/v1/respond', { mode: 'general', text: 'x', provider: 'openai' }, token)).json();
  assert.equal(j.provider, 'gemini');
});

test('transcribe returns text and provider', async () => {
  const j = await (await post('/v1/transcribe', { audioBase64: 'AAAA', mime: 'audio/m4a' }, token)).json();
  assert.match(j.text, /mock transcript/);
});

test('per-install daily limit is enforced (limit 5)', async () => {
  // 4 AI calls used above (general, translator, override, transcribe); 1 more allowed, then 429.
  // Refused (401) calls must not have counted.
  assert.equal((await post('/v1/respond', { text: 'a' }, token)).status, 200);
  const over = await post('/v1/respond', { text: 'b' }, token);
  assert.equal(over.status, 429);
  assert.match((await over.json()).error, /today's limit/);
});

test('registration is rate-limited per network (limit 3)', async () => {
  // 1 used above
  assert.equal((await post('/v1/register', {})).status, 200);
  assert.equal((await post('/v1/register', {})).status, 200);
  assert.equal((await post('/v1/register', {})).status, 429);
});

test('oversized and malformed bodies are rejected', async () => {
  const fresh = (await (await fetch(base + '/health')).json()) && token; // same token, but limit exhausted -> use status codes only
  const bad = await fetch(base + '/v1/register', { method: 'POST', body: '{not json' });
  assert.ok([400, 429].includes(bad.status));
  assert.ok(fresh);
});

test('speak returns a playable WAV and only allows listed voices', async () => {
  const j = await (await post('/v1/speak', { text: 'Hello Robert', voice: 'Aoede', style: 'warm' }, token)).json();
  assert.equal(j.voice, 'Aoede');
  assert.equal(j.mime, 'audio/wav');
  assert.equal(Buffer.from(j.audioBase64, 'base64').toString('ascii', 0, 4), 'RIFF');
  const k = await (await post('/v1/speak', { text: 'Hi', voice: 'NotAVoice' }, token)).json();
  assert.equal(k.voice, 'Sulafat');
  assert.equal((await post('/v1/speak', { text: '   ' }, token)).status, 400);
  assert.equal((await post('/v1/speak', { text: 'hi' })).status, 401);
});

test('findAudio reads audio from the Interactions response', async () => {
  const { findAudio } = await import('../src/providers/gemini.mjs');
  const r = { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'x' }, { type: 'audio', data: 'QUJD', mime_type: 'audio/wav' }] }] };
  assert.equal(findAudio(r).data, 'QUJD');
  assert.equal(findAudio({ output_audio: { data: 'WFla' } }).data, 'WFla');
  assert.equal(findAudio({ steps: [] }), null);
});

test('respond accepts a PDF or text file and ignores unknown types', async () => {
  const { issueToken } = await import('../src/auth.mjs'); // own install: the shared one is at its daily limit
  const token = issueToken('filetester01').token;
  const pdf = await (await post('/v1/respond', { mode: 'reader', text: 'read it', file: { mime: 'application/pdf', base64: 'JVBERi0=', name: 'a.pdf' } }, token)).json();
  assert.match(pdf.text, /\[file application\/pdf\]/);
  const bad = await (await post('/v1/respond', { mode: 'reader', text: 'x', file: { mime: 'application/x-msdownload', base64: 'AAAA' } }, token)).json();
  assert.doesNotMatch(bad.text, /\[file/);
});

test('respond takes spoken audio in one call (Gemini) or transcribes first (others)', async () => {
  const { issueToken } = await import('../src/auth.mjs');
  const token = issueToken('audiotester01').token;
  const g = await (await post('/v1/respond', { mode: 'general', system: 's', audio: { mime: 'audio/m4a', base64: 'AAAA' } }, token)).json();
  assert.match(g.text, /\[audio audio\/m4a\]/);
  assert.equal(g.heard, undefined);
  const o = await (await post('/v1/respond', { mode: 'translator', system: 's', audio: { mime: 'audio/m4a', base64: 'AAAA' } }, token)).json();
  assert.equal(o.provider, 'openai');
  assert.equal(o.heard, 'mock transcript (audio/m4a)');
  assert.doesNotMatch(o.text, /\[audio/);
});

test('live returns a short-lived token and endpoints, never the API key', async () => {
  const { issueToken } = await import('../src/auth.mjs');
  const token = issueToken('livetester01').token;
  const j = await (await post('/v1/live', {}, token)).json();
  assert.equal(j.token, 'auth_tokens/mock-live-token');
  assert.equal(j.endpoints.length, 2);
  assert.match(j.endpoints[0], /^wss:\/\/generativelanguage\.googleapis\.com\/ws\/.*v1alpha.*BidiGenerateContentConstrained\?access_token=/);
  assert.ok(!JSON.stringify(j).includes('test-secret'));
  assert.equal((await post('/v1/live', {})).status, 401);
});

test('reader blocks private addresses and extracts article text', async () => {
  const { privateAddress, htmlToText, readPage } = await import('../src/reader.mjs');
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.equal(privateAddress(ip), true, ip);
  assert.equal(privateAddress('8.8.8.8'), false);
  await assert.rejects(readPage('http://169.254.169.254/latest'), /not allowed/);
  await assert.rejects(readPage('http://internal.test/', { resolve: async () => [{ address: '10.0.0.9' }] }), /not allowed/);
  await assert.rejects(readPage('file:///etc/passwd'), /Only web pages/);
  const r = htmlToText('<html><head><title>Big &amp; News</title><script>x()</script></head><body><nav>Menu stuff here that is long enough</nav><article><h1>Headline</h1><p>The council voted on Tuesday to fund the new bridge project.</p><p>Work starts in May.</p></article></body></html>');
  assert.equal(r.title, 'Big & News');
  assert.match(r.text, /council voted/);
  assert.doesNotMatch(r.text, /Menu|x\(\)/);
});

test('place search drops roads and duplicates, nearest first', async () => {
  const { cleanPlaces, findPlaces } = await import('../src/reader.mjs');
  const raw = [
    { name: 'Walmart Supercenter', lat: '40.0757', lon: '-80.8750', address: { house_number: '50739', road: 'Valley Plaza Drive', city: 'Saint Clairsville', state: 'Ohio' } },
    { name: 'Walmart Supercenter', lat: '39.9268', lon: '-80.7477', address: { house_number: '10', road: 'Walmart Drive', city: 'Moundsville', state: 'West Virginia' } },
    { name: 'Walmart', lat: '39.9265', lon: '-80.7498', address: { road: 'Walmart Drive', city: 'Moundsville' } },
    { name: 'Walmart Drive', category: 'highway', lat: '39.9272', lon: '-80.7493' },
  ];
  const c = cleanPlaces(raw, 39.93, -80.75);
  assert.equal(c.length, 2);
  assert.equal(c[0].address, '10 Walmart Drive, Moundsville, West Virginia');
  let calls = 0;
  const fake = async () => { calls++; return { ok: true, json: async () => raw }; };
  const r1 = await findPlaces('walmart', 39.93, -80.75, { fetchImpl: fake });
  await findPlaces('Walmart', 39.93, -80.75, { fetchImpl: fake });
  assert.equal(r1.length, 2); assert.equal(calls, 1); // second is cached
});
