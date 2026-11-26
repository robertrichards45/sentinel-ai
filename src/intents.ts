/**
 * Structured actions the assistant may request. The model returns JSON; this file
 * validates it strictly. Anything malformed is dropped, never executed.
 * Pure TypeScript (no React Native imports) so it is unit-tested on the PC.
 */
export type Action =
  | { type: 'remember'; fact: string }
  | { type: 'forget'; match: string }
  | { type: 'note'; text: string }
  | { type: 'reminder'; title: string; due?: string }
  | { type: 'event'; title: string; start: string; durationMin: number }
  | { type: 'email'; to?: string; subject: string; body: string }
  | { type: 'navigate'; destination: string; mode: 'walking' | 'driving' | 'transit' }
  | { type: 'where_am_i' }
  | { type: 'glasses_status' }
  | { type: 'set_mode'; mode: string };

export type AssistantTurn = { reply: string; actions: Action[] };

const str = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const iso = (v: unknown) => {
  const s = str(v, 40);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined;
};

export function validateAction(a: any, knownModes: string[]): Action | null {
  if (!a || typeof a !== 'object') return null;
  switch (a.type) {
    case 'remember': { const fact = str(a.fact, 300); return fact ? { type: 'remember', fact } : null; }
    case 'forget': { const match = str(a.match, 100); return match ? { type: 'forget', match } : null; }
    case 'note': { const text = str(a.text, 2000); return text ? { type: 'note', text } : null; }
    case 'reminder': {
      const title = str(a.title, 200);
      if (!title) return null;
      const due = iso(a.due);
      return due ? { type: 'reminder', title, due } : { type: 'reminder', title };
    }
    case 'event': {
      const title = str(a.title, 200), start = iso(a.start);
      const d = Number(a.durationMin);
      if (!title || !start) return null;
      return { type: 'event', title, start, durationMin: Number.isFinite(d) && d > 0 && d <= 1440 ? Math.round(d) : 60 };
    }
    case 'email': {
      const subject = str(a.subject, 200), body = str(a.body, 5000), to = str(a.to, 200);
      if (!subject || !body) return null;
      if (to && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { type: 'email', subject, body }; // drop bad address, keep draft
      return to ? { type: 'email', to, subject, body } : { type: 'email', subject, body };
    }
    case 'navigate': {
      const destination = str(a.destination, 200);
      const mode = ['walking', 'driving', 'transit'].includes(a.mode) ? a.mode : 'walking';
      return destination ? { type: 'navigate', destination, mode } : null;
    }
    case 'where_am_i': return { type: 'where_am_i' };
    case 'glasses_status': return { type: 'glasses_status' };
    case 'set_mode': return knownModes.includes(a.mode) ? { type: 'set_mode', mode: a.mode } : null;
    default: return null;
  }
}

/** Parse the model's raw text. Accepts bare JSON or JSON inside a ```json fence. */
export function parseAssistantTurn(raw: string, knownModes: string[]): AssistantTurn {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (m ? m[1] : raw).trim();
  try {
    const j = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
    const reply = typeof j.reply === 'string' ? j.reply : '';
    const actions = Array.isArray(j.actions)
      ? (j.actions.slice(0, 5).map((a: any) => validateAction(a, knownModes)).filter(Boolean) as Action[])
      : [];
    return { reply: reply || (actions.length ? 'Okay.' : raw.trim()), actions };
  } catch {
    return { reply: raw.trim(), actions: [] }; // plain-text answer, no actions
  }
}

export const ACTION_SCHEMA_PROMPT = `Always answer with ONE JSON object and nothing else:
{"reply": "<what to say aloud, short, natural>", "actions": [ ... ]}
"actions" may be empty. Allowed actions (use ISO 8601 with the user's UTC offset for times):
{"type":"remember","fact":"..."}            only when the user asks you to remember something
{"type":"forget","match":"..."}
{"type":"note","text":"..."}
{"type":"reminder","title":"...","due":"2026-11-26T09:00:00-05:00"}
{"type":"event","title":"...","start":"...","durationMin":60}
{"type":"email","to":"optional","subject":"...","body":"..."}   (opens a draft; the user sends it)
{"type":"navigate","destination":"...","mode":"walking|driving|transit"}
{"type":"where_am_i"}
{"type":"glasses_status"}
{"type":"set_mode","mode":"<mode id>"}
Never invent facts about the user. Never claim an action is done; the app confirms it.`;
