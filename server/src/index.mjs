// Alice AI gateway. Plain Node (no dependencies).
//   GET  /health
//   POST /v1/register     {installId?}                          -> {installId, token}
//   POST /v1/transcribe   {audioBase64, mime}                   -> {text, provider, model, ms}
//   POST /v1/respond      {mode, system, history, text, imageBase64?, file?: {mime, base64, name}, audio?: {mime, base64}, provider?}
//                         audio = the user's spoken question (one round trip instead of transcribe + respond)
//                         -> {text, provider, model, ms, usage, costUsd, sources}
//   POST /v1/speak        {text, voice?, style?}                -> {audioBase64, mime, voice, model, ms}
//   POST /v1/live         -> {token, model, expiresAt, endpoints[]}  short-lived token for real-time voice
//   POST /v1/places       {q, lat, lon}                         -> {places: [{name, address, lat, lon}]}  nearest first
//   POST /v1/read         {url}                                 -> {title, text}  readable text of a public web page
//   GET  /v1/status       (token) -> today's usage + routing (no secrets)
import { createServer } from 'node:http';
import { config, costUsd } from './config.mjs';
import { issueToken, verifyToken, take, usageSnapshot } from './auth.mjs';
import * as gemini from './providers/gemini.mjs';
import * as openai from './providers/openai.mjs';
import * as mock from './providers/mock.mjs';
import { readPage, findPlaces } from './reader.mjs';

const PROVIDERS = { gemini, openai };
const providerFor = (name) => (config.mock ? mock : PROVIDERS[name]);
const hasKey = (name) => config.mock || !!config.keys[name];

/**
 * An out-of-credit or over-quota provider shouldn't silence Alice: if the other provider has a key, the same
 * request is retried there. Only account problems switch providers; a bad request still fails normally.
 */
export const isAccountProblem = (e) => [402, 429].includes(e?.status) || /credit|quota|billing|RESOURCE_EXHAUSTED|insufficient/i.test(String(e?.message ?? ''));
const other = (name) => Object.keys(PROVIDERS).find((n) => n !== name && hasKey(n));
async function withFailover(name, fn) {
  try { return { r: await fn(providerFor(name), name), name }; }
  catch (e) {
    const alt = other(name);
    if (!alt || !isAccountProblem(e)) throw e;
    console.error(new Date().toISOString(), 'failover', name, '->', alt, String(e.message).slice(0, 120));
    return { r: await fn(providerFor(alt), alt), name: alt };
  }
}

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

// Documents Alice can read (sent inline to the model).
/** Today's date + a firm instruction to search for anything recent (models otherwise answer from old training data). */
function withToday(system, search, tz) {
  let today;
  try { today = new Date().toLocaleString('en-US', { timeZone: tz || 'America/New_York', dateStyle: 'full', timeStyle: 'short' }); } catch { today = new Date().toUTCString(); }
  const lines = [`Today is ${today}.`];
  if (search) lines.push('For news, sports, scores, prices, weather, people in the news, releases or anything that may have happened or changed recently, ALWAYS use Google Search before answering, and answer from what you find. Never say you cannot access current information or the internet.');
  return lines.join(' ') + '\n\n' + (system || '');
}

