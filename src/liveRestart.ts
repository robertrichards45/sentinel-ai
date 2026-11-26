/** Restart a running live conversation (after its reply) so a new mode/voice takes effect. */
type Fn = () => Promise<void>;
let restarter: Fn | null = null;
export const setLiveRestarter = (fn: Fn) => { restarter = fn; };
export const restartLiveSoon = () => { setTimeout(() => { restarter?.().catch(() => {}); }, 4000); };
