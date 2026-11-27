import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAudioRecorder } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { Attachment } from '../ai';
import { useKeepAwake } from 'expo-keep-awake';
import { ask, Exchange } from '../assistant';
import { allModes } from '../modeStore';
import { onListenRequest } from '../triggers';
import { offlineNow, checkNet } from '../netState';
import { offlineTurn } from '../offline';
import { live, LiveState, LiveLine } from '../live';
import { onGlassesVoice } from '../glassesVoice';
import { updateSettings } from '../settings';
import { useSettings } from '../hooks';
import { setPhoneMic } from '../micState';
import { goToSleep, wakeUp } from '../quiet';
import { VOICE_PRESET, enableVoiceSession, chooseInput, stopSpeaking, prepareRecorder, onSpeaking } from '../voice';
import { Orb, VoiceBars, OrbState } from '../Orb';
import { LiveCamera } from '../LiveCamera';
import { onLook } from '../triggers';
import { Btn, C, Card, F, Glass, Ionicons, S } from '../ui';

const HINT: Record<string, string> = {
  general: 'Ask anything. Try "remind me to call the VA at 9 tomorrow".',
  research: 'Ask a question that needs the web. Alice checks sources and says where they disagree.',
  vision: 'Tap Take photo (or pick a glasses photo), then ask about it by voice.',
  reader: 'Tap Take photo of the page, or Read a file. Alice reads it aloud.',
  scene: 'Hold and say "what should I watch out for".',
  mechanic: 'Take a photo of the problem, then describe it.',
  electronics: 'Take a photo of the board, then describe the fault.',
  pc: 'Point at the error message and ask what it means.',
  navigator: 'Try "where am I" or "walking directions to…".',
};

