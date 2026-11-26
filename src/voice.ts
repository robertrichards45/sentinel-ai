import * as Speech from 'expo-speech';
import { AudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
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

export function speak(text: string, language?: string): Promise<void> {
  const s = getSettings();
  return new Promise((resolve) => {
    const done = () => { setSpeaking(false); resolve(); };
    Speech.stop();
    setSpeaking(true);
    Speech.speak(text, { language: language ?? s.voiceLanguage, rate: s.speechRate, onDone: done, onStopped: done, onError: done });
  });
}
export const stopSpeaking = () => Speech.stop();

/** Map a language name to an iOS voice locale (best effort; falls back to English). */
export function localeFor(lang: string): string {
  const m: Record<string, string> = {
    spanish: 'es-MX', french: 'fr-FR', german: 'de-DE', italian: 'it-IT', portuguese: 'pt-BR', chinese: 'zh-CN', mandarin: 'zh-CN',
    japanese: 'ja-JP', korean: 'ko-KR', arabic: 'ar-SA', russian: 'ru-RU', hindi: 'hi-IN', vietnamese: 'vi-VN', tagalog: 'fil-PH',
    english: 'en-US', polish: 'pl-PL', dutch: 'nl-NL', turkish: 'tr-TR', ukrainian: 'uk-UA', haitian: 'fr-FR',
  };
  return m[lang.trim().toLowerCase()] ?? 'en-US';
}