const AUDIO_TYPES = ['audio/wav', 'audio/m4a', 'audio/aac', 'audio/mp3', 'audio/mpeg', 'audio/ogg'];
const FILE_TYPES = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'text/html', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];
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
      return send(res, 200, { usage: usageSnapshot(), routes: config.routes, models: config.models, search: config.searchModes, voices: config.voices, defaultVoice: config.defaultVoice, providers: Object.keys(PROVIDERS).filter(hasKey) });
    }

    // Diagnostic diary from the app: events only (no conversation text), printed to the server log.
    if (req.method === 'POST' && url.pathname === '/v1/diag') {
      if (!take('d:' + installId, 400)) return send(res, 429, { error: 'Diagnostics limit reached for today.' });
      const b = await body(req);
      const events = Array.isArray(b.events) ? b.events.slice(0, 200) : [];
      const who = String(installId).slice(0, 8);
      for (const e of events) {
        const line = JSON.stringify({ t: Number(e?.t) || 0, k: clean(String(e?.k ?? ''), 40), d: e?.d ?? undefined }).slice(0, 1200);
        console.log(`DIAG ${who} ${line}`);
      }
      return send(res, 200, { ok: true, n: events.length });
    }

    if (req.method === 'POST' && url.pathname === '/v1/read') {
      if (!take('r:' + installId, 100)) return send(res, 429, { error: 'Reading limit reached for today.' });
      const b = await body(req);
      try { return send(res, 200, await readPage(clean(b.url, 2000))); }
      catch (e) { return send(res, e.status ?? 502, { error: e.message }); }
    }

    if (req.method === 'POST' && url.pathname === '/v1/places') {
      if (!take('p:' + installId, 200)) return send(res, 429, { error: 'Place search limit reached for today.' });
      const b = await body(req);
      const q = clean(b.q, 120).trim();
      if (!q) return send(res, 400, { error: 'No place' });
      try { return send(res, 200, { places: await findPlaces(q, Number(b.lat), Number(b.lon)) }); }
      catch (e) { return send(res, e.status ?? 502, { error: e.message }); }
    }

    if (req.method === 'POST' && url.pathname === '/v1/live') {
      if (!config.mock && !config.keys.gemini) return send(res, 503, { error: 'Real-time voice needs a Gemini key on the server.' });
      if (!take('global-live', config.limits.globalPerDay)) return send(res, 429, { error: 'Alice is at today\'s capacity. Try again tomorrow.' });
      if (!take('l:' + installId, config.live.perInstallPerDay)) return send(res, 429, { error: 'Conversation limit reached for today.' });
      const lb = await body(req).catch(() => ({}));
      const t = await (config.mock ? mock : gemini).liveToken({ unlocked: lb?.locked !== true });
      const base = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage';
      const endpoints = [t.version, t.version === 'v1beta' ? 'v1alpha' : 'v1beta'].map((v) => `${base}.${v}.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(t.token)}`);
      return send(res, 200, { ...t, endpoints });
    }

    if (req.method === 'POST' && url.pathname === '/v1/speak') {
      if (!config.mock && !config.keys.gemini && !config.keys.openai) return send(res, 503, { error: 'Natural voice needs a Gemini or OpenAI key on the server.' });
      if (!take('global-speech', config.limits.globalPerDay * 2)) return send(res, 429, { error: 'Alice\'s voice is at today\'s capacity.' });
      if (!take('s:' + installId, config.limits.speechPerInstallPerDay)) return send(res, 429, { error: 'Voice limit reached for today.' });
      const b = await body(req);
      const text = clean(b.text, 3000).trim();
      if (!text) return send(res, 400, { error: 'No text' });
      const voice = config.voices.includes(b.voice) ? b.voice : config.defaultVoice;
      const t0 = Date.now();
      const { r, name } = await withFailover(config.keys.gemini || config.mock ? 'gemini' : 'openai', (p) => p.speak({ text, voice, style: clean(b.style, 200) || undefined }));
      return send(res, 200, { audioBase64: r.audioBase64, mime: r.mime, voice, model: r.model, provider: name, ms: Date.now() - t0 });
    }

    const isAI = req.method === 'POST' && (url.pathname === '/v1/respond' || url.pathname === '/v1/transcribe');
    if (!isAI) return send(res, 404, { error: 'Not found' });
    if (!take('global', config.limits.globalPerDay)) return send(res, 429, { error: 'Alice is at today\'s capacity. Try again tomorrow.' });
    if (!take('i:' + installId, config.limits.perInstallPerDay)) return send(res, 429, { error: 'You\'ve reached today\'s limit. It resets at midnight UTC.' });

    const b = await body(req);
    const t0 = Date.now();

    if (url.pathname === '/v1/transcribe') {
      const mime = AUDIO_TYPES.includes(b.mime) ? b.mime : 'audio/m4a';
      if (!b.audioBase64) return send(res, 400, { error: 'No audio' });
      let name = config.transcribeProvider;
      if (!hasKey(name)) name = Object.keys(PROVIDERS).find(hasKey) ?? name;
      const { r, name: used } = await withFailover(name, (p) => p.transcribe({ audioBase64: b.audioBase64, mime, hint: clean(b.hint, 1500) || undefined }));
      return send(res, 200, { text: r.text, provider: used, model: r.model, ms: Date.now() - t0 });
    }

    const mode = clean(b.mode, 32) || 'general';
    const rt = route(mode, b.provider);
    let audio = b.audio && typeof b.audio.base64 === 'string' && AUDIO_TYPES.includes(b.audio.mime) ? { mime: b.audio.mime, base64: b.audio.base64 } : undefined;
    let heard;
    if (audio && rt.name !== 'gemini') { // only Gemini takes audio directly; others transcribe first
      let tname = config.transcribeProvider; if (!hasKey(tname)) tname = rt.name;
      heard = (await providerFor(tname).transcribe({ audioBase64: audio.base64, mime: audio.mime })).text;
      b.text = heard; audio = undefined;
    }
    const history = Array.isArray(b.history) ? b.history.slice(-24).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', text: clean(h.text, 4000) })) : [];
    const args = {
      system: withToday(clean(b.system, 20000), rt.search, clean(b.tz, 60)), history, text: clean(b.text, 8000),
      imageBase64: typeof b.imageBase64 === 'string' ? b.imageBase64 : undefined, search: rt.search,
      audio,
      file: b.file && typeof b.file.base64 === 'string' && FILE_TYPES.includes(b.file.mime) ? { mime: b.file.mime, base64: b.file.base64, name: clean(b.file.name, 120) || 'document' } : undefined,
    };
    const { r, name: used } = await withFailover(rt.name, async (p, n) => {
      if (n !== rt.name && args.audio) { // the backup can't take audio directly: transcribe it first
        heard = (await p.transcribe({ audioBase64: args.audio.base64, mime: args.audio.mime })).text;
        return p.respond({ ...args, model: config.models[n][rt.tier], text: heard, audio: undefined });
      }
      return p.respond({ ...args, model: config.models[n][rt.tier] });
    });
    const model = config.models[used][rt.tier];
    return send(res, 200, { text: r.text, heard, provider: used, model, tier: rt.tier, ms: Date.now() - t0, usage: r.usage, costUsd: costUsd(model, r.usage), sources: r.sources });
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? (e.status === 401 || e.status === 403 ? 502 : e.status) : 500;
    console.error(new Date().toISOString(), req.method, url.pathname, status, String(e.message).slice(0, 200)); // never logs bodies or keys
    if (status === 413) res.setHeader('Connection', 'close'); // the rest of the oversized body is still on the socket: don't reuse it
    return send(res, status, { error: String(e.message ?? 'Server error').slice(0, 300) });
  }
});

export function start() {
  server.listen(config.port, () => console.log(`Alice server on :${config.port} providers=${Object.keys(PROVIDERS).filter(hasKey).join(',') || 'none'} mock=${config.mock}`));
}
