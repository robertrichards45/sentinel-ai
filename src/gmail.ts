/**
 * Gmail by voice: "any new emails?", "read the second one", "reply: sounds good, see you at 3",
 * "email Kylee about Saturday", "archive that". Runs entirely on the phone: Alice signs in to Google with
 * your permission (Settings, Connections, Connect Gmail), keeps the sign-in in the iPhone Keychain and talks
 * to Gmail directly — your email never passes through Alice's server. Sending always happens only after you
 * confirm what she'll send.
 */
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Contact, ContactField, requestPermissionsAsync as contactsPermission } from 'expo-contacts';
import { Buffer } from 'buffer';
import { note } from './diary';
import { gmailText, buildRaw, Msg, describeList } from './gmailCore';

const CLIENT_ID: string = (Constants.expoConfig?.extra as any)?.googleIosClientId ?? '';
const SCHEME = CLIENT_ID ? `com.googleusercontent.apps.${CLIENT_ID.replace('.apps.googleusercontent.com', '')}` : '';
const REDIRECT = `${SCHEME}:/oauth2redirect`;
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify', 'openid', 'email'];
const KC = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

let access: { token: string; exp: number } | null = null;
let lastList: Msg[] = [];
let lastOpened: Msg | null = null;

const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const gmailConfigured = () => !!CLIENT_ID && Platform.OS === 'ios';
export async function gmailConnected() { return !!(await SecureStore.getItemAsync('gmail-refresh', KC).catch(() => null)); }

/** Opens Google's sign-in page; you pick the account and allow Alice. */
export async function connectGmail(): Promise<string> {
  if (!CLIENT_ID) return 'Gmail is not set up in this build yet.';
  if (Platform.OS !== 'ios') return 'Gmail works on the iPhone version for now. The Android version needs its own Google key, which is coming.';
  const verifier = b64url(Crypto.getRandomBytes(32));
  const challenge = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const state = b64url(Crypto.getRandomBytes(12));
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${encodeURIComponent(SCOPES.join(' '))}&code_challenge=${challenge}&code_challenge_method=S256&state=${state}&access_type=offline&prompt=consent`;
  const r = await WebBrowser.openAuthSessionAsync(url, REDIRECT);
  if (r.type !== 'success' || !r.url) return 'Gmail sign-in was cancelled.';
  const q = new URL(r.url.replace(':/oauth2redirect', '://oauth2redirect')).searchParams;
  if (q.get('state') !== state || !q.get('code')) return 'Gmail sign-in did not finish. Try again.';
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${encodeURIComponent(CLIENT_ID)}&code=${encodeURIComponent(q.get('code')!)}&code_verifier=${verifier}&redirect_uri=${encodeURIComponent(REDIRECT)}&grant_type=authorization_code`,
  }).then((x) => x.json());
  if (!tok.refresh_token) { note('gmail-error', { step: 'token', err: tok.error ?? 'no refresh' }); return 'Google didn\'t give access. Try Connect Gmail again.'; }
  await SecureStore.setItemAsync('gmail-refresh', tok.refresh_token, KC);
  access = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  note('gmail-connected', {});
  return 'Gmail connected. Ask me "any new emails?"';
}

export async function disconnectGmail() { await SecureStore.deleteItemAsync('gmail-refresh', KC).catch(() => {}); access = null; lastList = []; }

