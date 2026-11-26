import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAudioRecorder } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { ask, Exchange } from '../assistant';
import { allModes } from '../modeStore';
import { onGlassesButton } from '../glassesState';
import { updateSettings } from '../settings';
import { useSettings } from '../hooks';
import { VOICE_PRESET, enableVoiceSession, chooseInput, stopSpeaking, prepareRecorder } from '../voice';
import { Btn, C, Card, S } from '../ui';

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

  const run = async (o: Parameters<typeof ask>[0]) => {
    setBusy(true); setErr('');
    try { const ex = await ask({ ...o, modeId: mode.id }); setLog((l) => [ex, ...l].slice(0, 30)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const pressingRef = useRef(false);
  const start = async () => {
    pressingRef.current = true; setErr('');
    try {
      stopSpeaking();
      await enableVoiceSession();
      const fmt = await prepareRecorder(rec);
      setMic(`${await chooseInput(rec)} · ${fmt}`);
      if (!pressingRef.current) return; // released while preparing: don't start a stray recording
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

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad} keyboardShouldPersistTaps="handled">
      <Text style={S.h1}>{mode.icon} {mode.name}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {allModes().map((m) => (
          <Pressable key={m.id} onPress={() => updateSettings({ activeMode: m.id })}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: m.id === mode.id ? C.accent : C.line, backgroundColor: m.id === mode.id ? '#12302C' : 'transparent' }}>
            <Text style={{ color: C.text }}>{m.icon} {m.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable onPressIn={start} onPressOut={stop} disabled={busy}
        style={{ height: 150, borderRadius: 75, alignSelf: 'center', width: 150, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? C.bad : busy ? C.line : C.accent }}>
        {busy ? <ActivityIndicator color={C.text} /> : <Text style={{ color: '#06120F', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>{listening ? 'Listening…\nrelease to send' : 'Hold to talk'}</Text>}
      </Pressable>
      <Text style={[S.dim, { textAlign: 'center' }]}>{listening ? `Mic: ${mic}` : mode.wantsImage ? 'This mode takes a photo after you speak.' : mode.id === 'translator' ? `Translating to ${s.translateTo}` : 'Answers play through your glasses when they are connected as headphones.'}</Text>

      {mode.wantsImage ? (
        <View style={S.row}>
          <Btn style={{ flex: 1 }} title="Photo now" onPress={async () => { const i = await snap(false); if (i) run({ imageBase64: i }); }} />
          <Btn style={{ flex: 1 }} kind="ghost" title="Pick glasses photo" onPress={async () => { const i = await snap(true); if (i) run({ imageBase64: i }); }} />
        </View>
      ) : null}

      <View style={S.row}>
        <TextInput style={[S.input, { flex: 1 }]} value={typed} onChangeText={setTyped} placeholder="…or type a question" placeholderTextColor={C.dim} onSubmitEditing={() => { if (typed) { run({ text: typed }); setTyped(''); } }} returnKeyType="send" />
        <Btn title="Send" disabled={!typed || busy} onPress={() => { run({ text: typed }); setTyped(''); }} />
      </View>
      {err ? <Text style={{ color: C.bad }}>{err}</Text> : null}

      {log.map((e) => (
        <Card key={e.t}>
          {e.you ? <Text style={S.dim}>You: {e.you}</Text> : null}
          <Text style={S.body}>{e.sentinel}</Text>
          {e.outcomes.map((o, i) => <Text key={i} style={[S.dim, { color: C.accent }]}>✓ {o}</Text>)}
        </Card>
      ))}
    </ScrollView>
  );
}
