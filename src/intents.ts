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
  | { type: 'weather'; place?: string; days?: number }
  | { type: 'report_problem'; text: string }
  | { type: 'stop_listening' }
  | { type: 'look_up'; query: string }
  | { type: 'briefing' }
  | { type: 'save_spot'; label?: string }
  | { type: 'find_spot'; label?: string }
  | { type: 'glasses_status' }
  | { type: 'agenda'; days?: number }
  | { type: 'set_mode'; mode: string }
  | { type: 'document'; title: string; format: 'pdf' | 'text'; content: string };

export type AssistantTurn = { reply: string; actions: Action[]; heard?: string };

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
    case 'weather': {
      const place = str(a.place, 100); const d = Number(a.days);
      return { type: 'weather', ...(place ? { place } : {}), ...(Number.isFinite(d) && d >= 1 && d <= 7 ? { days: Math.round(d) } : {}) };
    }
    case 'glasses_status': return { type: 'glasses_status' };
    case 'agenda': { const d = Number(a.days); return Number.isFinite(d) && d >= 1 && d <= 31 ? { type: 'agenda', days: Math.round(d) } : { type: 'agenda' }; }
    case 'stop_listening': return { type: 'stop_listening' };
    case 'briefing': return { type: 'briefing' };
    case 'look_up': { const query = str(a.query, 300); return query ? { type: 'look_up', query } : null; }
    case 'save_spot': { const label = str(a.label, 60); return label ? { type: 'save_spot', label } : { type: 'save_spot' }; }
    case 'find_spot': { const label = str(a.label, 60); return label ? { type: 'find_spot', label } : { type: 'find_spot' }; }
    case 'report_problem': { const text = str(a.text, 600); return text ? { type: 'report_problem', text } : null; }
    case 'set_mode': return knownModes.includes(a.mode) ? { type: 'set_mode', mode: a.mode } : null;
    case 'document': {
      const title = str(a.title, 120), content = str(a.content, 40000);
      if (!title || !content) return null;
      return { type: 'document', title, format: a.format === 'text' ? 'text' : 'pdf', content };
    }
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
    const heard = typeof j.heard === 'string' && j.heard.trim() ? j.heard.trim().slice(0, 2000) : undefined;
    return { reply: reply || (actions.length ? 'Okay.' : raw.trim()), actions, ...(heard ? { heard } : {}) };
  } catch {
    return { reply: raw.trim(), actions: [] }; // plain-text answer, no actions
  }
}

export const ACTION_SCHEMA_PROMPT = `Always answer with ONE JSON object and nothing else:
{"heard": "<only when the user spoke: exact transcript of their words>", "reply": "<what to say aloud, short, natural>", "actions": [ ... ]}
"actions" may be empty. Allowed actions (use ISO 8601 with the user's UTC offset for times):
{"type":"remember","fact":"..."}            only when the user asks you to remember something
{"type":"forget","match":"..."}
{"type":"note","text":"..."}
{"type":"reminder","title":"...","due":"2026-11-26T09:00:00-05:00"}
{"type":"event","title":"...","start":"...","durationMin":60}
{"type":"email","to":"optional","subject":"...","body":"..."}   (opens a draft; the user sends it)
{"type":"navigate","destination":"...","mode":"walking|driving|transit"}
{"type":"where_am_i"}
{"type":"weather","place":"optional city; omit for the user's location","days":1}   live forecast; use for any weather question
{"type":"save_spot","label":"car"}   "remember where I parked", "save this spot"
{"type":"find_spot","label":"car"}   "where did I park?", "take me back to my car"
{"type":"briefing"}   "brief me", "good morning", "what's my day look like": schedule + weather + headlines
{"type":"stop_listening"}   when the user says stop listening, go to sleep, that's all, leave me alone, be quiet, or ends the conversation
{"type":"report_problem","text":"what went wrong, in the user's words"}   when the user reports a problem or bug with you, the app or the glasses ("note that...", "log a problem", "that didn't work")
{"type":"glasses_status"}
{"type":"agenda","days":7}   what's coming up / what do I have today, this week, on Tuesday (calendar + reminders)
{"type":"set_mode","mode":"<mode id>"}
{"type":"document","title":"...","format":"pdf|text","content":"<the COMPLETE document in Markdown: # title, ## headings, - lists, | tables |>"}
   use when the user asks you to write, create, draft or make a document, letter, report, list, plan, resume or similar.
   Put the whole document in "content"; in "reply" just say briefly what you made (do not read the document aloud).
When the user mentions a meeting, appointment or anything with a date ("I have a meeting Tuesday"), add it with an event action; if no time was given, ask what time first. Use a reminder for to-dos ("remind me to call mom at 6").
Never invent facts about the user. Never claim an action is done; the app confirms it.`;