async function token(): Promise<string> {
  if (access && Date.now() < access.exp) return access.token;
  const refresh = await SecureStore.getItemAsync('gmail-refresh', KC).catch(() => null);
  if (!refresh) throw new Error('Gmail isn\'t connected. Tap Connect Gmail in Settings, under Connections.');
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${encodeURIComponent(CLIENT_ID)}&refresh_token=${encodeURIComponent(refresh)}&grant_type=refresh_token`,
  }).then((x) => x.json());
  if (!tok.access_token) { if (tok.error === 'invalid_grant') await disconnectGmail(); throw new Error('Gmail sign-in expired. Tap Connect Gmail in Settings again.'); }
  access = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  return access.token;
}

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`${API}${path}`, { ...init, signal: ctl.signal, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    if (!r.ok) { note('gmail-error', { path: path.split('?')[0], status: r.status }); throw new Error(`Gmail answered ${r.status}.`); }
    return r.status === 204 ? {} : r.json();
  } finally { clearTimeout(t); }
}

const header = (m: any, n: string) => (m.payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
const toMsg = (m: any): Msg => ({ id: m.id, threadId: m.threadId, from: header(m, 'From'), subject: header(m, 'Subject'), date: header(m, 'Date'), snippet: m.snippet ?? '', messageId: header(m, 'Message-ID'), unread: (m.labelIds ?? []).includes('UNREAD') });

/** "Any new emails?" / "emails from Kylee" / "emails about the lease". */
export async function checkEmail(query?: string, count = 5): Promise<string> {
  const q = query?.trim() ? query.trim() : 'is:unread in:inbox newer_than:3d';
  const list = await api(`/messages?maxResults=${Math.min(10, Math.max(1, count))}&q=${encodeURIComponent(q)}`);
  const ids: string[] = (list.messages ?? []).map((x: any) => x.id);
  lastList = await Promise.all(ids.map((id) => api(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`).then(toMsg)));
  note('gmail-check', { n: lastList.length, query: !!query });
  return describeList(lastList, !query);
}

function pick(which?: string | number): Msg | null {
  if (which === undefined || which === '' || which === 'that' || which === 'it' || which === 'last') return lastOpened ?? lastList[0] ?? null;
  const n = typeof which === 'number' ? which : Number(String(which).match(/\d+/)?.[0] ?? NaN) || ({ first: 1, second: 2, third: 3, fourth: 4, fifth: 5 } as Record<string, number>)[String(which).toLowerCase().replace(/\s*one$/, '')];
  if (n && lastList[n - 1]) return lastList[n - 1];
  const w = String(which).toLowerCase();
  return lastList.find((m) => m.from.toLowerCase().includes(w) || m.subject.toLowerCase().includes(w)) ?? null;
}

export async function readEmail(which?: string | number): Promise<string> {
  if (!lastList.length && !lastOpened) await checkEmail();
  const m = pick(which);
  if (!m) return 'Which email? Say "any new emails?" first, then "read the first one".';
  const full = await api(`/messages/${m.id}?format=full`);
  lastOpened = { ...m, ...toMsg(full) };
  if ((full.labelIds ?? []).includes('UNREAD')) api(`/messages/${m.id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) }).catch(() => {});
  return `From ${lastOpened.from.replace(/<.*>/, '').trim()}, "${lastOpened.subject}": ${gmailText(full.payload).slice(0, 2500) || lastOpened.snippet}`;
}

async function emailFor(who: string): Promise<string | null> {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.trim())) return who.trim();
  const p = await contactsPermission().catch(() => null);
  if (!p?.granted) return null;
  const fields = [ContactField.FULL_NAME, ContactField.NICKNAME, ContactField.EMAILS] as const;
  const list: any[] = await Contact.getAllDetails(fields as any, { name: who }).catch(() => []);
  const c = list.find((x) => (x.emails ?? []).length);
  return c ? String(c.emails[0].address ?? c.emails[0].email ?? '') || null : null;
}

/** Only call after the user confirmed the exact message. */
export async function sendEmail(to: string, subject: string, body: string): Promise<string> {
  const addr = await emailFor(to);
  if (!addr) return `I couldn't find an email address for ${to}. Say the address, or add it to their contact.`;
  const raw = buildRaw({ to: addr, subject, body });
  await api('/messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(Buffer.from(raw, 'utf8')) }) });
  note('gmail-send', {});
  return `Sent to ${to}.`;
}

export async function replyEmail(body: string, which?: string | number): Promise<string> {
  const m = which !== undefined ? pick(which) : lastOpened ?? lastList[0] ?? null;
  if (!m) return 'Which email should I reply to?';
  const to = m.from;
  const raw = buildRaw({ to, subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`, body, inReplyTo: m.messageId });
  await api('/messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(Buffer.from(raw, 'utf8')), threadId: m.threadId }) });
  note('gmail-reply', {});
  return `Replied to ${to.replace(/<.*>/, '').trim()}.`;
}

export async function archiveEmail(which?: string | number): Promise<string> {
  const m = pick(which);
  if (!m) return 'Which email should I archive?';
  await api(`/messages/${m.id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['INBOX', 'UNREAD'] }) });
  lastList = lastList.filter((x) => x.id !== m.id);
  return `Archived "${m.subject}".`;
}
