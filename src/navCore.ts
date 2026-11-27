/** Pure turn-by-turn logic (unit-tested on the PC). GPS, routing and speech live in navigation.ts. */
export type LatLon = { lat: number; lon: number };
export type NavStep = { at: LatLon; type: string; modifier?: string; road: string; exit?: number; distM: number };
export type NavMode = 'driving' | 'walking';
export type NavState = {
  steps: NavStep[];
  i: number;            // next maneuver to announce
  warned: boolean;      // "in 500 feet…" already said for step i
  best: number;         // closest we've been to step i (m), for off-route detection
  mode: NavMode;
  done: boolean;
};

export function metersBetween(a: LatLon, b: LatLon): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** US-style spoken distance: feet under ~0.1 mile, then miles. */
export function sayDistance(m: number): string {
  const ft = m * 3.28084;
  if (ft < 500) return `${Math.max(50, Math.round(ft / 50) * 50)} feet`;
  const mi = m / 1609.34;
  if (mi < 0.2) return `${Math.round(ft / 100) * 100} feet`;
  if (mi < 1) return `${mi < 0.375 ? 'a quarter' : mi < 0.625 ? 'half a' : 'three quarters of a'} mile`;
  const r = Math.round(mi * 10) / 10;
  return `${r} mile${r === 1 ? '' : 's'}`;
}

const onto = (road: string) => (road ? ` onto ${road}` : '');
const turnWord = (mod?: string) => ({
  left: 'turn left', right: 'turn right', 'slight left': 'bear left', 'slight right': 'bear right',
  'sharp left': 'make a sharp left', 'sharp right': 'make a sharp right', straight: 'continue straight', uturn: 'make a U-turn',
} as Record<string, string>)[mod ?? ''] ?? 'continue';

/** What to say for a maneuver (without the distance). */
export function stepText(s: NavStep): string {
  switch (s.type) {
    case 'depart': return `Head out${s.road ? ' on ' + s.road : ''}`;
    case 'arrive': return `You've arrived${s.modifier === 'left' ? '. It\'s on your left' : s.modifier === 'right' ? '. It\'s on your right' : ''}`;
    case 'roundabout': case 'rotary': return `At the roundabout, take the ${ordinal(s.exit ?? 1)} exit${onto(s.road)}`;
    case 'merge': return `Merge${s.modifier?.includes('left') ? ' left' : s.modifier?.includes('right') ? ' right' : ''}${onto(s.road)}`;
    case 'on ramp': return `Take the ramp${s.modifier?.includes('left') ? ' on the left' : s.modifier?.includes('right') ? ' on the right' : ''}${onto(s.road)}`;
    case 'off ramp': return `Take the exit${s.modifier?.includes('left') ? ' on the left' : s.modifier?.includes('right') ? ' on the right' : ''}${onto(s.road)}`;
    case 'fork': return `At the fork, keep ${s.modifier?.includes('left') ? 'left' : 'right'}${onto(s.road)}`;
    case 'end of road': return `At the end of the road, ${turnWord(s.modifier)}${onto(s.road)}`;
    default: return `${cap(turnWord(s.modifier))}${onto(s.road)}`;
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ordinal = (n: number) => ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][n - 1] ?? `${n}th`;

/** OSRM route JSON -> steps. Skips "new name"/"continue straight" steps that need no instruction. */
export function stepsFromOsrm(j: any): NavStep[] {
  const legs = j?.routes?.[0]?.legs ?? [];
  const out: NavStep[] = [];
  for (const leg of legs) for (const st of leg.steps ?? []) {
    const m = st.maneuver ?? {};
    if (!Array.isArray(m.location)) continue;
    if ((m.type === 'new name' || m.type === 'continue' || m.type === 'notification') && (m.modifier ?? 'straight') === 'straight') continue;
    const step: NavStep = { at: { lon: m.location[0], lat: m.location[1] }, type: String(m.type), modifier: m.modifier, road: String(st.name || st.ref || ''), exit: m.exit, distM: Number(st.distance) || 0 };
    // Two maneuvers a few steps apart (a jog across a sidewalk): only the second one is worth saying.
    const prev = out[out.length - 1];
    if (prev && prev.type !== 'depart' && step.type !== 'arrive' && metersBetween(prev.at, step.at) < 15) { out[out.length - 1] = { ...step, distM: step.distM }; continue; }
    out.push(step);
  }
  return out;
}

export const newNav = (steps: NavStep[], mode: NavMode): NavState => ({ steps, i: steps[0]?.type === 'depart' ? 1 : 0, warned: false, best: Infinity, mode, done: !steps.length });

/** Distances that trigger the heads-up and the "now" instruction. */
const WARN_M = { driving: 500, walking: 120 };
const NOW_M = { driving: 60, walking: 20 };
const OFF_ROUTE_M = { driving: 250, walking: 80 };

/** Feed a GPS fix. Returns the new state, anything to say, and whether to ask for a new route. */
export function navUpdate(s: NavState, here: LatLon): { state: NavState; say?: string; reroute?: boolean } {
  if (s.done) return { state: s };
  const step = s.steps[s.i];
  if (!step) return { state: { ...s, done: true } };
  const d = metersBetween(here, step.at);
  if (d <= NOW_M[s.mode]) {
    const next = s.steps[s.i + 1];
    const say = step.type === 'arrive' ? stepText(step) : next ? `${stepText(step)}. Then in ${sayDistance(metersBetween(step.at, next.at))}, ${lower(stepText(next))}` : stepText(step);
    return { state: { ...s, i: s.i + 1, warned: false, best: Infinity, done: step.type === 'arrive' || !next }, say };
  }
  const best = Math.min(s.best, d);
  if (best < Infinity && d > best + OFF_ROUTE_M[s.mode]) return { state: { ...s, best }, reroute: true };
  if (!s.warned && d <= WARN_M[s.mode] && d > NOW_M[s.mode] * 2) return { state: { ...s, best, warned: true }, say: `In ${sayDistance(d)}, ${lower(stepText(step))}` };
  return { state: { ...s, best } };
}
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** First thing Alice says when directions start. */
export function overview(steps: NavStep[], to: string, totalM: number, mins: number): string {
  const first = steps[0]?.type === 'depart' ? steps[1] : steps[0];
  const lead = steps[0]?.type === 'depart' ? `${stepText(steps[0])}. ` : '';
  const then = first && first.type !== 'arrive' ? `${steps[0]?.type === 'depart' ? `In ${sayDistance(steps[0].distM)}, ` : ''}${lower(stepText(first))}.` : '';
  const m = Math.max(1, Math.round(mins));
  return `Starting directions to ${to}. ${cap(sayDistance(totalM))}, about ${m} minute${m === 1 ? '' : 's'}. ${lead}${then}`.trim();
}
