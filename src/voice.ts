import * as Speech from 'expo-speech';
import { AudioRecorder, AudioPlayer, createAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { speechAudio } from './ai';
import { getSettings } from './settings';

/**
 * Recording settings, tried in order. v0.1.0 build 2 used 16 kHz mono @ 64 kbps AAC,
 * which iOS refused on a real iPhone (AVAudioRecorder.prepareToRecord() == false),
 * so we start from Expo's stock presets, which are known-good, and fall back.
 */
export const VOICE_PRESET = RecordingPresets.HIGH_QUALITY;
export const VOICE_CANDIDATES = [
  { label: 'AAC 44.1 kHz mono 64 kbps', options: { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 } },
  { label: 'AAC 44.1 kHz stereo 128 kbps (stock)', options: RecordingPresets.HIGH_QUALITY },
  { label: 'AAC low quality (stock)', options: RecordingPresets.LOW_QUALITY },
];

/** Prepare the recorder with the first settings iOS accepts. Returns the label used. */
export async function prepareRecorder(rec: AudioRecorder): Promise<string> {
  const errors: string[] = [];
  for (const c of VOICE_CANDIDATES) {
    try {
      await rec.prepareToRecordAsync(c.options);
      return c.label;
    } catch (e: any) {
      errors.push(`${c.label}: ${String(e?.message ?? e).split('\n').pop()}`);
    }
  }
  throw new Error('The iPhone refused every recording setting.\n' + errors.join('\n'));
}

/**
 * Puts iOS in play-and-record mode. expo-audio adds .allowBluetoothHFP in this mode
 * (verified in its iOS source), so the glasses' mic and speakers become available.
 */
export async function enableVoiceSession() {
  const p = await requestRecordingPermissionsAsync();
  if (!p.granted) throw new Error('Microphone permission is needed.');
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' });
}

/** Select the glasses (Bluetooth) mic if present. Returns the input name in use. */
export async function chooseInput(rec: AudioRecorder): Promise<string> {
  try {
    const inputs = rec.getAvailableInputs();
    const bt = inputs.find((i) => /bluetooth|hfp|g2|hands-?free/i.test(`${i.type} ${i.name}`));
    if (getSettings().preferGlassesMic && bt) { rec.setInput(bt.uid); return bt.name; }
    const cur = await rec.getCurrentInput();
    return cur?.name ?? 'iPhone microphone';
  } catch {
    return 'default microphone';
  }
}

/** Lets the orb glow while Alice is talking. */
const speakingListeners = new Set<(on: boolean) => void>();
export const onSpeaking = (fn: (on: boolean) => void) => { speakingListeners.add(fn); return () => { speakingListeners.delete(fn); }; };
const setSpeaking = (on: boolean) => speakingListeners.forEach((f) => f(on));

/**
 * Alice's voices. Natural voices are made by Gemini on Alice's server (needs internet);
 * 'iphone' is the built-in iOS voice and always works offline. Names must match server/src/config.mjs.
 */
export const VOICES: { id: string; label: string; feel: string }[] = [
  { id: 'Sulafat', label: 'Sulafat', feel: 'Warm' },
  { id: 'Aoede', label: 'Aoede', feel: 'Breezy' },
  { id: 'Achernar', label: 'Achernar', feel: 'Soft' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix', feel: 'Gentle' },
  { id: 'Kore', label: 'Kore', feel: 'Firm' },
  { id: 'Leda', label: 'Leda', feel: 'Youthful' },
  { id: 'Puck', label: 'Puck', feel: 'Upbeat' },
  { id: 'Achird', label: 'Achird', feel: 'Friendly' },
  { id: 'Charon', label: 'Charon', feel: 'Informative' },
  { id: 'Algieba', label: 'Algieba', feel: 'Smooth' },
  { id: 'Iapetus', label: 'Iapetus', feel: 'Clear' },
  { id: 'Gacrux', label: 'Gacrux', feel: 'Mature' },
  { id: 'iphone', label: 'iPhone voice', feel: 'Offline, instant' },
];

let player: AudioPlayer | null = null;
let generation = 0; // a newer speak()/stop cancels older ones

function styleFor(rate: number): string {
  const pace = rate >= 1.25 ? 'at a brisk pace' : rate <= 0.8 ? 'slowly and calmly' : 'at a natural conversational pace';
  return `warm, natural and friendly, like a helpful companion, ${pace}`;
}

function speakIphone(text: string, language: string, rate: number, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation) return resolve();
    Speech.speak(text, { language, rate, onDone: () => resolve(), onStopped: () => resolve(), onError: () => resolve() });
  });
}

async function playWav(base64: string, gen: number): Promise<void> {
  const f = new File(Paths.cache, `alice-voice-${gen}.wav`);
  if (f.exists) f.delete();
  f.create();
  await f.write(base64, { encoding: 'base64' });
  if (gen !== generation) return;
  await new Promise<void>((resolve) => {
    const p = createAudioPlayer(f.uri);
    player = p;
    let done = false;
    const finish = () => { if (done) return; done = true; sub.remove(); clearTimeout(guard); try { p.remove(); } catch {} if (player === p) player = null; try { f.delete(); } catch {} resolve(); };
    const sub = p.addListener('playbackStatusUpdate', (st) => { if (st.didJustFinish) finish(); });
    const guard = setTimeout(finish, 120000); // never hang the assistant
    (p as any).__finish = finish;
    p.play();
  });
}

export function speak(text: string, language?: string): Promise<void> {
  const s = getSettings();
  const gen = ++generation;
  stopPlayback();
  setSpeaking(true);
  const lang = language ?? s.voiceLanguage;
  const run = async () => {
    if (s.voice !== 'iphone' && !s.privacyMode) {
      try {
        const a = await speechAudio(text.slice(0, 3000), s.voice, styleFor(s.speechRate));
        if (gen !== generation) return;
        await playWav(a.audioBase64, gen);
        return;
      } catch { /* offline, quota or server issue: fall back to the iPhone voice */ }
    }
    await speakIphone(text, lang, s.speechRate, gen);
  };
  return run().finally(() => { if (gen === generation) setSpeaking(false); });
}

function stopPlayback() {
  Speech.stop();
  const p: any = player;
  if (p) { try { p.pause(); } catch {} p.__finish?.(); }
}
export const stopSpeaking = () => { generation++; stopPlayback(); setSpeaking(false); };

/** Map a language name to an iOS voice locale (best effort; falls back to English). */
export function localeFor(lang: string): string {
  const m: Record<string, string> = {
    spanish: 'es-MX', french: 'fr-FR', german: 'de-DE', italian: 'it-IT', portuguese: 'pt-BR', chinese: 'zh-CN', mandarin: 'zh-CN',
    japanese: 'ja-JP', korean: 'ko-KR', arabic: 'ar-SA', russian: 'ru-RU', hindi: 'hi-IN', vietnamese: 'vi-VN', tagalog: 'fil-PH',
    english: 'en-US', polish: 'pl-PL', dutch: 'nl-NL', turkish: 'tr-TR', ukrainian: 'uk-UA', haitian: 'fr-FR',
  };
  return m[lang.trim().toLowerCase()] ?? 'en-US';
}
