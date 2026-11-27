/**
 * Split an answer so Alice can start talking sooner: the first sentence is voiced
 * (and played) while the rest is still being generated. Pure TS, unit-tested.
 */
export function splitForSpeech(text: string, min = 40, max = 220): [string, string] {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return [t, ''];
  const re = /[.!?…](?=\s)/g;
  let cut = -1, m: RegExpExecArray | null;
  while ((m = re.exec(t))) { if (m.index + 1 >= min) { cut = m.index + 1; break; } }
  if (cut < 0 || cut > max) {
    const sp = t.lastIndexOf(', ', max); // fall back to a comma, then a space
    cut = sp >= min ? sp + 1 : Math.max(t.lastIndexOf(' ', max), min);
  }
  return [t.slice(0, cut).trim(), t.slice(cut).trim()];
}

/** Split into speakable pieces of about 500 characters, on sentence ends. */
export function chunksForReading(text: string, size = 500): string[] {
  const sentences = text.replace(/\s*\n+\s*/g, '\n').split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = []; let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).length > size && cur) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) out.push(cur);
  return out;
}
