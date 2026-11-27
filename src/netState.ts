/** Is Alice's server reachable? Checked every 45 s while the app runs and right after any network failure. */
let offline = false;
let checking = false;
let url = '';
const listeners = new Set<(off: boolean) => void>();
export const offlineNow = () => offline;
export const onOffline = (fn: (off: boolean) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function setHealthUrl(u: string) { url = u; }
export async function checkNet(): Promise<boolean> {
  if (!url || checking) return !offline;
  checking = true;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
    set(!r.ok);
  } catch { set(true); } finally { checking = false; }
  return !offline;
}
function set(off: boolean) { if (off !== offline) { offline = off; listeners.forEach((l) => l(off)); } }
setInterval(checkNet, 45000);
