// OpenAI via the Responses API (+ audio transcriptions).
import { config } from '../config.mjs';

const BASE = 'https://api.openai.com/v1';

async function call(path, init, timeoutMs = 60000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, { ...init, signal: ctl.signal, headers: { Authorization: `Bearer ${config.keys.openai}`, ...(init.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`OpenAI ${r.status}: ${j.error?.message ?? 'request failed'}`), { status: r.status });
    return j;
  } finally { clearTimeout(t); }
}

export async function respond({ model, system, history, text, imageBase64, search, file }) {
  const input = history.map((h) => ({ role: h.role, content: [{ type: h.role === 'user' ? 'input_text' : 'output_text', text: h.text }] }));
  const content = [{ type: 'input_text', text: text || 'What do you see?' }];
  if (imageBase64) content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${imageBase64}` });
  if (file && file.mime.startsWith('image/')) content.push({ type: 'input_image', image_url: `data:${file.mime};base64,${file.base64}` });
  else if (file && file.mime === 'application/pdf') content.push({ type: 'input_file', filename: file.name, file_data: `data:application/pdf;base64,${file.base64}` });
  else if (file) content.push({ type: 'input_text', text: `Attached file "${file.name}":\n` + Buffer.from(file.base64, 'base64').toString('utf8').slice(0, 200000) });
  input.push({ role: 'user', content });
  const body = { model, instructions: system, input, store: false };
  if (search) body.tools = [{ type: 'web_search' }];
  const j = await call('/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const parts = [], src = [];
  for (const item of j.output ?? []) for (const c of item.content ?? []) {
    if (c.type === 'output_text') {
      parts.push(c.text);
      for (const a of c.annotations ?? []) if (a.type === 'url_citation') src.push({ title: a.title ?? a.url, url: a.url });
    }
  }
  return { text: (j.output_text ?? parts.join('\n')).trim(), usage: { in: j.usage?.input_tokens ?? 0, out: j.usage?.output_tokens ?? 0 }, sources: src.slice(0, 6) };
}

export async function transcribe({ audioBase64, mime }) {
  const model = config.models.openai.transcribe;
  const form = new FormData();
  const ext = mime.includes('wav') ? 'wav' : 'm4a';
  form.append('file', new Blob([Buffer.from(audioBase64, 'base64')], { type: mime }), `speech.${ext}`);
  form.append('model', model);
  const j = await call('/audio/transcriptions', { method: 'POST', body: form }, 45000);
  return { text: String(j.text ?? '').trim(), usage: null, model };
}
