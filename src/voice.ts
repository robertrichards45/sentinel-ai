import { offlineNow } from './netState';
import * as Speech from 'expo-speech';
import { AudioRecorder, AudioPlayer, createAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { speechAudio } from './ai';
import { splitForSpeech } from './speechCore';
import { getSettings } from './settings';

/**
 * Recording settings, tried in order. v0.1.0 build 2 used 16 kHz mono @ 64 kbps AAC,
 * which iOS refused on a real iPhone (AVAudioRecorder.prepareToRecord() == false),
 * so we start from Expo's stock presets, which are known-good, and fall back.
 */
export const VOICE_PRESET = RecordingPresets.HIGH_QUALITY;
export const VOICE_CANDIDATES = [
  { label: 'AAC 44.1 kHz mono 64 kbps', options: { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true } },
  { label: 'AAC 44.1 kHz stereo 128 kbps (stock)', options: { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true } },
  { label: 'AAC low quality (stock)', options: { ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true } },
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

/**
 * Before Alice speaks: leave "phone call" mode so iOS plays her through the normal media route
 * (Bluetooth glasses/headphones when connected, otherwise the loudspeaker, never the earpiece).
 */
export async function enablePlaybackSession() {
  try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' }); } catch {}
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
  { id: 'Laomedeia', label: 'Laomedeia', feel: 'Upbeat' },
  { id: 'Achernar', label: 'Achernar', feel: 'Soft' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix', feel: 'Gentle' },
  { id: 'Despina', label: 'Despina', feel: 'Smooth & silky' },
  { id: 'Gacrux', label: 'Gacrux', feel: 'Deep & mature' },
  { id: 'Kore', label: 'Kore', feel: 'Low & firm' },
  { id: 'Callirrhoe', label: 'Callirrhoe', feel: 'Easy-going' },
  { id: 'Erinome', label: 'Erinome', feel: 'Clear' },
  { id: 'Leda', label: 'Leda', feel: 'Youthful' },
  { id: 'Zephyr', label: 'Zephyr', feel: 'Bright' },
  { id: 'Autonoe', label: 'Autonoe', feel: 'Bright & crisp' },
  { id: 'Pulcherrima', label: 'Pulcherrima', feel: 'Bold' },
  { id: 'iphone', label: 'iPhone voice', feel: 'Offline, instant' },
];

let player: AudioPlayer | null = null;
let generation = 0; // a newer speak()/stop cancels older ones
/** Changes whenever speech starts or is stopped: lets long readers notice they were cut off. */
export const speechGeneration = () => generation;

/** How Alice delivers her lines. Sent to the voice model as a short style direction. */
export const VOICE_STYLES: { id: string; label: string; style: string }[] = [
  { id: 'natural', label: 'Natural', style: 'warm, natural and friendly, like a helpful companion' },
  { id: 'american', label: 'American', style: 'friendly, with a natural General American accent' },
  { id: 'british', label: 'British', style: 'friendly, with a natural British (Received Pronunciation) accent' },
  { id: 'futuristic', label: 'Futuristic AI', style: 'calm, precise and slightly synthetic, like an advanced AI system' },
  { id: 'refined', label: 'Refined British AI', style: 'polished, dry-witted and composed, like a refined British AI butler' },
  { id: 'calm', label: 'Calm', style: 'soft, slow and soothing' },
  { id: 'sultry', label: 'Sultry', style: 'low, smooth and sultry, warm and intimate, unhurried, with a hint of a smile' },
  { id: 'velvet', label: 'Late night', style: 'deep, husky and relaxed, quiet late-night radio host, close to the microphone' },
  { id: 'playful', label: 'Playful', style: 'playful, teasing and confident, with a smile in her voice' },
  { id: 'energetic', label: 'Energetic', style: 'upbeat, bright and enthusiastic' },
];

function styleFor(styleId: string, rate: number, pitch: number): string {
  const base = (VOICE_STYLES.find((v) => v.id === styleId) ?? VOICE_STYLES[0]).style;
  const pace = rate >= 1.25 ? 'at a brisk pace' : rate <= 0.8 ? 'slowly' : 'at a natural pace';
  const tone = pitch <= -2 ? ', with a much deeper, lower pitch' : pitch === -1 ? ', slightly lower pitched' : pitch === 1 ? ', slightly higher pitched' : pitch >= 2 ? ', with a noticeably higher pitch' : '';
  return `${base}, ${pace}${tone}`;
}

/**
 * Offline fallback: the best female iPhone voice installed for the language (Premium/Enhanced
 * Siri-quality voices sound far less robotic than the default compact voice).
 */
const bestVoiceCache = new Map<string, string | undefined>();
const PREFERRED = /\b(ava|zoe|samantha|allison|susan|serena|karen|moira|tessa|kate|nicky|evan)\b/i;
async function bestIphoneVoice(language: string): Promise<string | undefined> {
  if (bestVoiceCache.has(language)) return bestVoiceCache.get(language);
  let id: string | undefined;
  try {
    const all = await Speech.getAvailableVoicesAsync();
    const lang = language.toLowerCase(), base = lang.split('-')[0];
    const pool = all.filter((v) => v.language?.toLowerCase() === lang).concat(all.filter((v) => v.language?.toLowerCase().startsWith(base + '-')));
    const score = (v: Speech.Voice) => (v.quality === Speech.VoiceQuality.Enhanced ? 10 : 0) + (/premium/i.test(v.identifier) ? 5 : 0) + (PREFERRED.test(v.name) ? 3 : 0) + (v.language?.toLowerCase() === lang ? 1 : 0);
    id = pool.sort((a, b) => score(b) - score(a))[0]?.identifier;
  } catch {}
  bestVoiceCache.set(language, id);
  return id;
}

async function speakIphone(text: string, language: string, rate: number, pitch: number, gen: number): Promise<void> {
  const voice = await bestIphoneVoice(language);
  return new Promise((resolve) => {
    if (gen !== generation) return resolve();
    Speech.speak(text, { language, voice, rate, pitch: 1 + pitch * 0.12, onDone: () => resolve(), onStopped: () => resolve(), onError: () => resolve() });
  });
}

async function playWav(base64: string, gen: number): Promise<void> {
  const f = new File(Paths.cache, `alice-voice-${gen}-${Date.now()}.wav`);
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

export function speak(text: string, language?: string, modeId?: string): Promise<void> {
  const s = getSettings();
  const voice = (modeId && s.modeVoices[modeId]) || s.voice;
  const gen = ++generation;
  stopPlayback();
  setSpeaking(true);
  const lang = language ?? s.voiceLanguage;
  const run = async () => {
    await enablePlaybackSession();
    if (gen !== generation) return;
    if (voice !== 'iphone' && !s.privacyMode && !offlineNow()) {
      const style = styleFor(s.voiceStyle, s.speechRate, s.voicePitch);
      const [first, rest] = splitForSpeech(text.slice(0, 3000));
      // Voice both parts at once; play the first as soon as it's ready.
      const tts = (t: string) => speechAudio(t, voice, style).catch(() => speechAudio(t, voice, style)); // one retry
      const firstP = tts(first);
      const restP = rest ? tts(rest).catch(() => null) : Promise.resolve(null);
      try {
        const a = await firstP;
        if (gen !== generation) return;
        await playWav(a.audioBase64, gen);
        if (!rest || gen !== generation) return;
        const b = await restP;
        if (gen !== generation) return;
        if (b) await playWav(b.audioBase64, gen);
        else await speakIphone(rest, lang, s.speechRate, s.voicePitch, gen);
        return;
      } catch { /* offline, quota or server issue: fall back to the iPhone voice */ }
    }
    await speakIphone(text, lang, s.speechRate, s.voicePitch, gen);
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
