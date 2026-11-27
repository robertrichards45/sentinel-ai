/**
 * Places: turn "home", "work", "here", a saved spot, an address or a business name ("Walmart") into
 * coordinates. Business names are searched near you (OpenStreetMap via Alice's server), nearest first, so
 * when there are several Alice can ask which one. Drive time comes from the free OSRM service: an estimate
 * WITHOUT live traffic.
 */
import * as Location from 'expo-location';
import { readJson } from './storage';
import { placesNear } from './ai';
import { metersBetween } from './navCore';

export type Place = { title: string; lat: number; lon: number; address?: string; miles?: number };

/** Where you are now: asks permission, a fresh fix within 10 s, else the last known one. */
export async function here(): Promise<{ lat: number; lon: number } | null> {
  const p = await Location.requestForegroundPermissionsAsync();
  if (p.status !== 'granted') throw new Error('I need location permission for that. Turn it on in Settings, Alice, Location.');
  const fresh = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 10000)),
  ]);
  const pos = fresh ?? await Location.getLastKnownPositionAsync().catch(() => null);
  return pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : null;
}

const key = (name: string) => name.trim().toLowerCase().replace(/^(my|the)\s+/, '');

/** Every place that fits the name, nearest first (one entry for home/work/saved spots/addresses). */
export async function placeOptions(name: string): Promise<Place[]> {
  const k = key(name);
  if (['here', 'this place', 'current location', 'where i am'].includes(k)) { const h = await here(); return h ? [{ title: 'here', ...h }] : []; }
  const spots = await readJson<Record<string, any>>('spots.json', {});
  if (spots[k]) return [{ title: k, lat: spots[k].lat, lon: spots[k].lon }];
  const me = await here();
  const withMiles = (p: Place) => (me ? { ...p, miles: Math.round(metersBetween(me, p) / 160.934) / 10 } : p);
  // Street address: the iPhone's geocoder is good at those.
  if (/\d/.test(name)) {
    const g = (await Location.geocodeAsync(name).catch(() => []))[0];
    if (g) return [withMiles({ title: name, lat: g.latitude, lon: g.longitude })];
  }
  // Business or place name: search near you.
  try {
    const found = await placesNear(name, me?.lat, me?.lon);
    if (found.length) return found.map((f) => withMiles({ title: f.name, address: f.address, lat: f.lat, lon: f.lon }));
  } catch {}
  const g = (await Location.geocodeAsync(name).catch(() => []))[0];
  return g ? [withMiles({ title: name, lat: g.latitude, lon: g.longitude })] : [];
}

/** The best single match (nearest). */
export async function resolvePlace(name: string): Promise<Place | null> {
  return (await placeOptions(name))[0] ?? null;
}

/** Spoken list for "which one?": "the one at 10 Walmart Drive, Moundsville, 2.3 miles away". */
export function describeOptions(opts: Place[]): string {
  return opts.slice(0, 3).map((o, i) => `${i + 1}, ${o.address ? 'the one at ' + o.address.split(',').slice(0, 2).join(',') : o.title}${o.miles !== undefined ? `, ${o.miles} miles away` : ''}`).join('; ');
}

/** Estimated driving minutes from where you are now (no live traffic), or null if unknown. */
export async function driveMinutes(to: Place): Promise<number | null> {
  try {
    const me = await here();
    if (!me) return null;
    const url = `https://router.project-osrm.org/route/v1/driving/${me.lon},${me.lat};${to.lon},${to.lat}?overview=false`;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
    const j: any = await r.json();
    const s = j?.routes?.[0]?.duration;
    return typeof s === 'number' ? Math.round(s / 60) : null;
  } catch { return null; }
}
