/**
 * Alice gets to know you over time: after each conversation she reviews what you said and keeps the
 * lasting facts about you (your car, family, work, likes, plans) in her memory, even if you never said
 * "remember". You can see and delete them on the Memory tab. Off when Memory or Privacy mode is off.
 */
import { memory } from './memory';
import { parseLearned } from './memoryCore';
import { respond } from './ai';
import { getSettings } from './settings';
import { live } from './live';
import { note } from './diary';

const SYSTEM = `You maintain an assistant's long-term memory about its user. From the conversation, list NEW lasting facts about the user worth remembering for months: possessions (car make/model/year), people in their life and their names, job, home area, health or diet the user stated, preferences, routines, goals and upcoming plans with dates. Write each as a short standalone sentence in third person ("Drives a 2021 Dodge Charger"). Skip small talk, questions, jokes, one-off requests and anything already in KNOWN FACTS. Reply with ONLY a JSON array of strings, [] if nothing new.`;

let lastLearn = 0;
let running = false;

export async function learnNow() {
  const s = getSettings();
  if (running || !s.memoryEnabled || s.privacyMode) return;
  const m = memory.get();
  const turns = m.history.filter((t) => t.t > lastLearn);
  if (turns.filter((t) => t.role === 'user').length < 1) return;
  running = true;
  const until = Date.now();
  try {
    const known = m.facts.map((f) => '- ' + f.text).join('\n') || '(none)';
    const convo = turns.map((t) => `${t.role === 'user' ? 'User' : 'Alice'}: ${t.text}`).join('\n');
    const r = await respond('general', SYSTEM, [], `KNOWN FACTS:\n${known}\n\nCONVERSATION:\n${convo}`);
    const facts = parseLearned(r.text);
    for (const f of facts) await memory.remember(f);
    lastLearn = until;
    if (facts.length) note('learned', { count: facts.length });
  } catch (e: any) {
    note('learn-error', { msg: String(e?.message ?? e) });
  } finally { running = false; }
}

// When a conversation ends, and every 6 things you say during a long one.
let prev = live.state;
live.subscribe({ state: (st) => { if (st === 'off' && prev !== 'off') setTimeout(learnNow, 1000); prev = st; } });
let userTurns = 0;
memory.on((m) => {
  const n = m.history.filter((t) => t.role === 'user' && t.t > lastLearn).length;
  if (n >= 6 && n !== userTurns) { userTurns = n; learnNow(); }
});
