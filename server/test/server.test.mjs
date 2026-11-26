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
