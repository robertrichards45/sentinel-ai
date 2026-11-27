import { checkNet } from './netState';
import { note, setDiarySender } from './diary';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { secret } from './storage';
import { getSettings } from './settings';

/**
 * Alice talks to AI through Alice's own server (server/ in this repo, hosted on Railway).
 * The server holds the Gemini/OpenAI keys; the phone only holds a per-install token
 * in the iOS Keychain. All traffic is HTTPS.
 */
export const DEFAULT_SERVER = 'https://alice-server-production-4be3ccd5.up.railway.app';
const TOKEN = 'alice_install_token';
const INSTALL = 'alice_install_id';

export class AIError extends Error {}
export type Source = { title: string; url: string };
export type AIAnswer = { heard?: string; text: string; provider: string; model: string; ms: number; sources: Source[]; costUsd: number | null };

const server = () => (getSettings().serverUrl || DEFAULT_SERVER).replace(/\/+$/, '');
export const healthUrl = () => server() + '/health';

async function register(): Promise<string> {
  let id = await secret.get(INSTALL);
  if (!id) { id = Crypto.randomUUID().replace(/-/g, ''); await secret.set(INSTALL, id); }
  const r = await fetch(server() + '/v1/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installId: id }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new AIError(j.error ?? `Couldn't reach Alice's server (${r.status}).`);
  await secret.set(TOKEN, j.token);
  return j.token;
}

async function call(path: string, body: unknown, timeoutMs = 60000, retried = false): Promise<any> {
  if (getSettings().privacyMode) throw new AIError('Privacy mode is on. Alice is offline and nothing leaves this iPhone.');
  const token = (await secret.get(TOKEN)) ?? (await register());
  const ctl = new AbortController();
  const t0 = Date.now();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(server() + path, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !retried) { await secret.del(TOKEN); return call(path, body, timeoutMs, true); }
    if (!r.ok) throw new AIError(j.error ?? `Alice's server returned ${r.status}.`);
    return j;
  } catch (e: any) {
    if (path !== '/v1/diag') note('ai-error', { path, msg: String(e?.message ?? e), ms: Date.now() - t0 });
    if (!(e instanceof AIError)) checkNet(); // network-level failure: are we offline?
    if (e?.name === 'AbortError') throw new AIError('Alice took too long to answer. Check your connection and try again.');
    if (e instanceof AIError) throw e;
    throw new AIError("Couldn't reach Alice's server. Check your internet connection.");
  } finally {
    clearTimeout(t);
  }
}

setDiarySender(async (events) => { await call('/v1/diag', { events }, 20000); });

/** A recording as an attachment for respond() (one round trip). */
export async function audioOf(fileUri: string): Promise<{ mime: string; base64: string }> {
  return { mime: /\.wav$/i.test(fileUri) ? 'audio/wav' : 'audio/m4a', base64: await new File(fileUri).base64() };
}

/** Speech-to-text for audio already in memory (e.g. the glasses' microphone as Ogg Opus). */
/** Readable text of a public web page, fetched by Alice's server. */
export async function readUrl(url: string): Promise<{ title: string; text: string }> {
  return call('/v1/read', { url }, 25000);
}

export async function transcribeAudio(audio: { mime: string; base64: string }): Promise<string> {
  const j = await call('/v1/transcribe', { audioBase64: audio.base64, mime: audio.mime }, 45000);
  return String(j.text ?? '').trim();
}

/** Speech-to-text for a recorded file (m4a or wav). */
export async function transcribe(fileUri: string): Promise<string> {
  const audioBase64 = await new File(fileUri).base64();
  const mime = /\.wav$/i.test(fileUri) ? 'audio/wav' : 'audio/m4a';
  const j = await call('/v1/transcribe', { audioBase64, mime }, 45000);
  return String(j.text ?? '').trim();
}

export type ChatMsg = { role: 'user' | 'assistant'; text: string };

export type Attachment = { mime: string; base64: string; name: string };

export async function respond(mode: string, system: string, history: ChatMsg[], text: string, imageBase64?: string, file?: Attachment, audio?: { mime: string; base64: string }): Promise<AIAnswer> {
  const j = await call('/v1/respond', { mode, system, history, text, imageBase64, file, audio, provider: getSettings().providerOverride || undefined }, file ? 120000 : 60000);
  return { heard: typeof j.heard === 'string' ? j.heard : undefined, text: String(j.text ?? ''), provider: j.provider ?? '?', model: j.model ?? '?', ms: j.ms ?? 0, sources: Array.isArray(j.sources) ? j.sources : [], costUsd: j.costUsd ?? null };
}

/** Settings screen: is the server reachable, which AI is active? */
export async function serverStatus(): Promise<{ ok: boolean; providers: string[]; detail: string }> {
  try {
    const h = await (await fetch(server() + '/health')).json();
    const providers: string[] = h.providers ?? [];
    return { ok: !!h.ok, providers, detail: providers.length ? `Connected · AI: ${providers.join(', ')}` : 'Server is up, but no AI key is set on it yet.' };
  } catch {
    return { ok: false, providers: [], detail: "Can't reach Alice's server." };
  }
}

/** Alice's natural voice: text -> WAV (base64) from the server. */
export async function speechAudio(text: string, voice: string, style?: string): Promise<{ audioBase64: string; mime: string }> {
  const j = await call('/v1/speak', { text, voice, style }, 30000);
  if (!j.audioBase64) throw new AIError('No audio came back.');
  return { audioBase64: j.audioBase64, mime: j.mime ?? 'audio/wav' };
}

/** Short-lived token + endpoints for a real-time conversation (src/live.ts). */
export async function liveSession(): Promise<{ token: string; model: string; endpoints: string[] }> {
  const j = await call('/v1/live', {}, 20000);
  if (!Array.isArray(j.endpoints) || !j.endpoints.length) throw new AIError("Couldn't start a live conversation.");
  return { token: j.token, model: j.model, endpoints: j.endpoints };
}
