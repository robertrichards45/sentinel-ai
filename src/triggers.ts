/**
 * Ways to start Alice without touching the screen:
 *  - alice://talk link (Siri: "Hey Siri, Alice" shortcut, Action Button, Back Tap)
 *  - the glasses' button (EXPERIMENTAL until its Bluetooth command is captured)
 * A request made before the Talk screen is mounted is kept and delivered when it mounts.
 */
type Fn = () => void;
let listener: Fn | null = null;
let pending = false;

export function requestListen() {
  if (listener) listener(); else pending = true;
}
export function onListenRequest(fn: Fn) {
  listener = fn;
  if (pending) { pending = false; setTimeout(fn, 300); }
  return () => { if (listener === fn) listener = null; };
}
export const isTalkLink = (url?: string | null) => !!url && /^alice:\/\/(talk|listen)/i.test(url);
/** alice://read?url=… / alice://read?text=… (a share-sheet Shortcut) and alice://recap. */
export function parseAliceLink(url?: string | null): { kind: 'read'; url?: string; text?: string } | { kind: 'recap' } | null {
  if (!url) return null;
  const m = url.match(/^alice:\/\/(read|recap)\b\??(.*)$/i);
  if (!m) return null;
  if (m[1].toLowerCase() === 'recap') return { kind: 'recap' };
  const q = new URLSearchParams(m[2]);
  let u = q.get('url') ?? undefined, t = q.get('text') ?? undefined;
  if (u && !/^https?:\/\//i.test(u)) { t = t ?? u; u = undefined; } // shared text arrives in url=
  return { kind: 'read', ...(u ? { url: u } : {}), ...(t ? { text: t } : {}) };
}

/** "Hey Alice" heard: the app opens the Talk screen and starts listening. */
let wakeHandler: Fn | null = null;
export const onWake = (fn: Fn) => { wakeHandler = fn; return () => { if (wakeHandler === fn) wakeHandler = null; }; };
export const wake = () => { if (wakeHandler) wakeHandler(); else requestListen(); };

/** Open / close the live camera view ("Show Alice"), e.g. when you ask "what am I looking at?". */
type LookFn = (on: boolean) => void;
let lookHandler: LookFn | null = null;
let pendingLook: boolean | null = null;
export const onLook = (fn: LookFn) => {
  lookHandler = fn;
  if (pendingLook !== null) { const v = pendingLook; pendingLook = null; setTimeout(() => fn(v), 300); }
  return () => { if (lookHandler === fn) lookHandler = null; };
};
export const setLook = (on: boolean) => {
  if (lookHandler) lookHandler(on);
  else { pendingLook = on; if (on && wakeHandler) wakeHandler(); } // opens the Talk screen, which shows the camera
};
