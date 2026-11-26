import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAudioRecorder } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { ask, Exchange } from '../assistant';
import { allModes } from '../modeStore';
import { onGlassesButton } from '../glassesState';
import { updateSettings } from '../settings';
import { useSettings } from '../hooks';
import { VOICE_PRESET, enableVoiceSession, chooseInput, stopSpeaking, prepareRecorder } from '../voice';
import { TalkLens } from '../Lens';
import { Btn, C, Card, F, Ionicons, S } from '../ui';

const HINT: Record<string, string> = {
  general: 'Ask anything. Try "remind me to call the VA at 9 tomorrow".',
  vision: 'Speak your question. A photo is taken when you let go.',
  reader: 'Point at the page, then hold and say "read this".',
  scene: 'Hold and say "what should I watch out for".',
  mechanic: 'Describe the problem, then a photo is taken.',
  electronics: 'Describe the fault, then a photo is taken.',
  pc: 'Point at the error message and ask what it means.',
  navigator: 'Try "where am I" or "walking directions to…".',
};

export default function Assist() {
  useKeepAwake();
  const s = useSettings();
  const rec = useAudioRecorder(VOICE_PRESET);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState('');
  const [typed, setTyped] = useState('');
  const [log, setLog] = useState<Exchange[]>([]);
  const [err, setErr] = useState('');
  const mode = allModes().find((m) => m.id === s.activeMode) ?? allModes()[0];
  const listeningRef = useRef(false);
  const pressingRef = useRef(false);

  const run = async (o: Parameters<typeof ask>[0]) => {
    setBusy(true); setErr('');
    try { const ex = await ask({ ...o, modeId: mode.id }); setLog((l) => [ex, ...l].slice(0, 30)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const start = async () => {
    pressingRef.current = true; setErr('');
    try {
      stopSpeaking();
      await enableVoiceSession();
      const fmt = await prepareRecorder(rec);
      setMic(`${await chooseInput(rec)}, ${fmt}`);
      if (!pressingRef.current) return; // released while preparing: no stray recording
      rec.record();
      listeningRef.current = true; setListening(true);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  };
  const stop = async () => {
    pressingRef.current = false;
    if (!listeningRef.current) return;
    listeningRef.current = false; setListening(false);
    await rec.stop();
    let image: string | undefined;
    if (mode.wantsImage) image = await snap(false);
    if (rec.uri) run({ audioUri: rec.uri, imageBase64: image });
  };

  // EXPERIMENTAL: glasses button (busy-flag edge) toggles listening
  useEffect(() => { const off = onGlassesButton(() => (listeningRef.current ? stop() : start())); return () => { off(); }; });

  const snap = async (fromLibrary: boolean): Promise<string | undefined> => {
    const opts: ImagePicker.ImagePickerOptions = { base64: true, quality: 0.6, mediaTypes: ['images'] };
    const r = fromLibrary ? await ImagePicker.launchImageLibraryAsync(opts) : await (async () => {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      return p.granted ? ImagePicker.launchCameraAsync(opts) : ({ canceled: true } as const);
    })();
    return !r.canceled && r.assets?.[0]?.base64 ? r.assets[0].base64 : undefined;
  };

  const hint = mode.id === 'translator' ? `Speak, and SENTINEL says it in ${s.translateTo}.` : HINT[mode.id] ?? mode.prompt.slice(0, 90);

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad} keyboardShouldPersistTaps="handled">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
        {allModes().map((m) => {
          const on = m.id === mode.id;
          return (
            <Pressable key={m.id} onPress={() => updateSettings({ activeMode: m.id })} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? C.ink : C.panel, borderWidth: 1, borderColor: on ? C.ink : C.line }}>
              <Text style={{ color: on ? '#FFFFFF' : C.ink, fontFamily: on ? F.semibold : F.regular, fontSize: 15 }}>{m.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ gap: 6, marginTop: 4 }}>
        <Text style={S.h1}>{mode.name}</Text>
        <Text style={S.dim}>{hint}</Text>
      </View>

      <View style={{ paddingVertical: 8 }}>
        <TalkLens state={busy ? 'thinking' : listening ? 'listening' : 'idle'} onPressIn={start} onPressOut={stop}
          label={listening ? 'Listening\nlet go to send' : 'Hold to talk'} />
      </View>
      <Text style={[S.dim, { textAlign: 'center' }]}>
        {listening ? `Microphone: ${mic}` : busy ? 'Thinking…' : 'Answers play through the glasses when they are your headphones.'}
      </Text>

      {mode.wantsImage ? (
        <View style={S.row}>
          <Btn style={{ flex: 1 }} icon="camera-outline" title="Take photo" onPress={async () => { const i = await snap(false); if (i) run({ imageBase64: i }); }} />
          <Btn style={{ flex: 1 }} kind="ghost" icon="images-outline" title="Glasses photo" onPress={async () => { const i = await snap(true); if (i) run({ imageBase64: i }); }} />
        </View>
      ) : null}

      <View style={[S.row, { backgroundColor: C.panel, borderRadius: 999, borderWidth: 1, borderColor: C.line, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 }]}>
        <TextInput style={{ flex: 1, fontFamily: F.regular, fontSize: 16, color: C.ink, paddingVertical: 8 }} value={typed} onChangeText={setTyped}
          placeholder="Or type a question" placeholderTextColor="#98A3B3" returnKeyType="send" accessibilityLabel="Type a question"
          onSubmitEditing={() => { if (typed) { run({ text: typed }); setTyped(''); } }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!typed || busy} onPress={() => { run({ text: typed }); setTyped(''); }}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: typed && !busy ? C.ink : C.line, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {err ? (
        <Card tone="alert">
          <View style={S.row}><Ionicons name="alert-circle" size={18} color={C.red} /><Text style={[S.h2, { color: C.red, flex: 1 }]}>That didn't work</Text></View>
          <Text style={S.dim} selectable>{err}</Text>
        </Card>
      ) : null}

      {log.map((e) => (
        <View key={e.t} style={{ gap: 8 }}>
          {e.you ? (
            <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: C.ink, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ color: '#FFFFFF', fontFamily: F.regular, fontSize: 16, lineHeight: 22 }}>{e.you}</Text>
            </View>
          ) : null}
          <View style={{ alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: C.panel, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 10, gap: 6 }}>
            <Text style={S.body} selectable>{e.sentinel}</Text>
            {e.outcomes.map((o, i) => (
              <View key={i} style={S.row}><Ionicons name="checkmark-circle" size={16} color={C.teal} /><Text style={[S.dim, { color: C.teal, flex: 1 }]}>{o}</Text></View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
