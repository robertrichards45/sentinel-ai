import { respond, transcribe, transcribeAudio, audioOf, Source, Attachment } from './ai';
import { parseAssistantTurn, ACTION_SCHEMA_PROMPT } from './intents';
import { runAction, byVoice } from './actions';
import { vocabHint } from './vocab';
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
export async function ask(opts: { text?: string; audioUri?: string; audioData?: { mime: string; base64: string }; imageBase64?: string; file?: Attachment; modeId?: string }): Promise<Exchange> {
  const s = getSettings();
  const mode = allModes().find((m) => m.id === (opts.modeId ?? s.activeMode)) ?? allModes()[0];
  let you = opts.text?.trim() ?? '';
  // Translator needs the words first; every other mode sends the recording straight to the AI (faster).
  const raw = opts.audioData ?? (opts.audioUri ? await audioOf(opts.audioUri) : undefined);
  const audio = raw && mode.id !== 'translator' ? raw : undefined;
  if (raw && !audio) you = opts.audioData ? await transcribeAudio(raw) : await transcribe(opts.audioUri!);
  if (!you && !audio && !opts.imageBase64 && !opts.file) return { you: '', alice: "I didn't catch that.", outcomes: [], mode: mode.id, t: Date.now() };

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

  const instructions = [mode.prompt, ACTION_SCHEMA_PROMPT, vocabHint(200) ? `Names and words this user often says; if what you hear sounds close to one, it is that one: ${vocabHint(200)}.` : '', `Available modes: ${allModes().map((m) => m.id).join(', ')}`, s.memoryEnabled ? memory.prompt() : `Current local time: ${new Date().toString()}`].join('\n\n');
  const history = s.memoryEnabled ? memory.get().history.map((h) => ({ role: h.role, text: h.text })) : [];
  const question = you || (audio ? '' : opts.file ? `Read "${opts.file.name}" to me and tell me what it is.` : mode.wantsImage ? 'What do you see?' : '');
  const ans = await respond(mode.id, instructions, history, question, opts.imageBase64, opts.file, audio);
  const turn = parseAssistantTurn(ans.text, allModes().map((m) => m.id));
  const asked = question || turn.heard || ans.heard || '(spoken question)';

  const outcomes: string[] = [];
  if (turn.reply) await speak(mode.speakFull || opts.file ? turn.reply : turn.reply.slice(0, 1200), undefined, mode.id);
  for (const a of turn.actions) {
    try { outcomes.push(await (audio ? byVoice(() => runAction(a)) : runAction(a))); } catch (e: any) { outcomes.push(`Could not ${a.type}: ${e?.message ?? e}`); }
  }
  if (outcomes.length) await speak(outcomes.join(' '), undefined, mode.id);
  if (s.memoryEnabled) { await memory.turn('user', asked); await memory.turn('assistant', turn.reply); }
  return { you: asked, alice: turn.reply, outcomes, mode: mode.id, t: Date.now(), via: `${ans.provider} · ${ans.model}`, ms: ans.ms, sources: ans.sources };
}
