/**
 * Workout coach: "Alice, coach my bench press." Turns on the camera (prop the phone up, side view), sends
 * Alice about 3 pictures a second instead of 1, and asks her to count reps and give short form cues
 * (bar path, elbows, arch, depth, wrists). Sets you finish are logged ("log 8 reps at 185"), and
 * "how did I do last week?" reads the history. It's coaching, not a spotter: use one on heavy lifts.
 */
import { readJson, writeJson } from './storage';
import { setLook } from './triggers';
import { live } from './live';
import { memory } from './memory';
import { note } from './diary';

export type SetLog = { t: number; exercise: string; reps: number; weight?: number };
let coaching: { exercise: string; since: number } | null = null;
export const coachingNow = () => coaching;
/** Camera interval: faster while coaching so movement is visible. */
export const coachFrameMs = () => (coaching ? 350 : 1000);

export async function coach(on: boolean, exercise = 'your lift'): Promise<string> {
  if (!on) {
    const was = coaching; coaching = null; setLook(false);
    if (!was) return 'Coach mode is already off.';
    const sets = (await readJson<SetLog[]>('workouts.json', [])).filter((x) => x.t >= was.since);
    note('coach-off', { sets: sets.length });
    if (sets.length) await memory.note(`Workout ${new Date().toLocaleDateString()}: ${sets.map((x) => `${x.exercise} ${x.reps}${x.weight ? ' x ' + x.weight : ''}`).join(', ')}`);
    return `Coach mode off.${sets.length ? ` You did ${sets.length} set${sets.length > 1 ? 's' : ''}; I saved them.` : ''}`;
  }
  coaching = { exercise, since: Date.now() };
  setLook(true);
  note('coach-on', { exercise });
  setTimeout(() => live.sendText(`(Coach mode for ${exercise}. Watch the camera frames. During a set, count reps out loud in one or two words and give a short cue only when form breaks — for bench: bar path over mid-chest, elbows about 45 degrees, feet planted, butt on the bench, wrists stacked, full controlled range. After each set, say the reps and one thing to fix, then call log_set. Remind me to use a spotter on heavy sets.)`), 2500);
  return `Coach mode on for ${exercise}. Prop your phone up so it sees you from the side, about 6 to 8 feet away. I'll count and call out form. Use a spotter on heavy sets.`;
}

export async function logSet(exercise: string, reps: number, weight?: number): Promise<string> {
  const all = await readJson<SetLog[]>('workouts.json', []);
  all.push({ t: Date.now(), exercise, reps, ...(weight ? { weight } : {}) });
  await writeJson('workouts.json', all.slice(-3000));
  const same = all.filter((x) => x.exercise.toLowerCase() === exercise.toLowerCase());
  const prev = same.length > 1 ? same[same.length - 2] : null;
  const best = same.reduce((m, x) => Math.max(m, x.weight ?? 0), 0);
  return `Logged ${exercise}: ${reps} reps${weight ? ` at ${weight}` : ''}.${weight && weight >= best && same.length > 1 ? ' That ties or beats your best weight.' : prev ? ` Last time: ${prev.reps}${prev.weight ? ' at ' + prev.weight : ''}.` : ''}`;
}

export async function workoutHistory(days = 7): Promise<string> {
  const since = Date.now() - days * 86400000;
  const sets = (await readJson<SetLog[]>('workouts.json', [])).filter((x) => x.t >= since);
  if (!sets.length) return `No workouts logged in the last ${days} days.`;
  const byEx = new Map<string, SetLog[]>();
  for (const x of sets) byEx.set(x.exercise, [...(byEx.get(x.exercise) ?? []), x]);
  return `Last ${days} days: ` + [...byEx].map(([ex, l]) => `${ex}, ${l.length} sets, best ${Math.max(...l.map((x) => x.weight ?? 0)) || Math.max(...l.map((x) => x.reps)) + ' reps'}`).join('; ') + '.';
}
