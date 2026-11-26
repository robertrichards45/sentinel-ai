/**
 * Places: turn "home", "work", "here", a saved spot or an address into coordinates, and estimate drive time.
 * Drive time comes from the free OSRM route service: an estimate WITHOUT live traffic.
 */
import * as Location from 'expo-location';
import { readJson } from './storage';

export type Place = { title: string; lat: number; lon: number };

export async function resolvePlace(name: string): Promise<Place | null> {
  const p = await Location.requestForegroundPermissionsAsync();
  if (p.status !== 'granted') throw new Error('I need location permission for that.');
  const key = name.trim().toLowerCase().replace(/^(my|the)\s+/, '');
  if (['here', 'this place', 'current location', 'where i am'].includes(key)) {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { title: 'here', lat: pos.coords.latitude, lon: pos.coords.longitude };
  }
  const spots = await readJson<Record<string, any>>('spots.json', {});
  if (spots[key]) return { title: key, lat: spots[key].lat, lon: spots[key].lon };
  const [g] = await Location.geocodeAsync(name).catch(() => [] as Location.LocationGeocodedLocation[]);
  return g ? { title: name, lat: g.latitude, lon: g.longitude } : null;
}

/** Estimated driving minutes from where you are now (no live traffic), or null if unknown. */
export async function driveMinutes(to: Place): Promise<number | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const url = `https://router.project-osrm.org/route/v1/driving/${pos.coords.longitude},${pos.coords.latitude};${to.lon},${to.lat}?overview=false`;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
    const j: any = await r.json();
    const s = j?.routes?.[0]?.duration;
    return typeof s === 'number' ? Math.round(s / 60) : null;
  } catch { return null; }
}
