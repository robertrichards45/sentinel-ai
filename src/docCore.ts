/**
 * Turns the Markdown Alice writes into a print-ready HTML page (then a PDF via expo-print).
 * Pure TypeScript so it is unit-tested on the PC. Everything is HTML-escaped first,
 * so model output can never inject markup or scripts into the document.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function markdownToHtmlBody(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  let table: string[][] | null = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushTable(); };

  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara(); flushList();
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator row
      (table ??= []).push(cells);
      continue;
    } else flushTable();
    let m: RegExpMatchArray | null;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushAll(); const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushAll(); out.push('<hr/>'); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { flushPara(); if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    flushList();
    para.push(line.trim());
  }
  flushAll();
  return out.join('\n');
}

export function documentHtml(title: string, md: string, date = new Date()): string {
  const body = markdownToHtmlBody(md);
  const hasH1 = /^<h1>/.test(body);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><style>
@page { margin: 22mm 20mm; }
body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 11.5pt; line-height: 1.5; color: #15161c; }
h1 { font-size: 22pt; margin: 0 0 4pt; letter-spacing: -0.3pt; }
h2 { font-size: 15pt; margin: 18pt 0 6pt; } h3 { font-size: 12.5pt; margin: 14pt 0 4pt; }
p { margin: 0 0 9pt; } ul, ol { margin: 0 0 9pt 18pt; padding: 0; } li { margin: 0 0 3pt; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 12pt; font-size: 10.5pt; }
th, td { border: 0.6pt solid #c9ccd6; padding: 5pt 7pt; text-align: left; vertical-align: top; } th { background: #f1f2f6; }
code { font-family: Menlo, monospace; font-size: 10pt; background: #f1f2f6; padding: 0 3pt; border-radius: 3pt; }
hr { border: none; border-top: 0.6pt solid #c9ccd6; margin: 14pt 0; }
.meta { color: #5b6070; font-size: 9.5pt; margin: 0 0 16pt; }
</style></head><body>
${hasH1 ? '' : `<h1>${esc(title)}</h1>`}
<p class="meta">${esc(date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
${body}
</body></html>`;
}

/** Safe file name from a title: letters, numbers, spaces, dashes; max 60 chars. */
export const fileNameFor = (title: string, ext: string) =>
  (title.replace(/[^\p{L}\p{N} \-_]/gu, '').trim().replace(/\s+/g, ' ').slice(0, 60) || 'Alice document') + '.' + ext;
