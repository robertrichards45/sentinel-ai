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
  | { type: 'event'; title: string; start: string; durationMin: number; place?: string }
  | { type: 'place_reminder'; title: string; place: string; when: 'arrive' | 'leave' }
  | { type: 'what_you_know' }
  | { type: 'take_notes'; action: 'start' | 'stop'; title?: string }
  | { type: 'directions'; to: string; mode: 'driving' | 'walking'; choice?: number }
  | { type: 'stop_directions' }
  | { type: 'run_shortcut'; name: string }
  | { type: 'list_add'; list: string; items: string[] }
  | { type: 'list_read'; list: string }
  | { type: 'list_check'; list: string; item: string }
  | { type: 'emergency' }
  | { type: 'call_911' }
  | { type: 'catch_up' }
  | { type: 'person_note'; name: string; note: string }
  | { type: 'person_info'; name: string }
  | { type: 'read_this'; url?: string; summarize?: boolean }
  | { type: 'daily_recap' }
  | { type: 'scan_doc' }
  | { type: 'undo_last' }
  | { type: 'learn_word'; word: string }
  | { type: 'open_app'; name: string }
  | { type: 'self_check' }
  | { type: 'explain' }
  | { type: 'coach'; on: boolean; exercise?: string }
  | { type: 'log_set'; exercise: string; reps: number; weight?: number }
  | { type: 'workout_history'; days?: number }
  | { type: 'foresight' }
  | { type: 'health_summary' }
  | { type: 'home_control'; command: string }
  | { type: 'ifttt'; event: string; value?: string }
  | { type: 'webhook'; name: string; value?: string }
  | { type: 'capabilities' }
  | { type: 'whats_new' }
  | { type: 'music_control'; command: string }
  | { type: 'email_check'; query?: string; count?: number }
  | { type: 'email_read'; which?: string }
  | { type: 'email_send'; to: string; subject: string; body: string }
  | { type: 'email_reply'; body: string; which?: string }
  | { type: 'email_archive'; which?: string }
  | { type: 'shop'; item: string; store?: string; fulfillment?: 'delivery' | 'pickup'; brand?: string }
  | { type: 'recall'; query: string; last?: number; who?: 'user' | 'assistant' | 'any' }
  | { type: 'make_file'; kind: 'word' | 'pdf' | 'excel' | 'powerpoint'; request: string; title?: string }
  | { type: 'photo_file'; target: 'auto' | 'note' | 'calendar' | 'reminder'; fromLibrary?: boolean }
  | { type: 'email'; to?: string; subject: string; body: string }
  | { type: 'navigate'; destination: string; mode: 'walking' | 'driving' | 'transit' }
  | { type: 'where_am_i' }
  | { type: 'weather'; place?: string; days?: number }
  | { type: 'report_problem'; text: string }
  | { type: 'stop_listening' }
  | { type: 'look_up'; query: string }
  | { type: 'briefing' }
  | { type: 'call'; who: string }
  | { type: 'text'; who: string; body: string }
  | { type: 'timer'; seconds: number; label?: string }
  | { type: 'alarm'; at: string; label?: string }
  | { type: 'cancel_timers' }
  | { type: 'show_camera'; on: boolean }
  | { type: 'play_music'; query: string; app?: string }
  | { type: 'translator'; language?: string; on: boolean }
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
    case 'place_reminder': { const title = str(a.title, 200), place = str(a.place, 200); return title && place ? { type: 'place_reminder', title, place, when: a.when === 'leave' ? 'leave' : 'arrive' } : null; }
    case 'what_you_know': return { type: 'what_you_know' };
    case 'take_notes': { const title = str(a.title, 80); return { type: 'take_notes', action: a.action === 'stop' ? 'stop' : 'start', ...(title ? { title } : {}) }; }
    case 'directions': { const to = str(a.to, 200); const ch = Number(a.choice); return to ? { type: 'directions', to, mode: /walk|foot/i.test(String(a.mode ?? '')) ? 'walking' : 'driving', ...(Number.isInteger(ch) && ch >= 1 && ch <= 3 ? { choice: ch } : {}) } : null; }
    case 'stop_directions': return { type: 'stop_directions' };
    case 'run_shortcut': { const name = str(a.name, 100); return name ? { type: 'run_shortcut', name } : null; }
    case 'list_add': {
      const list = str(a.list, 60) || 'shopping';
      const raw = Array.isArray(a.items) ? a.items : typeof a.items === 'string' ? String(a.items).split(/,| and /) : [];
      const items = raw.map((x: unknown) => str(x, 120)).filter(Boolean).slice(0, 30) as string[];
      return items.length ? { type: 'list_add', list, items } : null;
    }
    case 'list_read': return { type: 'list_read', list: str(a.list, 60) || 'shopping' };
    case 'list_check': { const item = str(a.item, 120); return item ? { type: 'list_check', list: str(a.list, 60) || 'shopping', item } : null; }
    case 'emergency': return { type: 'emergency' };
    case 'call_911': return { type: 'call_911' };
    case 'catch_up': return { type: 'catch_up' };
    case 'person_note': { const name = str(a.name, 60), n = str(a.note, 300); return name && n ? { type: 'person_note', name, note: n } : null; }
    case 'person_info': { const name = str(a.name, 60); return name ? { type: 'person_info', name } : null; }
    case 'read_this': { const url = str(a.url, 2000); return { type: 'read_this', ...(url && /^https?:\/\//i.test(url) ? { url } : {}), ...(a.summarize === true || a.summarize === 'true' ? { summarize: true } : {}) }; }
    case 'daily_recap': return { type: 'daily_recap' };
    case 'scan_doc': return { type: 'scan_doc' };
    case 'undo_last': return { type: 'undo_last' };
    case 'make_file': {
      const k = String(a.kind ?? a.format ?? 'word').toLowerCase();
      const kind = /xls|excel|sheet|spread/.test(k) ? 'excel' : /ppt|power|slide|deck|present/.test(k) ? 'powerpoint' : /pdf/.test(k) ? 'pdf' : 'word';
      const request = str(a.request, 4000) || str(a.content, 4000);
      const title = str(a.title, 120);
      return request ? { type: 'make_file', kind, request, ...(title ? { title } : {}) } : null;
    }
    case 'recall': { const n = Number(a.last); const who = ['user', 'assistant', 'any'].includes(a.who) ? a.who : undefined; return { type: 'recall', query: str(a.query, 200) ?? '', ...(Number.isInteger(n) && n > 0 ? { last: Math.min(30, n) } : {}), ...(who ? { who } : {}) }; }
    case 'self_check': return { type: 'self_check' };
    case 'explain': return { type: 'explain' };
    case 'foresight': return { type: 'foresight' };
    case 'health_summary': return { type: 'health_summary' };
    case 'capabilities': return { type: 'capabilities' };
    case 'whats_new': return { type: 'whats_new' };
    case 'email_check': { const q = str(a.query, 200); const n = Number(a.count); return { type: 'email_check', ...(q ? { query: q } : {}), ...(n > 0 && n <= 10 ? { count: Math.round(n) } : {}) }; }
    case 'email_read': { const w = str(String(a.which ?? ''), 80); return { type: 'email_read', ...(w ? { which: w } : {}) }; }
    case 'email_send': { const to = str(a.to, 120), subject = str(a.subject, 200) ?? '', body = str(a.body, 5000); return to && body ? { type: 'email_send', to, subject, body } : null; }
    case 'email_reply': { const body = str(a.body, 5000), w = str(String(a.which ?? ''), 80); return body ? { type: 'email_reply', body, ...(w ? { which: w } : {}) } : null; }
    case 'email_archive': { const w = str(String(a.which ?? ''), 80); return { type: 'email_archive', ...(w ? { which: w } : {}) }; }
    case 'music_control': { const c = String(a.command ?? '').toLowerCase().replace(/[\s-]+/g, '_'); const map: Record<string, string> = { play: 'resume', unpause: 'resume', skip: 'next', next_song: 'next', back: 'previous', previous_song: 'previous', whats_playing: 'now_playing', what_is_playing: 'now_playing', shuffle: 'shuffle_on' }; const cmd = map[c] ?? c; return ['pause', 'resume', 'next', 'previous', 'restart', 'shuffle_on', 'shuffle_off', 'repeat_on', 'repeat_off', 'stop', 'now_playing'].includes(cmd) ? { type: 'music_control', command: cmd } : null; }
    case 'home_control': { const c = str(a.command, 300); return c ? { type: 'home_control', command: c } : null; }
    case 'ifttt': { const e = str(a.event, 60); const v = str(a.value, 300); return e ? { type: 'ifttt', event: e, ...(v ? { value: v } : {}) } : null; }
    case 'webhook': { const n = str(a.name, 60); const v = str(a.value, 300); return n ? { type: 'webhook', name: n, ...(v ? { value: v } : {}) } : null; }
    case 'coach': { const ex = str(a.exercise, 60); return { type: 'coach', on: a.on !== false && a.on !== 'false', ...(ex ? { exercise: ex } : {}) }; }
    case 'log_set': { const ex = str(a.exercise, 60); const reps = Math.round(Number(a.reps)); const w = Number(a.weight); return ex && reps > 0 && reps < 500 ? { type: 'log_set', exercise: ex, reps, ...(w > 0 && w < 3000 ? { weight: w } : {}) } : null; }
    case 'workout_history': { const d = Number(a.days); return { type: 'workout_history', ...(d > 0 && d <= 365 ? { days: Math.round(d) } : {}) }; }
    case 'shop': { const item = str(a.item, 120); const store = str(a.store, 40); const brand = str(a.brand, 60); const f = /pick/i.test(String(a.fulfillment ?? '')) ? 'pickup' : /deliver/i.test(String(a.fulfillment ?? '')) ? 'delivery' : undefined; return item ? { type: 'shop', item, ...(store ? { store } : {}), ...(f ? { fulfillment: f } : {}), ...(brand ? { brand } : {}) } : null; }
    case 'open_app': { const name = str(a.name, 60); return name ? { type: 'open_app', name } : null; }
    case 'learn_word': { const word = str(a.word, 40); return word ? { type: 'learn_word', word } : null; }
    case 'photo_file': { const t = String(a.target ?? 'auto').toLowerCase(); const target = /calendar|event/.test(t) ? 'calendar' : /remind/.test(t) ? 'reminder' : /note/.test(t) ? 'note' : 'auto'; return { type: 'photo_file', target, ...(a.fromLibrary === true ? { fromLibrary: true } : {}) }; }
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
      const place = str(a.place, 200);
      return { type: 'event', title, start, durationMin: Number.isFinite(d) && d > 0 && d <= 1440 ? Math.round(d) : 60, ...(place ? { place } : {}) };
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
    case 'call': { const who = str(a.who, 80); return who ? { type: 'call', who } : null; }
    case 'text': { const who = str(a.who, 80), body = str(a.body, 1000); return who && body ? { type: 'text', who, body } : null; }
    case 'timer': { const n = Number(a.seconds); const label = str(a.label, 40); return Number.isFinite(n) && n >= 1 && n <= 86400 ? { type: 'timer', seconds: Math.round(n), ...(label ? { label } : {}) } : null; }
    case 'alarm': { const at = str(a.at, 40); const label = str(a.label, 60); return at && !isNaN(Date.parse(at)) ? { type: 'alarm', at, ...(label ? { label } : {}) } : null; }
    case 'cancel_timers': return { type: 'cancel_timers' };
    case 'show_camera': return { type: 'show_camera', on: a.on !== false };
    case 'play_music': { const query = str(a.query, 120); const app = str(a.app, 20); return query ? { type: 'play_music', query, ...(app ? { app } : {}) } : null; }
    case 'translator': { const language = str(a.language, 40); return { type: 'translator', on: a.on !== false, ...(language ? { language } : {}) }; }
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
{"type":"forget","match":"exact text of the fact to forget, copied from what you know"}
{"type":"place_reminder","title":"Take out the trash","place":"home","when":"arrive"}   "remind me when I get home / leave work / get to Walmart"
{"type":"what_you_know"}   "what do you know about me?"
{"type":"take_notes","action":"start","title":"Budget meeting"}   "take notes", "record this meeting"; action "stop" for "stop taking notes"
{"type":"directions","to":"Starbucks","mode":"walking"}   turn-by-turn spoken directions; mode driving (default) or walking. If the result lists options and asks "Which one?", ask the user, then send the same "to" with "choice": 1, 2 or 3
{"type":"stop_directions"}   "stop directions", "cancel navigation"
{"type":"run_shortcut","name":"Lights Off"}   runs one of the user's Siri Shortcuts (smart home, other apps)
{"type":"list_add","list":"shopping","items":["milk","eggs"]}   also list_read {"list"} and list_check {"list","item"}
{"type":"emergency"}   the user needs help or is in danger; then ask about 911
{"type":"call_911"}   ONLY after the user says yes to calling 911
{"type":"catch_up"}   "what did I miss?", "catch me up"
{"type":"person_note","name":"Mike","note":"works with me, into fishing"}   when the user introduces or describes someone
{"type":"person_info","name":"Mike"}   "what do I know about Mike?", "who is Mike?"
{"type":"read_this","summarize":false}   "read me this" (reads what they copied; url optional); summarize true for "sum it up"
{"type":"daily_recap"}   "recap my day", "how was my day"
{"type":"learn_word","word":"Kylee"}   "learn the name Kylee, K-Y-L-E-E", or when the user corrects a name you misheard
{"type":"undo_last"}   "undo", "remove that", "that's wrong, delete it" right after adding an event or reminder
{"type":"scan_doc"}   "scan this document / letter / receipt" (multi-page PDF + text in Files)
{"type":"photo_file","target":"calendar"}   "take a picture of this and add it to my calendar / notes / reminders"; target auto if not said; fromLibrary true for "use a photo I already took"
{"type":"note","text":"..."}
{"type":"reminder","title":"...","due":"2026-11-26T09:00:00-05:00"}
{"type":"event","place":"optional address or place name; adds a time-to-leave alert","title":"...","start":"...","durationMin":60}
{"type":"email","to":"optional","subject":"...","body":"..."}   (opens a draft; the user sends it)
{"type":"navigate","destination":"...","mode":"walking|driving|transit"}
{"type":"where_am_i"}
{"type":"weather","place":"optional city; omit for the user's location","days":1}   live forecast; use for any weather question
{"type":"save_spot","label":"car"}   "remember where I parked", "save this spot"
{"type":"find_spot","label":"car"}   "where did I park?", "take me back to my car"
{"type":"call","who":"Mom"}   "call Mom"
{"type":"text","who":"Sarah","body":"Running 10 minutes late"}   "text Sarah I'm running late"
{"type":"timer","seconds":600,"label":"pasta"}   "set a timer for 10 minutes"
{"type":"alarm","at":"2026-11-27T06:00:00-05:00","label":"wake up"}   "wake me up at 6", "set an alarm for 7:30"
{"type":"cancel_timers"}   "cancel my timer/alarm"
{"type":"play_music","query":"my workout playlist","app":"apple"}   "play Drake", "play my gym playlist", "play the album Thriller", "shuffle Drake" (app: apple (default) or spotify)
{"type":"translator","language":"Spanish","on":true}   "translate for me in Spanish", "be my interpreter"; on:false to stop
{"type":"briefing"}   "brief me", "good morning", "what's my day look like": schedule + weather + headlines
{"type":"stop_listening"}   when the user says stop listening, go to sleep, that's all, leave me alone, be quiet, or ends the conversation
{"type":"report_problem","text":"what went wrong, in the user's words"}   when the user reports a problem or bug with you, the app or the glasses ("note that...", "log a problem", "that didn't work")
{"type":"glasses_status"}
{"type":"agenda","days":7}   what's coming up / what do I have today, this week, on Tuesday (calendar + reminders)
{"type":"set_mode","mode":"<mode id>"}
{"type":"recall","query":"truck","last":3,"who":"user"}   search past conversations ("what did I tell you about…", "the last 3 things I sent you", "what did we talk about yesterday"); query optional when using last
{"type":"shop","item":"dog food","store":"Walmart","fulfillment":"pickup","brand":"Blue Buffalo"}   "order me dog food from Walmart for pickup"; store/brand/fulfillment only if said (she remembers them)
{"type":"explain"}   "why did you do that?", "what did you just do?"
{"type":"coach","on":true,"exercise":"bench press"}   workout coach with the camera ("coach my bench", "watch my form"); on false to stop
{"type":"log_set","exercise":"bench press","reps":8,"weight":185}   "log 8 reps at 185"
{"type":"workout_history","days":7}   "how did I do this week?"
{"type":"home_control","command":"turn off the kitchen lights"}   smart home through Home Assistant (lights, locks, thermostat, garage, TV, car...)
{"type":"ifttt","event":"start_car"}   fire an IFTTT applet by event name
{"type":"webhook","name":"Morning routine"}   run one of the user's custom connections
{"type":"music_control","command":"next"}   Apple Music: pause, resume, next, previous, restart, shuffle_on, shuffle_off, repeat_on, repeat_off, stop, now_playing ("what's playing?")
{"type":"email_check","query":"from:kylee"}   Gmail: "any new emails?" (no query = unread), or a Gmail search
{"type":"email_read","which":"2"}   read one from the last list ("read the second one", "read Kylee's")
{"type":"email_reply","body":"..."}   reply to the email just read — ONLY after reading the reply back to the user and they say send
{"type":"email_send","to":"Kylee","subject":"...","body":"..."}   new email — ONLY after the user confirms the exact text
{"type":"email_archive","which":"that"}
{"type":"whats_new"}   "what's new?", "what did they update?", "what can you do now?"
{"type":"capabilities"}   "what can you do?", "what are your features?"
{"type":"health_summary"}   "how did I sleep?", "how many steps today?", "should I train hard today?"
{"type":"foresight"}   "anything coming up I should know about?", "what deadlines do I have?"
{"type":"self_check"}   "fix yourself", "run a self-check", "something's wrong with you", "repair yourself"
{"type":"open_app","name":"Spotify"}   "open Spotify / Instagram / my calendar / Uber"
{"type":"make_file","kind":"word|pdf|excel|powerpoint","request":"exactly what the user wants, with every detail they gave","title":"optional"}
   PREFERRED for any resume, letter, report, form, spreadsheet, budget, tracker or presentation: it researches any official standard (e.g. federal resume rules) and builds a real Word/Excel/PowerPoint/PDF file. Word if they don't say.
{"type":"document","title":"...","format":"pdf|text","content":"<the COMPLETE document in Markdown: # title, ## headings, - lists, | tables |>"}
   use when the user asks you to write, create, draft or make a document, letter, report, list, plan, resume or similar.
   Put the whole document in "content"; in "reply" just say briefly what you made (do not read the document aloud).
When the user mentions a meeting, appointment or anything with a date ("I have a meeting Tuesday"), add it with an event action; if no time was given, ask what time first. Use a reminder for to-dos ("remind me to call mom at 6").
Never invent facts about the user. Never claim an action is done; the app confirms it.`;
