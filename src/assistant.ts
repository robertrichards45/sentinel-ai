import { respond, transcribe, Source, Attachment } from './ai';
import { parseAssistantTurn, ACTION_SCHEMA_PROMPT } from './intents';
import { runAction } from './actions';
import { memory } from './memory';
import { getSettings } from './settings';
import { allModes } from './modeStore';
import { speak, localeFor } from './voice';
import { glassesStatusText } from './glassesState';

export type Exchange = { you: string; alice: string; outcomes: string[]; mode: string; t: number; via?: string; ms?: number; sources?: Source[] };

/** Offline commands: answered on the phone with no network and no AI. */
export function offlineAnswer(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(what time|the time)\b/.test(t)) return `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  if (/\b(what('s| is) the date|today'?s date|what day)\b/.test(t)) return `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`;
  if (/\b(glasses|battery|status)\b/.test(t) && t.split(' ').length < 8) return glassesStatusText();
  if (/\bwhat do you (know|remember) about me\b/.test(t)) {
    const f = memory.get().facts;
    return f.length ? 'You asked me to remember: ' + f.map((x) => x.text).join('; ') + '.' : 'You have not asked me to remember anything yet.';
  }
  return null;
}

/** One full turn: optional speech file → text → AI (+image) → actions → spoken reply. */
export async function ask(opts: { text?: string; audioUri?: string; imageBase64?: string; file?: Attachment; modeId?: string }): Promise<Exchange> {
  const s = getSettings();
  const mode = allModes().find((m) => m.id === (opts.modeId ?? s.activeMode)) ?? allModes()[0];
  let you = opts.text?.trim() ?? '';
  if (opts.audioUri) you = await transcribe(opts.audioUri);
  if (!you && !opts.imageBase64 && !opts.file) return { you: '', alice: "I didn't catch that.", outcomes: [], mode: mode.id, t: Date.now() };

  const offline = !opts.imageBase64 && !opts.file && mode.id !== 'translator' ? offlineAnswer(you) : null;
  if (offline) {
    await speak(offline, undefined, mode.id);
    return { you, alice: offline, outcomes: [], mode: mode.id, t: Date.now() };
  }

  if (mode.id === 'translator') {
    const out = await respond(mode.id, `${mode.prompt}\nTarget language: ${s.translateTo}. Return only the translated text.`, [], you);
    await speak(out.text, localeFor(s.translateTo), mode.id);
    return { you, alice: out.text, outcomes: [], mode: mode.id, t: Date.now(), via: `${out.provider} · ${out.model}`, ms: out.ms };
  }

  const instructions = [mode.prompt, ACTION_SCHEMA_PROMPT, `Available modes: ${allModes().map((m) => m.id).join(', ')}`, s.memoryEnabled ? memory.prompt() : `Current local time: ${new Date().toString()}`].join('\n\n');
  const history = s.memoryEnabled ? memory.get().history.map((h) => ({ role: h.role, text: h.text })) : [];
  const question = you || (opts.file ? `Read "${opts.file.name}" to me and tell me what it is.` : mode.wantsImage ? 'What do you see?' : '');
  const ans = await respond(mode.id, instructions, history, question, opts.imageBase64, opts.file);
  const turn = parseAssistantTurn(ans.text, allModes().map((m) => m.id));

  const outcomes: string[] = [];
  if (turn.reply) await speak(mode.speakFull || opts.file ? turn.reply : turn.reply.slice(0, 1200), undefined, mode.id);
  for (const a of turn.actions) {
    try { outcomes.push(await runAction(a)); } catch (e: any) { outcomes.push(`Could not ${a.type}: ${e?.message ?? e}`); }
  }
  if (outcomes.length) await speak(outcomes.join(' '), undefined, mode.id);
  if (s.memoryEnabled) { await memory.turn('user', question); await memory.turn('assistant', turn.reply); }
  return { you: question, alice: turn.reply, outcomes, mode: mode.id, t: Date.now(), via: `${ans.provider} · ${ans.model}`, ms: ans.ms, sources: ans.sources };
}
