/**
 * "Stop listening" means STOP: after you end a conversation (tap the orb, or tell Alice to stop listening),
 * nothing restarts on its own - no follow-up listening through the glasses, no automatic reconnect of the
 * live conversation. Only something YOU do wakes her again: the glasses button, "Hey Alice", or the orb.
 */
type Fn = () => void;
let asleep = false;
let deep = false; // "stop listening": Hey Alice is paused too, until you wake her yourself
const onSleep = new Set<Fn>();
const onWakeUp = new Set<Fn>();
export const isAsleep = () => asleep;
export const isDeepAsleep = () => deep;
export const wakeUp = () => { const was = deep; asleep = false; deep = false; if (was) onWakeUp.forEach((f) => { try { f(); } catch {} }); };
export const whenSleeping = (fn: Fn) => { onSleep.add(fn); return () => { onSleep.delete(fn); }; };
export const whenWoken = (fn: Fn) => { onWakeUp.add(fn); return () => { onWakeUp.delete(fn); }; };
/**
 * deep = true for "stop listening" / "go to sleep" / "be quiet": the microphone goes fully off, including
 * "Hey Alice", until you tap the orb or press the glasses button. "That's all" / "bye Alice" just ends the
 * conversation and leaves "Hey Alice" on.
 */
export function goToSleep(isDeep = false) {
  asleep = true;
  if (isDeep) deep = true;
  onSleep.forEach((f) => { try { f(); } catch {} });
}
