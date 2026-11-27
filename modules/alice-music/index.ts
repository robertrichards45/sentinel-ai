import { requireOptionalNativeModule } from 'expo';

type PlayResult = { found: boolean; kind?: string; count?: number; title?: string; artist?: string; reason?: string };
type Native = {
  authorize(): Promise<boolean>;
  play(kind: string, term: string, shuffle: boolean): Promise<PlayResult>;
  control(command: string): Promise<boolean>;
  nowPlaying(): Promise<{ state: string; title: string; artist: string; album: string }>;
};
/** null when the native part isn't in this build (e.g. Expo Go). */
export const AliceMusic = requireOptionalNativeModule<Native>('AliceMusic');
