/** Gmail helpers (pure, unit-tested): message text, outgoing MIME, spoken inbox list. */
import { Buffer } from 'buffer';
export type Msg = { id: string; threadId: string; from: string; subject: string; date: string; snippet: string; messageId: string; unread: boolean };

const dec = (d?: string) => (d ? Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : '');
const htmlToText = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

/** Plain text of a message: prefers text/plain, drops quoted replies and signatures-ish tails. */
export function gmailText(payload: any): string {
  const parts: any[] = [];
  const walk = (p: any) => { if (!p) return; parts.push(p); (p.parts ?? []).forEach(walk); };
  walk(payload);
  const plain = parts.find((p) => p.mimeType === 'text/plain' && p.body?.data);
  const html = parts.find((p) => p.mimeType === 'text/html' && p.body?.data);
  let t = plain ? dec(plain.body.data) : html ? htmlToText(dec(html.body.data)) : '';
  t = t.split(/\r?\n/).filter((l) => !l.startsWith('>')).join('\n');
  t = t.split(/\n(?:On .{5,120} wrote:|-{2,} ?Original Message|From: .+\nSent: )/)[0];
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

const enc = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
export function buildRaw(m: { to: string; subject: string; body: string; inReplyTo?: string }): string {
  return [
    `To: ${m.to}`,
    `Subject: ${enc(m.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
    '',
    m.body,
  ].join('\r\n');
}

const who = (from: string) => from.replace(/<.*>/, '').replace(/"/g, '').trim() || from;
export function describeList(list: Msg[], unreadOnly: boolean): string {
  if (!list.length) return unreadOnly ? 'No new emails in the last few days.' : 'No emails match that.';
  const head = unreadOnly ? `You have ${list.length} new email${list.length > 1 ? 's' : ''}` : `I found ${list.length}`;
  return `${head}: ${list.map((m, i) => `${i + 1}, from ${who(m.from)}: ${m.subject || '(no subject)'}`).join('; ')}. Want me to read one?`;
}
