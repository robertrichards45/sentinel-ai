/** Pure offline command parser (unit-tested on the PC): what Alice can still do with no internet. */
import type { Action } from './intents';

export type OfflineResult = { action: Action } | { say: string } | null;

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90, half: 0.5 };
const num = (w: string) => (/^\d+(\.\d+)?$/.test(w) ? Number(w) : NUM[w.toLowerCase()]);
const UNIT: Record<string, number> = { second: 1, sec: 1, minute: 60, min: 60, hour: 3600, hr: 3600 };

export function parseDuration(t: string): number | null {
  let total = 0, found = false;
  // "two and a half minutes" -> 2.5 minutes
  t = t.replace(/\b(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+and a half\s+(second|sec|minute|min|hour|hr)s?\b/gi, (_m, n, u) => `${(num(n) ?? 0) + 0.5} ${u}`);
  const re = /(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty-five|forty|fifty|sixty|ninety|half)\s*(?:an?\s+)?(second|sec|minute|min|hour|hr)s?\b/gi;
  for (const m of t.matchAll(re)) { const n = num(m[1]); if (n !== undefined) { total += n * UNIT[m[2].toLowerCase()]; found = true; } }
  const u = t.match(/(hour|minute)s?\s+and a half/i); // "an hour and a half"
  if (u && found) total += UNIT[u[1].toLowerCase()] / 2;
  return found && total >= 1 ? Math.round(total) : null;
}

/** "7", "7:30", "7 30", with am/pm; returns the next time that clock time comes round. */
export function parseClock(t: string, now = new Date()): Date | null {
  const m = t.match(/\b(\d{1,2})(?:[:\s](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|in the morning|tonight|in the evening|at night)?\b/i);
  if (!m) return null;
  let h = Number(m[1]); const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  const ap = (m[3] ?? '').toLowerCase();
  if (/p|evening|night|tonight/.test(ap) && h < 12) h += 12;
  if (/a|morning/.test(ap) && !/p/.test(ap) && h === 12) h = 0;
  const d = new Date(now); d.setSeconds(0, 0); d.setHours(h, min);
  if (!ap && h <= 12) { // "7" with no am/pm: the next 7 o'clock, morning or evening
    if (d <= now) { d.setHours(h + 12 === 24 ? 12 : h + 12); if (d <= now) { d.setHours(h); d.setDate(d.getDate() + 1); } }
  } else if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

const LIST = /(?:my|the)?\s*([a-z-]+(?:\s[a-z-]+)?)\s+list/i;

export function parseOffline(raw: string, shortcuts: string[] = [], now = new Date()): OfflineResult {
  const t = raw.trim().replace(/^(hey|hi|okay|ok)?[\s,]*(alice|alyce|alis|elise)[\s,]*/i, '').replace(/[.?!]+$/, '');
  const low = t.toLowerCase();
  if (!low) return null;
  if (/\b(i need help|help me|emergency|i'?m hurt|call for help|sos)\b/.test(low)) return { action: { type: 'emergency' } };
  if (/^(yes,? )?call 911$|^call 9 1 1$/.test(low)) return { action: { type: 'call_911' } };
  if (/\b(cancel|stop|clear|delete)\b.*\b(timers?|alarms?)\b/.test(low)) return { action: { type: 'cancel_timers' } };
  if (/\btimer\b/.test(low)) { const s = parseDuration(low); return s ? { action: { type: 'timer', seconds: s } } : { say: 'How long should the timer be?' }; }
  if (/\b(wake me( up)?|alarm)\b/.test(low)) { const d = parseClock(low.replace(/.*\b(at|for)\b/, ''), now); return d ? { action: { type: 'alarm', at: d.toISOString() } } : { say: 'What time should I set the alarm for?' }; }
  if (/^(stop|end|cancel) (the )?(directions|navigation|navigating)/.test(low)) return { action: { type: 'stop_directions' } };
  if (/^(stop|end) (taking )?notes/.test(low)) return { action: { type: 'take_notes', action: 'stop' } };
  if (/^(take|start taking) notes/.test(low)) return { action: { type: 'take_notes', action: 'start' } };
  if (/\bwhat('?s| is) the time\b|\bwhat time is it\b/.test(low)) return { say: `It's ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.` };
  if (/\bwhat('?s| is) (the |today'?s )?date\b|\bwhat day is (it|today)\b/.test(low)) return { say: `It's ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.` };
  let m = t.match(/^(?:please )?add (.+?) to (?:my |the )?(.+?) list$/i);
  if (m) return { action: { type: 'list_add', list: m[2], items: m[1].split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean) } };
  m = t.match(/^(?:check off|cross off|remove) (.+?)(?: (?:from|on) (?:my |the )?(.+?) list)?$/i);
  if (m) return { action: { type: 'list_check', list: m[2] ?? 'shopping', item: m[1] } };
  if (/\bwhat('?s| is) on\b|\bread (me )?(my|the)\b.*\blist\b/.test(low) && /\blist\b/.test(low)) { const l = t.match(LIST); return { action: { type: 'list_read', list: l ? l[1].replace(/^(what'?s|is|on|my|the)\s+/i, '') : 'shopping' } }; }
  if (/\b(where did i park|where'?s my car|where is my car|find my car)\b/.test(low)) return { action: { type: 'find_spot', label: 'car' } };
  m = low.match(/^(?:remember|save) (?:where i parked|my parking spot|my car)/);
  if (m) return { action: { type: 'save_spot', label: 'car' } };
  m = t.match(/^(?:remember|save) this (?:place|spot|location)(?: as (.+))?$/i);
  if (m) return { action: m[1] ? { type: 'save_spot', label: m[1] } : { type: 'save_spot' } };
  m = t.match(/^take (?:me )?(?:back )?to (?:my |the )?(.+)$/i);
  if (m) return { action: { type: 'find_spot', label: m[1] } };
  m = t.match(/^(?:take a note|make a note|note|write (?:this )?down)[:,]?\s+(?:that\s+)?(.+)$/i);
  if (m) return { action: { type: 'note', text: m[1] } };
  m = t.match(/^remember (?:that )?(.+)$/i);
  if (m) return { action: { type: 'remember', fact: m[1] } };
  m = t.match(/^(?:call|phone|dial) (.+)$/i);
  if (m) return { action: { type: 'call', who: m[1] } };
  m = t.match(/^(?:text|message|send a text to) (.+?)(?: saying| that|:)\s+(.+)$/i);
  if (m) return { action: { type: 'text', who: m[1], body: m[2] } };
  m = t.match(/^run (?:my |the )?(.+?)(?: shortcut)?$/i);
  if (m) return { action: { type: 'run_shortcut', name: m[1] } };
  const sc = shortcuts.find((s) => low === s.toLowerCase() || low.includes(s.toLowerCase()));
  if (sc) return { action: { type: 'run_shortcut', name: sc } };
  return null;
}

export const OFFLINE_HELP = "I'm offline right now, so I can only do timers, alarms, the time and date, notes, lists, your parking spot, calls and texts, shortcuts and emergency help.";
