/** Turns an Open-Meteo forecast into one or two spoken sentences. Pure TS, unit-tested. */
const CODES: [number[], string][] = [
  [[0], 'clear'], [[1], 'mostly clear'], [[2], 'partly cloudy'], [[3], 'overcast'], [[45, 48], 'foggy'],
  [[51, 53, 55, 56, 57], 'drizzly'], [[61, 63, 66], 'rainy'], [[65, 67], 'pouring'], [[71, 73, 77], 'snowy'], [[75], 'heavy snow'],
  [[80, 81], 'showery'], [[82], 'heavy showers'], [[85, 86], 'snow showers'], [[95], 'thunderstorms'], [[96, 99], 'thunderstorms with hail'],
];
export const sky = (code: number) => CODES.find(([c]) => c.includes(code))?.[1] ?? 'changeable';

export function describeWeather(w: any, place: string, units: 'fahrenheit' | 'celsius'): string {
  const c = w?.current, d = w?.daily;
  if (!c || !d) return "I couldn't get the weather right now.";
  const u = units === 'fahrenheit' ? '°F' : '°C', ws = units === 'fahrenheit' ? 'mph' : 'km/h';
  const r = (x: number) => Math.round(x);
  let s = `In ${place} it's ${r(c.temperature_2m)}${u} and ${sky(c.weather_code)}`;
  if (Math.abs(c.apparent_temperature - c.temperature_2m) >= 3) s += `, feels like ${r(c.apparent_temperature)}`;
  if (c.wind_speed_10m >= 20) s += `, windy at ${r(c.wind_speed_10m)} ${ws}`;
  s += `. Today: ${sky(d.weather_code[0])}, high ${r(d.temperature_2m_max[0])}, low ${r(d.temperature_2m_min[0])}`;
  if (d.precipitation_probability_max?.[0] >= 30) s += `, ${d.precipitation_probability_max[0]}% chance of rain`;
  s += '.';
  if (d.time?.length > 1) s += ` Tomorrow: ${sky(d.weather_code[1])}, ${r(d.temperature_2m_min[1])} to ${r(d.temperature_2m_max[1])}${u}.`;
  return s;
}
