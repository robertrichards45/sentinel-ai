// Google Gemini via the generateContent REST API.
import { config } from '../config.mjs';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function call(model, body, timeoutMs = 60000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.keys.gemini },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}: ${j.error?.message ?? 'request failed'}`), { status: r.status });
    return j;
  } finally { clearTimeout(t); }
}

function textOf(j) {
  const c = j.candidates?.[0];
  if (!c) {
    const why = j.promptFeedback?.blockReason;
    throw new Error(why ? `Gemini blocked the request (${why}).` : 'Gemini returned no answer.');
  }
  return (c.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
}
const usage = (j) => ({ in: j.usageMetadata?.promptTokenCount ?? 0, out: j.usageMetadata?.candidatesTokenCount ?? 0 });
function sources(j) {
  const chunks = j.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks.map((c) => c.web).filter(Boolean).map((w) => ({ title: w.title ?? w.uri, url: w.uri })).slice(0, 6);
}

export async function respond({ model, system, history, text, imageBase64, search }) {
  const contents = history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] }));
  const parts = [{ text: text || 'What do you see?' }];
  if (imageBase64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } });
  contents.push({ role: 'user', parts });
  const body = { system_instruction: { parts: [{ text: system }] }, contents };
  if (search) body.tools = [{ google_search: {} }];
  const j = await call(model, body);
  return { text: textOf(j), usage: usage(j), sources: sources(j) };
}

export async function transcribe({ audioBase64, mime }) {
  const model = config.models.gemini.transcribe;
  const j = await call(model, {
    contents: [{ role: 'user', parts: [
      { text: 'Transcribe this speech exactly as spoken, in the language spoken. Return only the transcript, no notes. If there is no speech, return an empty string.' },
      { inline_data: { mime_type: mime, data: audioBase64 } },
    ] }],
  }, 45000);
  return { text: textOf(j).replace(/^"|"$/g, ''), usage: usage(j), model };
}
