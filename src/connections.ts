/**
 * Connections to other services (each optional, set up in Settings, Connections):
 *  - Home Assistant: one connection controls nearly every smart-home brand (lights, plugs, locks, thermostats,
 *    garage doors, TVs, vacuums, many cars). Alice passes what you said to Home Assistant's own assistant
 *    ("turn off the kitchen lights") and reads back its answer.
 *  - IFTTT webhooks: "Alice, trigger start car" fires an IFTTT applet (works with hundreds of services).
 *  - Custom webhooks: any URL you name, e.g. a Make/Zapier scenario.
 * Keys and tokens are kept in the iPhone Keychain, never in files, logs or Alice's server.
 */
import * as SecureStore from 'expo-secure-store';
import { getSettings } from './settings';
import { note } from './diary';

const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
export const connSecret = {
  get: (k: 'ha-token' | 'ifttt-key') => SecureStore.getItemAsync(k, opts).catch(() => null),
  set: (k: 'ha-token' | 'ifttt-key', v: string) => (v ? SecureStore.setItemAsync(k, v.trim(), opts) : SecureStore.deleteItemAsync(k, opts)),
};

async function post(url: string, body: unknown, headers: Record<string, string> = {}, ms = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); }
  finally { clearTimeout(t); }
}

/** "Turn off the living room lights", "set the thermostat to 70", "lock the front door". */
export async function homeControl(command: string): Promise<string> {
  const base = (getSettings().homeAssistantUrl || '').trim().replace(/\/+$/, '');
  const token = await connSecret.get('ha-token');
  if (!base || !token) return 'Home Assistant isn\'t connected yet. Add its address and a long-lived access token in Settings, Connections. Or I can run a Siri Shortcut instead.';
  try {
    const r = await post(`${base}/api/conversation/process`, { text: command, language: 'en' }, { Authorization: `Bearer ${token}` });
    if (r.status === 401) return 'Home Assistant rejected the token. Make a new long-lived access token in your Home Assistant profile and paste it in Settings.';
    const j: any = await r.json().catch(() => ({}));
    const said = j?.response?.speech?.plain?.speech;
    note('home-control', { ok: r.ok, type: j?.response?.response_type });
    if (j?.response?.response_type === 'error') return `Home Assistant says: ${said || 'it couldn\'t do that'}.`;
    return said ? String(said) : r.ok ? 'Done.' : `Home Assistant answered with an error (${r.status}).`;
  } catch { return "I couldn't reach Home Assistant. If it's only on your home Wi-Fi, use its remote (Nabu Casa) address in Settings."; }
}

export async function iftttTrigger(event: string, value?: string): Promise<string> {
  const key = await connSecret.get('ifttt-key');
  if (!key) return 'IFTTT isn\'t connected yet. Add your Webhooks key in Settings, Connections.';
  const ev = event.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  try {
    const r = await post(`https://maker.ifttt.com/trigger/${encodeURIComponent(ev)}/with/key/${encodeURIComponent(key)}`, value ? { value1: value } : {});
    note('ifttt', { ok: r.ok });
    return r.ok ? `Triggered ${ev.replace(/_/g, ' ')}.` : `IFTTT didn't accept that (${r.status}).`;
  } catch { return "I couldn't reach IFTTT."; }
}

export async function runWebhook(name: string, value?: string): Promise<string> {
  const hooks = getSettings().webhooks ?? [];
  const n = name.toLowerCase();
  const h = hooks.find((x) => x.name.toLowerCase() === n) ?? hooks.find((x) => x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase()));
  if (!h) return hooks.length ? `I don't have a connection called ${name}. I have: ${hooks.map((x) => x.name).join(', ')}.` : 'No custom connections yet. Add one in Settings, Connections.';
  if (!/^https:\/\//i.test(h.url)) return 'That connection needs an https address.';
  try { const r = await post(h.url, { from: 'Alice', name: h.name, value: value ?? '' }); note('webhook', { ok: r.ok }); return r.ok ? `Done: ${h.name}.` : `${h.name} answered with an error (${r.status}).`; }
  catch { return `I couldn't reach ${h.name}.`; }
}
