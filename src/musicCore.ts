/** Understanding music requests (pure, unit-tested). */
export const KINDS = ['song', 'artist', 'album', 'playlist', 'any'] as const;
export type MusicKind = (typeof KINDS)[number];

/** "my workout playlist" -> playlist "workout"; "the album Thriller" -> album "Thriller". */
export function parseMusicRequest(q: string): { kind: MusicKind; term: string; shuffle: boolean } {
  let t = q.trim().replace(/^(play|put on)\s+/i, '');
  const shuffle = /\b(shuffle|shuffled|on shuffle|mix)\b/i.test(t);
  t = t.replace(/\b(on shuffle|shuffled|shuffle)\b/gi, '').replace(/\b(some|any|a few songs by|songs by|music by|my|the)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  let kind: MusicKind = 'any';
  let m = t.match(/^(.*?)\s+playlist$/i) || t.match(/^playlist\s+(.*)$/i);
  if (m) { kind = 'playlist'; t = m[1]; }
  else if ((m = t.match(/^album\s+(.*)$/i) || t.match(/^(.*?)\s+album$/i))) { kind = 'album'; t = m[1]; }
  else if ((m = t.match(/^song\s+(.*)$/i) || t.match(/^(.*?)\s+song$/i))) { kind = 'song'; t = m[1]; }
  else if ((m = t.match(/^artist\s+(.*)$/i))) { kind = 'artist'; t = m[1]; }
  return { kind, term: t.trim(), shuffle: shuffle || kind === 'artist' };
}

