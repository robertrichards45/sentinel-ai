/**
 * "Read me this": reads an article, email or any text aloud through the glasses, a paragraph at a time.
 * Sources: what you copied (a link or text), or a "Read with Alice" share-sheet Shortcut that opens
 * alice://read?url=… or alice://read?text=…. Press the glasses button or say stop to cut her off.
 */
import * as Clipboard from 'expo-clipboard';
import { readUrl, respond } from './ai';
import { speak, speechGeneration, onSpeaking } from './voice';
import { chunksForReading } from './speechCore';
export { chunksForReading };
let talking = false;
onSpeaking((on) => { talking = on; });
import { live } from './live';
import { note } from './diary';

let reading = false;
export const isReading = () => reading;


const URL_RE = /https?:\/\/[^\s<>"']+/i;

async function getContent(src: { url?: string; text?: string }): Promise<{ title: string; text: string } | string> {
  let { url, text } = src;
  if (!url && !text) {
    const clip = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (!clip) return 'Copy a link or some text first, then ask me again. Or use the Read with Alice shortcut from the Share button.';
    const m = clip.match(URL_RE);
    if (m && clip.length < m[0].length + 40) url = m[0]; else text = clip;
  }
  if (url) {
    try { return await readUrl(url); } catch (e: any) { return `I couldn't open that page. ${String(e?.message ?? '')}`.trim(); }
  }
  return { title: '', text: String(text) };
}

/** Read the whole thing (or a summary). Returns what to say if there was a problem or the summary itself. */
export async function readThis(src: { url?: string; text?: string; summarize?: boolean } = {}): Promise<string> {
  const c = await getContent(src);
  if (typeof c === 'string') return c;
  if (c.text.trim().length < 20) return "I couldn't find anything to read there.";
  note('read', { chars: c.text.length, summarize: !!src.summarize });
  if (src.summarize) {
    const r = await respond('general', 'Summarize this for someone listening, in 4 to 6 short spoken sentences. Plain text, no lists.', [], c.text.slice(0, 40000));
    return (c.title ? `${c.title}. ` : '') + r.text;
  }
  const minutes = Math.max(1, Math.round(c.text.split(/\s+/).length / 160));
  // Start after the live conversation has said "okay"; the reader uses Alice's normal voice.
  (async () => {
    await new Promise((r) => setTimeout(r, 1500));
    for (let t = 0; t < 30 && (live.state === 'speaking' || live.state === 'thinking' || talking); t++) await new Promise((r) => setTimeout(r, 250));
    if (live.state !== 'off') live.stop();
    reading = true;
    try {
      const parts = chunksForReading((c.title ? c.title + '.\n' : '') + c.text);
      for (const p of parts) {
        const before = speechGeneration();
        await speak(p);
        if (speechGeneration() !== before + 1) break; // stopped or interrupted
      }
    } finally { reading = false; }
  })();
  return `Okay, reading it now. About ${minutes} minute${minutes === 1 ? '' : 's'}. Press the glasses button to stop.`;
}
