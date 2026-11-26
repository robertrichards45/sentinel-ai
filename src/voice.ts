import * as Speech from 'expo-speech';
import { AudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { getSettings } from './settings';

/** 16 kHz mono AAC: small uploads; matches the glasses' Bluetooth mic bandwidth. */
export const VOICE_PRESET = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 16000, numberOfChannels: 1, bitRate: 64000 };

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

export function speak(text: string, language?: string): Promise<void> {
  const s = getSettings();
  return new Promise((resolve) => {
    Speech.stop();
    Speech.speak(text, { language: language ?? s.voiceLanguage, rate: s.speechRate, onDone: resolve, onStopped: resolve, onError: () => resolve() });
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