export default function Assist() {
  useKeepAwake();
  const s = useSettings();
  const rec = useAudioRecorder(VOICE_PRESET);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeakingState] = useState(false);
  const [mic, setMic] = useState('');
  const [typed, setTyped] = useState('');
  const [log, setLog] = useState<Exchange[]>([]);
  const [err, setErr] = useState('');
  const [attached, setAttached] = useState<Attachment | null>(null);
  const lastPhoto = useRef<string | undefined>(undefined);
  const [liveState, setLiveState] = useState<LiveState>(live.state);
  const [liveNote, setLiveNote] = useState(live.detail);
  const [lines, setLines] = useState<LiveLine[]>(live.lines);
  const liveOn = liveState !== 'off' && liveState !== 'error';
  useEffect(() => live.subscribe({
    state: (st, detail) => { setLiveState(st); if (st === 'error') setErr(detail ?? 'The conversation stopped.'); else setLiveNote(detail ?? ''); },
    line: () => setLines(live.lines),
  }), []);
  const [glassesNote, setGlassesNote] = useState('');
  useEffect(() => onGlassesVoice({
    state: (st) => setGlassesNote(st === 'listening' ? 'Listening through your glasses…' : st === 'thinking' ? 'Thinking…' : ''),
    exchange: (ex) => setLog((l) => [ex, ...l].slice(0, 30)),
    error: (m) => setErr(m),
  }), []);
  const toggleLive = async () => {
    if (liveOn) { goToSleep(); await live.stop(); return; }
    wakeUp();
    if (offlineNow() || !(await checkNet())) { offlineTurn(); return; } // no signal: basics only
    stopSpeaking(); setErr(''); setLiveNote('');
    await live.start();
  };
  const mode = allModes().find((m) => m.id === s.activeMode) ?? allModes()[0];
  const listeningRef = useRef(false);
  const pressingRef = useRef(false);
  const handsFreeRef = useRef(false);
  const pressedAt = useRef(0);
  const vad = useRef<ReturnType<typeof setInterval> | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  useEffect(() => onSpeaking(setSpeakingState), []);

  const run = async (o: Parameters<typeof ask>[0]) => {
    setBusy(true); setErr('');
    try { const ex = await ask({ file: attached ?? undefined, ...o, modeId: mode.id }); setLog((l) => [ex, ...l].slice(0, 30)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  /** Hands-free: listen until you stop talking (1.4 s of quiet), give up after 7 s of silence, max 20 s. */
  const watchSilence = () => {
    const t0 = Date.now(); let heard = false; let quietSince = 0;
    if (vad.current) clearInterval(vad.current);
    vad.current = setInterval(() => {
      if (!listeningRef.current) { clearInterval(vad.current!); vad.current = null; return; }
      const db = rec.getStatus().metering ?? -160;
      const now = Date.now();
      if (db > -38) { heard = true; quietSince = 0; } else if (heard && !quietSince) quietSince = now;
      if ((heard && quietSince && now - quietSince > 1400) || now - t0 > 20000) finish();
      else if (!heard && now - t0 > 7000) { cancel(); }
    }, 150);
  };
  const listenHandsFree = async () => {
    if (listeningRef.current || busy) return;
    handsFreeRef.current = true; setHandsFree(true);
    pressingRef.current = true;
    await start(true);
    pressingRef.current = false;
    if (listeningRef.current) watchSilence();
  };
  const cancel = async () => {
    listeningRef.current = false; setListening(false); handsFreeRef.current = false; setHandsFree(false);
    try { await rec.stop(); } catch {}
    setPhoneMic(false);
  };
  const finish = () => { handsFreeRef.current = false; setHandsFree(false); stop(true); };
  const [look, setLook] = useState(false);
  useEffect(() => onLook((on) => setLook(on)), []);
  useEffect(() => onListenRequest(() => (offlineNow() ? offlineTurn() : s.liveConversation ? (liveOn ? undefined : toggleLive()) : listenHandsFree())));

  const start = async (fromHandsFree = false) => {
    if (!fromHandsFree) { pressedAt.current = Date.now(); handsFreeRef.current = false; }
    pressingRef.current = true; setErr('');
    try {
      stopSpeaking();
      await enableVoiceSession();
      const fmt = await prepareRecorder(rec);
      setMic(`${await chooseInput(rec)}, ${fmt}`);
      if (!pressingRef.current && !handsFreeRef.current) return; // cancelled while preparing: no stray recording
      rec.record(); setPhoneMic(true);
      listeningRef.current = true; setListening(true);
      if (handsFreeRef.current && !fromHandsFree) watchSilence(); // quick tap landed before the mic was ready
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  };
  const stop = async (force = false) => {
    pressingRef.current = false;
    const quickTap = !force && Date.now() - pressedAt.current < 400;
    // A quick tap (not a hold) switches to hands-free: keep listening until you stop talking.
    if (quickTap && !handsFreeRef.current) { handsFreeRef.current = true; setHandsFree(true); if (listeningRef.current) watchSilence(); return; }
    if (!listeningRef.current) return;
    if (!force && handsFreeRef.current) return;
    if (vad.current) { clearInterval(vad.current); vad.current = null; }
    listeningRef.current = false; setListening(false);
    await rec.stop(); setPhoneMic(false);
    // Voice never opens the camera by itself; in photo modes the last photo you took is reused.
    if (rec.uri) run({ audioUri: rec.uri, imageBase64: mode.wantsImage ? lastPhoto.current : undefined });
  };


  const snap = async (fromLibrary: boolean): Promise<string | undefined> => {
    const opts: ImagePicker.ImagePickerOptions = { base64: true, quality: 0.6, mediaTypes: ['images'] };
    const r = fromLibrary ? await ImagePicker.launchImageLibraryAsync(opts) : await (async () => {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      return p.granted ? ImagePicker.launchCameraAsync(opts) : ({ canceled: true } as const);
    })();
    const b64 = !r.canceled && r.assets?.[0]?.base64 ? r.assets[0].base64 : undefined;
    if (b64) lastPhoto.current = b64; // follow-up voice questions are about this photo
    return b64;
  };

  /** Pick a PDF, text file or picture; Alice reads it aloud and keeps it for follow-up questions. */
  const pickFile = async () => {
    setErr('');
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'text/*', 'image/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if ((a.size ?? 0) > 8_000_000) { setErr('That file is over 8 MB. Try a smaller PDF or a photo of the page.'); return; }
    const ext = (a.name.split('.').pop() ?? '').toLowerCase();
    const mime = a.mimeType && a.mimeType !== 'application/octet-stream' ? a.mimeType
      : ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ['jpg', 'jpeg'].includes(ext) ? 'image/jpeg' : ext === 'md' ? 'text/markdown' : ext === 'csv' ? 'text/csv' : 'text/plain';
    const file: Attachment = { mime: mime.startsWith('text/') && !['text/plain', 'text/markdown', 'text/csv', 'text/html'].includes(mime) ? 'text/plain' : mime, base64: await new File(a.uri).base64(), name: a.name };
    setAttached(file);
    run({ file });
  };

  const liveOrb: Record<LiveState, OrbState> = { off: 'idle', error: 'idle', connecting: 'thinking', listening: 'listening', thinking: 'thinking', speaking: 'speaking' };
  const liveStatus: Record<LiveState, string> = { off: 'Tap Alice to start talking', error: 'Tap Alice to try again', connecting: liveNote || 'Connecting…', listening: 'Listening… just talk', thinking: 'Thinking…', speaking: 'Speaking · just talk to interrupt' };
  const state: OrbState = s.liveConversation ? liveOrb[liveState] : listening ? 'listening' : busy ? 'thinking' : speaking ? 'speaking' : 'idle';
  const status = s.liveConversation ? liveStatus[liveState] : listening ? (handsFree ? 'Listening… just talk' : 'Listening… let go to send') : busy ? 'Thinking…' : speaking ? 'Speaking · tap Alice to stop' : 'Tap Alice, or hold to talk';
  const hint = mode.id === 'translator' ? `Speak, and Alice says it in ${s.translateTo}.` : HINT[mode.id] ?? mode.prompt.slice(0, 90);

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad} keyboardShouldPersistTaps="handled">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20, paddingTop: 4 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
        {allModes().map((m) => {
          const on = m.id === mode.id;
          return (
            <Pressable key={m.id} onPress={() => updateSettings({ activeMode: m.id })} accessibilityRole="button" accessibilityState={{ selected: on }}>
              {on
                ? <View style={{ paddingVertical: 9, paddingHorizontal: 15, borderRadius: 999, backgroundColor: C.violet, shadowColor: C.violet, shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }}>
                    <Text style={{ color: '#FFFFFF', fontFamily: F.semibold, fontSize: 15 }}>{m.name}</Text>
                  </View>
                : <Glass radius={999} style={{ paddingVertical: 9, paddingHorizontal: 15 }}>
                    <Text style={{ color: C.ink, fontFamily: F.regular, fontSize: 15 }}>{m.name}</Text>
                  </Glass>}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ alignItems: 'center', gap: 6 }}>
        <Pressable onPressIn={s.liveConversation ? undefined : () => (listeningRef.current && handsFreeRef.current ? finish() : start())}
          onPressOut={s.liveConversation ? undefined : () => stop()}
          onPress={s.liveConversation ? toggleLive : () => speaking && stopSpeaking()}
          accessibilityRole="button" accessibilityLabel={s.liveConversation ? (liveOn ? 'End conversation with Alice' : 'Start conversation with Alice') : listening ? 'Listening. Release to send.' : 'Hold to talk to Alice'}>
          <Orb size={250} state={state} />
        </Pressable>
        <View style={{ height: 44, justifyContent: 'center' }}>
          {(s.liveConversation ? liveState === 'listening' : listening) ? <VoiceBars active /> : <Text style={{ fontFamily: F.light, fontSize: 24, color: C.ink, letterSpacing: -0.3 }}>{status}</Text>}
        </View>
        <Text style={[S.dim, { textAlign: 'center' }]}>{glassesNote || (s.liveConversation && liveState === 'listening' && liveNote ? liveNote : listening ? `Microphone: ${mic}` : hint)}</Text>
      </View>

      <View style={S.row}>
        <Btn style={{ flex: 1 }} kind="ghost" icon="document-text-outline" title={attached ? 'Read another file' : 'Read a file'} onPress={pickFile} />
        {attached ? <Btn kind="ghost" icon="close" title="Done" onPress={() => setAttached(null)} /> : null}
      </View>
      {attached ? <Text style={[S.dim, { textAlign: 'center' }]} numberOfLines={1}>Ask anything about "{attached.name}". Tap Done to stop.</Text> : null}

      {look ? <LiveCamera onClose={() => setLook(false)} /> : null}
      {s.liveConversation ? (
        <Btn kind={look ? 'primary' : 'ghost'} icon={look ? 'eye-off-outline' : 'eye-outline'} title={look ? 'Stop showing Alice' : 'Show Alice (live camera)'} onPress={() => setLook(!look)} />
      ) : null}
      {mode.wantsImage || liveOn ? (
        <View style={S.row}>
          <Btn style={{ flex: 1 }} icon="camera-outline" title="Take photo" onPress={async () => { const i = await snap(false); if (i) (liveOn ? live.sendImage(i) : run({ imageBase64: i })); }} />
          <Btn style={{ flex: 1 }} kind="ghost" icon="images-outline" title="Glasses photo" onPress={async () => { const i = await snap(true); if (i) (liveOn ? live.sendImage(i) : run({ imageBase64: i })); }} />
        </View>
      ) : null}

      <Glass radius={999} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 6, paddingVertical: 6 }}>
        <TextInput style={{ flex: 1, fontFamily: F.regular, fontSize: 16, color: C.ink, paddingVertical: 8 }} value={typed} onChangeText={setTyped}
          placeholder="Or type to Alice" placeholderTextColor={C.faint} returnKeyType="send" accessibilityLabel="Type a question" keyboardAppearance="dark"
          onSubmitEditing={() => { if (typed) { liveOn ? live.sendText(typed) : run({ text: typed }); setTyped(''); } }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!typed || busy} onPress={() => { liveOn ? live.sendText(typed) : run({ text: typed }); setTyped(''); }}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: typed && !busy ? C.violet : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </Pressable>
      </Glass>

      {err ? (
        <Card tone="alert">
          <View style={S.row}><Ionicons name="alert-circle" size={18} color={C.red} /><Text style={[S.h2, { color: C.red, flex: 1 }]}>That didn't work</Text></View>
          <Text style={S.dim} selectable>{err}</Text>
        </Card>
      ) : null}

      {s.liveConversation ? lines.map((l) => (
        l.who === 'you'
          ? <Text key={l.t + l.who} style={{ fontFamily: F.light, fontSize: 20, lineHeight: 27, color: C.sub, letterSpacing: -0.2 }} selectable>{l.text}</Text>
          : l.who === 'done'
            ? <View key={l.t + l.who} style={S.row}><Ionicons name="checkmark-circle" size={16} color={C.mint} /><Text style={[S.dim, { color: C.mint, flex: 1 }]}>{l.text}</Text></View>
            : <Glass key={l.t + l.who} style={{ padding: 16 }}><Text style={S.body} selectable>{l.text}</Text></Glass>
      )) : null}

      {log.map((e) => (
        <View key={e.t} style={{ gap: 10 }}>
          {e.you ? <Text style={{ fontFamily: F.light, fontSize: 20, lineHeight: 27, color: C.sub, letterSpacing: -0.2 }} selectable>{e.you}</Text> : null}
          <Glass style={{ padding: 16, gap: 8 }}>
            <Text style={S.body} selectable>{e.alice}</Text>
            {e.outcomes.map((o, i) => (
              <View key={i} style={S.row}><Ionicons name="checkmark-circle" size={16} color={C.mint} /><Text style={[S.dim, { color: C.mint, flex: 1 }]}>{o}</Text></View>
            ))}
            {e.sources?.length ? (
              <View style={{ gap: 4, marginTop: 2 }}>
                {e.sources.slice(0, 4).map((src, i) => (
                  <Pressable key={i} onPress={() => Linking.openURL(src.url)} accessibilityRole="link" style={S.row}>
                    <Ionicons name="link-outline" size={14} color={C.cyan} />
                    <Text numberOfLines={1} style={[S.dim, { color: C.cyan, flex: 1 }]}>{src.title || src.url}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {e.via ? <Text style={[S.dim, { fontSize: 12, color: C.faint }]}>{e.via}{e.ms ? ` · ${(e.ms / 1000).toFixed(1)} s` : ''}</Text> : null}
          </Glass>
        </View>
      ))}
    </ScrollView>
  );
}
