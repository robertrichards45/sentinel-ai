// Alice AI gateway. Plain Node (no dependencies).
//   GET  /health
//   POST /v1/register     {installId?}                          -> {installId, token}
//   POST /v1/transcribe   {audioBase64, mime}                   -> {text, provider, model, ms}
//   POST /v1/respond      {mode, system, history, text, imageBase64?, provider?}
//                         -> {text, provider, model, ms, usage, costUsd, sources}
//   GET  /v1/status       (token) -> today's usage + routing (no secrets)
import { createServer } from 'node:http';
import { config, costUsd } from './config.mjs';
import { issueToken, verifyToken, take, usageSnapshot } from './auth.mjs';
import * as gemini from './providers/gemini.mjs';
import * as openai from './providers/openai.mjs';
import * as mock from './providers/mock.mjs';

const PROVIDERS = { gemini, openai };
const providerFor = (name) => (config.mock ? mock : PROVIDERS[name]);
const hasKey = (name) => config.mock || !!config.keys[name];

export function route(mode, override) {
  let name = config.allowProviderOverride && override && PROVIDERS[override] ? override : (config.routes[mode] ?? config.routes.default ?? 'gemini');
  if (!hasKey(name)) name = Object.keys(PROVIDERS).find(hasKey) ?? name; // fall back to any provider with a key
  const tier = config.researchModes.includes(mode) ? 'research' : 'fast';
  return { name, model: config.models[name][tier], search: config.searchModes.includes(mode), tier };
}

const send = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};

async function body(req) {
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > config.limits.maxBodyBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

const clean = (s, max) => (typeof s === 'string' ? s.slice(0, max) : '');

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, providers: Object.keys(PROVIDERS).filter(hasKey), mock: config.mock });

    if (req.method === 'POST' && url.pathname === '/v1/register') {
      if (!config.secret) return send(res, 503, { error: 'Server is not configured (SERVER_SECRET missing).' });
      if (!take('reg:' + ip, config.limits.registrationsPerIpPerDay)) return send(res, 429, { error: 'Too many new installs from this network today.' });
      const b = await body(req);
      return send(res, 200, issueToken(clean(b.installId, 64)));
    }

    // Everything below needs a valid install token.
    const installId = verifyToken(req.headers.authorization);
    if (!installId) return send(res, 401, { error: 'Not signed in. Reopen the app.' });

    if (req.method === 'GET' && url.pathname === '/v1/status') {
      return send(res, 200, { usage: usageSnapshot(), routes: config.routes, models: config.models, search: config.searchModes, providers: Object.keys(PROVIDERS).filter(hasKey) });
    }

    const isAI = req.method === 'POST' && (url.pathname === '/v1/respond' || url.pathname === '/v1/transcribe');
    if (!isAI) return send(res, 404, { error: 'Not found' });
    if (!take('global', config.limits.globalPerDay)) return send(res, 429, { error: 'Alice is at today\'s capacity. Try again tomorrow.' });
    if (!take('i:' + installId, config.limits.perInstallPerDay)) return send(res, 429, { error: 'You\'ve reached today\'s limit. It resets at midnight UTC.' });

    const b = await body(req);
    const t0 = Date.now();

    if (url.pathname === '/v1/transcribe') {
      const mime = ['audio/wav', 'audio/m4a', 'audio/aac', 'audio/mp3'].includes(b.mime) ? b.mime : 'audio/m4a';
      if (!b.audioBase64) return send(res, 400, { error: 'No audio' });
      let name = config.transcribeProvider;
      if (!hasKey(name)) name = Object.keys(PROVIDERS).find(hasKey) ?? name;
      const r = await providerFor(name).transcribe({ audioBase64: b.audioBase64, mime });
      return send(res, 200, { text: r.text, provider: name, model: r.model, ms: Date.now() - t0 });
    }

    const mode = clean(b.mode, 32) || 'general';
    const rt = route(mode, b.provider);
    const history = Array.isArray(b.history) ? b.history.slice(-24).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', text: clean(h.text, 4000) })) : [];
    const r = await providerFor(rt.name).respond({
      model: rt.model, system: clean(b.system, 20000), history, text: clean(b.text, 8000),
      imageBase64: typeof b.imageBase64 === 'string' ? b.imageBase64 : undefined, search: rt.search,
    });
    return send(res, 200, { text: r.text, provider: rt.name, model: rt.model, tier: rt.tier, ms: Date.now() - t0, usage: r.usage, costUsd: costUsd(rt.model, r.usage), sources: r.sources });
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? (e.status === 401 || e.status === 403 ? 502 : e.status) : 500;
    console.error(new Date().toISOString(), req.method, url.pathname, status, String(e.message).slice(0, 200)); // never logs bodies or keys
    return send(res, status, { error: String(e.message ?? 'Server error').slice(0, 300) });
  }
});

export function start() {
  server.listen(config.port, () => console.log(`Alice server on :${config.port} providers=${Object.keys(PROVIDERS).filter(hasKey).join(',') || 'none'} mock=${config.mock}`));
}
