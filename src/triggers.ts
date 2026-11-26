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

/** "Hey Alice" heard: the app opens the Talk screen and starts listening. */
let wakeHandler: Fn | null = null;
export const onWake = (fn: Fn) => { wakeHandler = fn; return () => { if (wakeHandler === fn) wakeHandler = null; }; };
export const wake = () => { if (wakeHandler) wakeHandler(); else requestListen(); };
