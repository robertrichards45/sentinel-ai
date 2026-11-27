// Fetch a public web page and pull out its readable text, for "read me this article".
// Refuses private / local addresses (so the server can't be used to reach Railway internals), caps size and time.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function privateAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:') && privateAddress(v.slice(7));
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
export function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  let h = html.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe)[\s\S]*?<\/\1>/gi, ' ');
  const main = h.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? h.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? h;
  const text = main
    .replace(/<\/(p|div|h[1-6]|li|br|tr|section|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 30 || /[.!?]$/.test(l)).join('\n');
  const dec = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m));
  return { title: dec(title).replace(/\s+/g, ' ').slice(0, 200), text: text.slice(0, 60000) };
}

export async function readPage(raw, { maxBytes = 3_000_000, timeoutMs = 12000, resolve = lookup } = {}) {
  let u;
  try { u = new URL(raw); } catch { throw Object.assign(new Error('That is not a web address.'), { status: 400 }); }
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('Only web pages can be read.'), { status: 400 });
    const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await resolve(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length) throw Object.assign(new Error('That site could not be found.'), { status: 400 });
    if (addrs.some((a) => privateAddress(a.address))) throw Object.assign(new Error('That address is not allowed.'), { status: 400 });
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    let r;
    try { r = await fetch(u, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Alice reader)', Accept: 'text/html,text/plain' } }); }
    catch { clearTimeout(t); throw Object.assign(new Error('The page did not load.'), { status: 502 }); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { clearTimeout(t); u = new URL(r.headers.get('location'), u); continue; }
    if (!r.ok) { clearTimeout(t); throw Object.assign(new Error(`The page returned ${r.status}.`), { status: 502 }); }
    const type = r.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|xml/.test(type)) { clearTimeout(t); throw Object.assign(new Error('That link is not a web page.'), { status: 415 }); }
    const chunks = []; let size = 0;
    for await (const c of r.body) { size += c.length; if (size > maxBytes) break; chunks.push(c); }
    clearTimeout(t);
    const body = Buffer.concat(chunks).toString('utf8');
    return /text\/plain/.test(type) ? { title: u.hostname, text: body.slice(0, 60000) } : htmlToText(body);
  }
  throw Object.assign(new Error('Too many redirects.'), { status: 502 });
}
