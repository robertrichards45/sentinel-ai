/**
 * Apple Music control: "play my workout playlist", "play some Drake", "skip", "pause", "what's playing?".
 * Uses the iPhone's own Music player (your library and anything you've added from Apple Music), so it works
 * for every user with no keys. Songs that aren't in your library open in the Music app's search instead.
 */
import { Linking } from 'react-native';
import { AliceMusic } from '../modules/alice-music';
import { note } from './diary';
import { parseMusicRequest } from './musicCore';
export { parseMusicRequest };

export async function playAppleMusic(query: string): Promise<string | null> {
  if (!AliceMusic) return null; // older build without the music part
  const ok = await AliceMusic.authorize().catch(() => false);
  if (!ok) return 'I need access to your music. In the iPhone Settings app, open Alice and turn on Media & Apple Music.';
  const r = parseMusicRequest(query);
  if (!r.term) return 'What should I play?';
  const res = await AliceMusic.play(r.kind, r.term, r.shuffle).catch(() => ({ found: false } as any));
  note('music-play', { found: res.found, kind: res.kind });
  if (res.found) return `Playing ${res.kind === 'playlist' ? `your ${r.term} playlist` : res.kind === 'artist' ? `${res.artist || r.term}${r.shuffle ? ', shuffled' : ''}` : res.kind === 'album' ? `the album ${r.term}` : `${res.title}${res.artist ? ' by ' + res.artist : ''}`}.`;
  await Linking.openURL(`music://music.apple.com/us/search?term=${encodeURIComponent(r.term)}`).catch(() => {});
  return `${r.term} isn't in your library, so I opened it in Apple Music. Tap play, or add it to your library and next time I'll play it straight away.`;
}

export async function musicControl(command: string): Promise<string> {
  if (!AliceMusic) return "This version can't control music yet.";
  if (command === 'now_playing') {
    const n = await AliceMusic.nowPlaying().catch(() => null);
    if (!n || !n.title) return 'Nothing is playing in Apple Music right now.';
    return `${n.state === 'playing' ? "That's" : 'Paused on'} ${n.title}${n.artist ? ' by ' + n.artist : ''}${n.album ? `, from ${n.album}` : ''}.`;
  }
  const ok = await AliceMusic.control(command).catch(() => false);
  return ok ? ({ pause: 'Paused.', resume: 'Playing.', next: 'Skipped.', previous: 'Going back.', restart: 'From the top.', shuffle_on: 'Shuffle on.', shuffle_off: 'Shuffle off.', repeat_on: 'Repeat on.', repeat_off: 'Repeat off.', stop: 'Stopped.' } as Record<string, string>)[command] ?? 'Done.' : "I couldn't do that.";
}
