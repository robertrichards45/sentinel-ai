/**
 * Spoken turn-by-turn directions through the glasses: "Alice, walking directions to Starbucks."
 * Route: the free OpenStreetMap routing servers (routing.openstreetmap.de). No live traffic, and fair-use
 * only (fine for one person; a paid routing service would be needed before selling the app).
 * Keeps working with the phone locked in your pocket when you allow location "Always"; otherwise only
 * while Alice is on screen. Stop with "stop directions" or the banner.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { resolvePlace, Place } from './places';
import { newNav, navUpdate, overview, stepsFromOsrm, NavMode, NavState, LatLon } from './navCore';
import { speak, enablePlaybackSession } from './voice';
import { note } from './diary';

const TASK = 'alice-directions';
let nav: NavState | null = null;
let dest: Place | null = null;
let fg: Location.LocationSubscription | null = null;
let lastReroute = 0;
let busy = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
export const onDirections = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const directionsTo = () => (nav && !nav.done ? dest?.title ?? null : null);

async function route(from: LatLon, to: Place, mode: NavMode) {
  const base = mode === 'walking' ? 'routed-foot' : 'routed-car';
  const url = `https://routing.openstreetmap.de/${base}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?steps=true&overview=false`;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
  const r = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
  const j: any = await r.json();
  if (j?.code !== 'Ok' || !j.routes?.length) throw new Error('No route found.');
  return { steps: stepsFromOsrm(j), meters: j.routes[0].distance as number, mins: (j.routes[0].duration as number) / 60 };
}

async function onFix(here: LatLon) {
  if (!nav || busy) return;
  const r = navUpdate(nav, here);
  nav = r.state;
  if (r.say) { enablePlaybackSession().then(() => speak(r.say!)).catch(() => {}); note('nav-say', { text: r.say }); }
  if (r.reroute && dest && Date.now() - lastReroute > 30000) {
    lastReroute = Date.now(); busy = true;
    try {
      const rt = await route(here, dest, nav.mode);
      nav = newNav(rt.steps, nav.mode);
      speak('Rerouting. ' + overview(rt.steps, dest.title, rt.meters, rt.mins).replace(/^Starting directions to [^.]*\. /, '')).catch(() => {});
      note('nav-reroute', {});
    } catch {} finally { busy = false; }
  }
  if (nav?.done) await stopDirections(true);
  changed();
}

TaskManager.defineTask(TASK, async ({ data, error }: any) => {
  if (error) return;
  const loc = data?.locations?.[data.locations.length - 1];
  if (loc) await onFix({ lat: loc.coords.latitude, lon: loc.coords.longitude });
});

export async function startDirections(to: string, mode: NavMode = 'driving'): Promise<string> {
  const place = await resolvePlace(to);
  if (!place) return `I couldn't find "${to}". Try the full address.`;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
  let rt;
  try { rt = await route(here, place, mode); } catch { return "I couldn't get a route there right now. Check your signal and try again."; }
  await stopDirections(true);
  nav = newNav(rt.steps, mode);
  dest = place;
  lastReroute = Date.now();
  const opts = {
    accuracy: Location.Accuracy.BestForNavigation, distanceInterval: mode === 'walking' ? 5 : 15,
    activityType: mode === 'walking' ? Location.ActivityType.Fitness : Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
  };
  let pocket = false;
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status === 'granted') { await Location.startLocationUpdatesAsync(TASK, opts); pocket = true; }
  } catch (e: any) { note('nav-error', { step: 'background', msg: String(e?.message ?? e) }); }
  if (!pocket) fg = await Location.watchPositionAsync(opts, (p) => onFix({ lat: p.coords.latitude, lon: p.coords.longitude }));
  note('nav-start', { mode, steps: rt.steps.length, km: Math.round(rt.meters / 100) / 10, pocket });
  changed();
  return overview(rt.steps, place.title, rt.meters, rt.mins) + (pocket ? '' : ' Keep me open on screen. To use directions with the phone in your pocket, allow location "Always" for Alice in Settings.');
}

export async function stopDirections(quiet = false): Promise<string> {
  const was = !!nav && !nav.done;
  fg?.remove(); fg = null;
  try { if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK); } catch {}
  if (!quiet) { nav = null; dest = null; }
  changed();
  return was ? 'Directions stopped.' : 'No directions running.';
}
