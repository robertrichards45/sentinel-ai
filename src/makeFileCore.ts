/** Parsing Alice's replies for Word/PDF/Excel/PowerPoint files (pure, unit-tested on the PC). */
export type DocReply = { standard: string; font?: string; size?: number; margins?: number; title: string; markdown: string };

export function parseDocReply(text: string): DocReply {
  let t = text.replace(/^```(?:markdown|md)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  let standard = '', font: string | undefined, size: number | undefined, margins: number | undefined;
  const std = t.match(/^\s*STANDARD:\s*(.+)$/im); if (std) standard = std[1].trim();
  const f = t.match(/^\s*FONT:\s*([^,\n]+?)\s*,\s*([\d.]+)\s*(?:pt)?\s*(?:,\s*([\d.]+))?/im);
  if (f) {
    font = f[1].trim().replace(/["']/g, '').slice(0, 40) || undefined;
    const sz = Number(f[2]); if (sz >= 8 && sz <= 16) size = sz;
    const m = Number(f[3]); if (m >= 0.4 && m <= 1.6) margins = m;
  }
  // Drop the header lines (everything up to the first --- after them).
  if (std || f) {
    const sep = t.search(/^\s*---\s*$/m);
    t = sep >= 0 && sep < 600 ? t.slice(sep).replace(/^\s*---\s*\n?/, '') : t.replace(/^\s*(STANDARD|FONT):.*$/gim, '');
  }
  const markdown = t.trim();
  const title = (markdown.match(/^#\s+(.+)$/m)?.[1] ?? '').replace(/[*_`]/g, '').trim().slice(0, 80);
  return { standard, font, size, margins, title, markdown };
}

const json = (text: string): any => { const m = text.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };

export function parseSheetsReply(text: string): { standard: string; sheets: { name: string; rows: (string | number | null)[][] }[] } | null {
  const j = json(text);
  if (!j || !Array.isArray(j.sheets)) return null;
  const sheets = j.sheets.filter((s: any) => Array.isArray(s?.rows)).slice(0, 10).map((s: any) => ({
    name: String(s.name ?? 'Sheet').slice(0, 31),
    rows: s.rows.slice(0, 2000).map((r: any) => (Array.isArray(r) ? r.slice(0, 50).map((v: any) => (typeof v === 'number' || v === null ? v : String(v ?? ''))) : [String(r)])),
  }));
  return sheets.length ? { standard: String(j.standard ?? ''), sheets } : null;
}

export function parseSlidesReply(text: string): { standard: string; title: string; slides: { title: string; bullets: string[]; notes?: string }[] } | null {
  const j = json(text);
  if (!j || !Array.isArray(j.slides)) return null;
  const slides = j.slides.slice(0, 50).map((s: any) => ({ title: String(s?.title ?? '').slice(0, 120), bullets: Array.isArray(s?.bullets) ? s.bullets.slice(0, 9).map((b: any) => String(b).slice(0, 200)) : [], ...(s?.notes ? { notes: String(s.notes).slice(0, 1000) } : {}) })).filter((s: any) => s.title || s.bullets.length);
  return slides.length ? { standard: String(j.standard ?? ''), title: String(j.title ?? '').slice(0, 120), slides } : null;
}
