/**
 * "Stop listening" means STOP: after you end a conversation (tap the orb, or tell Alice to stop listening),
 * nothing restarts on its own - no follow-up listening through the glasses, no automatic reconnect of the
 * live conversation. Only something YOU do wakes her again: the glasses button, "Hey Alice", or the orb.
 */
type Fn = () => void;
let asleep = false;
const onSleep = new Set<Fn>();
export const isAsleep = () => asleep;
export const wakeUp = () => { asleep = false; };
export const whenSleeping = (fn: Fn) => { onSleep.add(fn); return () => { onSleep.delete(fn); }; };
export function goToSleep() {
  asleep = true;
  onSleep.forEach((f) => { try { f(); } catch {} });
}
