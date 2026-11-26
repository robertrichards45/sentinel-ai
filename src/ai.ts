import { secret } from './storage';
import { getSettings } from './settings';

/**
 * OpenAI client. All traffic is HTTPS (TLS) to api.openai.com. The API key is read
 * from the iOS Keychain at call time and never logged or written to disk.
 */
const BASE = 'https://api.openai.com/v1';
export const KEY_NAME = 'openai_api_key';

export class AIError extends Error {}

async function key(): Promise<string> {
  if (getSettings().privacyMode) throw new AIError('Privacy mode is on: AI features are paused and nothing is sent off the phone.');
  const k = await secret.get(KEY_NAME);
  if (!k) throw new AIError('Add your OpenAI API key in Settings first.');
  return k;
}

async function call(path: string, init: RequestInit, timeoutMs = 45000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, { ...init, signal: ctl.signal });
    const body = await r.text();
    if (!r.ok) {
      let msg = body.slice(0, 300);
      try { msg = JSON.parse(body).error?.message ?? msg; } catch {}
      throw new AIError(`OpenAI ${r.status}: ${msg}`);
    }
    return JSON.parse(body);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new AIError('No answer from OpenAI in time. Check your connection.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Speech-to-text for a recorded audio file (m4a from the recorder). */
export async function transcribe(fileUri: string, languageHint?: string): Promise<string> {
  const form = new FormData();
  form.append('file', { uri: fileUri, name: 'speech.m4a', type: 'audio/m4a' } as any);
  form.append('model', getSettings().transcribeModel);
  if (languageHint) form.append('prompt', `Language hint: ${languageHint}`);
  const j = await call('/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${await key()}` }, body: form });
  return String(j.text ?? '').trim();
}

export type ChatMsg = { role: 'user' | 'assistant'; text: string };

/** Text (+ optional image) request via the Responses API. Returns the model's text. */
export async function respond(instructions: string, history: ChatMsg[], userText: string, imageBase64Jpeg?: string): Promise<string> {
  const input: any[] = history.map((m) => ({
    role: m.role,
    content: [{ type: m.role === 'user' ? 'input_text' : 'output_text', text: m.text }],
  }));
  const content: any[] = [{ type: 'input_text', text: userText }];
  if (imageBase64Jpeg) content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${imageBase64Jpeg}` });
  input.push({ role: 'user', content });
  const j = await call('/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: getSettings().chatModel, instructions, input, store: false }),
  }, 60000);
  if (typeof j.output_text === 'string') return j.output_text;
  const parts: string[] = [];
  for (const item of j.output ?? []) for (const c of item.content ?? []) if (c.type === 'output_text') parts.push(c.text);
  return parts.join('\n').trim();
}

/** Cheap connectivity/key check for the Settings screen. */
export async function testKey(): Promise<string> {
  const t = await respond('Reply with exactly: OK', [], 'ping');
  return t.trim();
}
