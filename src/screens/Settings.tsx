import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useSettings } from '../hooks';
import { updateSettings } from '../settings';
import { serverStatus, DEFAULT_SERVER } from '../ai';
import { addModePack } from '../modeStore';
import { glasses, WRITES_ENABLED } from '../ble';
import { FEATURES, STATUS_LABEL, Status } from '../features';
import { lastSpeakerTest } from '../speakerTest';
import { Btn, C, Card, F, Field, Glass, Pill, S, Toggle, Title } from '../ui';
import { VOICES, VOICE_STYLES, speak } from '../voice';
import { allModes } from '../modeStore';

const STATUS_COLOR: Record<Status, string> = { tested: C.mint, built: C.violet, partial: C.amber, blocked: C.red, unsupported: C.sub, proposed: C.sub };

export default function Settings() {
  const s = useSettings();
  const [srv, setSrv] = useState<{ ok: boolean; detail: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [pack, setPack] = useState('');
  const [showMatrix, setShowMatrix] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [perMode, setPerMode] = useState(false);
  const check = () => { setSrv(null); serverStatus().then(setSrv); };
  useEffect(check, [s.serverUrl]);

  const exportLog = async () => {
    const f = new File(Paths.cache, `alice-ble-${Date.now()}.jsonl`);
    f.create();
    await f.write(glasses.log.map((l) => JSON.stringify(l)).join('\n'));
    await Sharing.shareAsync(f.uri, { mimeType: 'text/plain', dialogTitle: 'Share Bluetooth log' });
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad} keyboardShouldPersistTaps="handled">
      <Title>Settings</Title>

      <Card title="Alice's AI" right={<Pill dot text={srv ? (srv.ok ? 'Online' : 'Offline') : 'Checking'} color={srv ? (srv.ok ? C.mint : C.red) : C.amber} />}>
        <Text style={S.dim}>{srv?.detail ?? 'Checking the connection…'}</Text>
        <Text style={S.dim}>No API key needed. Alice signs in to her own server automatically, and keys never live on this iPhone.</Text>
        <View style={S.row}>
          <Btn kind="ghost" icon="refresh" title="Check again" onPress={check} />
          <Btn kind="ghost" title={advanced ? 'Hide advanced' : 'Advanced'} onPress={() => setAdvanced(!advanced)} />
        </View>
        {advanced ? (
          <>
            <Field label="Server address (blank = Alice's server)" value={s.serverUrl} onChange={(v) => updateSettings({ serverUrl: v.trim() })} placeholder={DEFAULT_SERVER} />
            <Field label="Force AI for testing: gemini, openai or blank" value={s.providerOverride}
              onChange={(v) => { const t = v.trim().toLowerCase(); if (t === '' || t === 'gemini' || t === 'openai') updateSettings({ providerOverride: t as any }); }} />
          </>
        ) : null}
      </Card>

      <Card title="Alice's voice">
        <Text style={S.dim}>Natural voices need internet. Without it, Alice uses the iPhone voice automatically.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {VOICES.map((v) => {
            const on = s.voice === v.id;
            const inner = (
              <View style={{ paddingVertical: 8, paddingHorizontal: 13 }}>
                <Text style={{ color: on ? '#FFFFFF' : C.ink, fontFamily: on ? F.semibold : F.medium, fontSize: 14 }}>{v.label}</Text>
                <Text style={{ color: on ? 'rgba(255,255,255,0.85)' : C.sub, fontFamily: F.regular, fontSize: 12 }}>{v.feel}</Text>
              </View>
            );
            return (
              <Pressable key={v.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${v.label}, ${v.feel}`}
                onPress={async () => { await updateSettings({ voice: v.id }); speak(`Hi, I'm Alice. This is how I sound.`); }}>
                {on
                  ? <View style={{ borderRadius: 16, backgroundColor: C.violet, shadowColor: C.violet, shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }}>{inner}</View>
                  : <Glass radius={16}>{inner}</Glass>}
              </Pressable>
            );
          })}
        </View>
        <Text style={[S.dim, { fontFamily: F.medium, marginTop: 4 }]}>Style and accent</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {VOICE_STYLES.map((v) => (
            <Chip key={v.id} on={s.voiceStyle === v.id} label={v.label} onPress={async () => { await updateSettings({ voiceStyle: v.id }); speak(`Hi, I'm Alice. This is how I sound.`); }} />
          ))}
        </View>
        <View style={S.row}>
          <Text style={[S.body, { flex: 1 }]}>Pitch {s.voicePitch === 0 ? 'normal' : s.voicePitch < 0 ? `deeper ${-s.voicePitch}` : `higher ${s.voicePitch}`}</Text>
          <Btn kind="ghost" title="−" onPress={() => updateSettings({ voicePitch: Math.max(-2, s.voicePitch - 1) })} />
          <Btn kind="ghost" title="+" onPress={() => updateSettings({ voicePitch: Math.min(2, s.voicePitch + 1) })} />
        </View>
        <Text style={S.dim}>Natural voices follow style and pitch as directions, so results vary a little. The iPhone voice follows pitch exactly.</Text>
        <View style={S.row}>
          <Btn style={{ flex: 1 }} kind="ghost" icon="volume-high-outline" title="Hear it" onPress={() => speak(`Hi, I'm Alice. This is how I sound.`)} />
          <Btn style={{ flex: 1 }} kind="ghost" title={perMode ? 'Done' : 'Voice per mode'} onPress={() => setPerMode(!perMode)} />
        </View>
        {perMode ? allModes().map((m) => (
          <View key={m.id} style={{ gap: 6, borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }}>
            <Text style={S.body}>{m.name}: {s.modeVoices[m.id] ? VOICES.find((v) => v.id === s.modeVoices[m.id])?.label : 'main voice'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Chip on={!s.modeVoices[m.id]} label="Main" onPress={() => { const mv = { ...s.modeVoices }; delete mv[m.id]; updateSettings({ modeVoices: mv }); }} />
              {VOICES.map((v) => (
                <Chip key={v.id} on={s.modeVoices[m.id] === v.id} label={v.label}
                  onPress={async () => { await updateSettings({ modeVoices: { ...s.modeVoices, [m.id]: v.id } }); speak(`This is ${m.name} mode.`, undefined, m.id); }} />
              ))}
            </ScrollView>
          </View>
        )) : null}
      </Card>

      <Card title="Conversation">
        <Toggle label="Live conversation" hint="Talk back and forth like a phone call, and interrupt Alice any time. Turn off to ask one question at a time." value={s.liveConversation} onChange={(v) => updateSettings({ liveConversation: v })} />
      </Card>

      <Card title="Talk through your glasses">
        <Text style={S.dim}>Use your glasses' own AI button or wake word, then just talk. Alice hears you through the glasses' microphone and answers, on any screen and while your phone is locked, as long as Alice is open in the background and the glasses are connected.</Text>
        <Text style={S.dim}>Also works: a Siri shortcut with "Open URLs" alice://talk named "Alice", then "Hey Siri, Alice".</Text>
      </Card>

      <Card title="Voice">
        <Toggle label="Use glasses microphone" hint="When the glasses are connected as headphones" value={s.preferGlassesMic} onChange={(v) => updateSettings({ preferGlassesMic: v })} />
        <Field label="Translate into" value={s.translateTo} onChange={(v) => updateSettings({ translateTo: v })} />
        <Field label="Voice language (e.g. en-US)" value={s.voiceLanguage} onChange={(v) => updateSettings({ voiceLanguage: v })} />
        <View style={S.row}>
          <Text style={[S.body, { flex: 1 }]}>Speech speed {s.speechRate.toFixed(1)}×</Text>
          <Btn kind="ghost" title="−" onPress={() => updateSettings({ speechRate: Math.max(0.5, +(s.speechRate - 0.1).toFixed(1)) })} />
          <Btn kind="ghost" title="+" onPress={() => updateSettings({ speechRate: Math.min(1.6, +(s.speechRate + 0.1).toFixed(1)) })} />
        </View>
      </Card>

      <Card title="Behaviour">
        <Toggle label="Confirm before reminders, events, navigation" value={s.confirmActions} onChange={(v) => updateSettings({ confirmActions: v })} />
        <View style={S.row}>
          <Text style={[S.body, { flex: 1 }]}>Low battery alert at {s.lowBatteryAlert}%</Text>
          <Btn kind="ghost" title="−" onPress={() => updateSettings({ lowBatteryAlert: Math.max(5, s.lowBatteryAlert - 5) })} />
          <Btn kind="ghost" title="+" onPress={() => updateSettings({ lowBatteryAlert: Math.min(50, s.lowBatteryAlert + 5) })} />
        </View>
      </Card>

      <Card title="Mode packs">
        <Text style={S.dim}>Paste a JSON mode pack to add new modes without updating the app.</Text>
        <Field label="Mode pack JSON" value={pack} onChange={setPack} placeholder='[{"id":"fishing","name":"Fishing","prompt":"…"}]' />
        <Btn kind="ghost" title="Install pack" disabled={!pack} onPress={async () => { const r = await addModePack(pack); setMsg(`Added ${r.added.length} mode(s). ${r.errors.join(' ')}`); setPack(''); }} />
        {msg ? <Text style={S.dim}>{msg}</Text> : null}
      </Card>

      <Card title="Diagnostics">
        <Text style={S.dim}>Commands to glasses: {WRITES_ENABLED ? 'on' : 'off (read-only)'}. Firmware-update service: always blocked. Packets logged: {glasses.log.length}.</Text>
        <Btn kind="ghost" title="Share Bluetooth log" disabled={!glasses.log.length} onPress={exportLog} />
        <Toggle label="Glasses speaker test (one time)" hint="Turn on, then tap the glasses button and say a word. Instead of answering, Alice sends a short voice clip to the glasses' speaker channel. Listen in the glasses, then share the Bluetooth log." value={s.speakerTestArmed} onChange={(v) => updateSettings({ speakerTestArmed: v })} />
        {lastSpeakerTest() ? <Text style={S.dim}>Last test: {lastSpeakerTest()!.error ? `stopped after ${lastSpeakerTest()!.sent} packets (${lastSpeakerTest()!.error})` : `sent all ${lastSpeakerTest()!.sent} packets`}.</Text> : null}
      </Card>

      <Card title="Feature status" right={<Btn kind="ghost" title={showMatrix ? 'Hide' : 'Show'} onPress={() => setShowMatrix(!showMatrix)} />}>
        <Text style={S.dim}>{(['tested', 'built', 'partial', 'blocked', 'unsupported', 'proposed'] as Status[]).map((k) => `${STATUS_LABEL[k]}: ${FEATURES.filter((f) => f.status === k).length}`).join(', ')}</Text>
        {showMatrix ? FEATURES.map((f) => (
          <View key={f.id} style={{ gap: 2, borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }}>
            <View style={[S.row, { justifyContent: 'space-between' }]}><Text style={[S.body, { flex: 1 }]}>{f.name}</Text><Pill text={STATUS_LABEL[f.status]} color={STATUS_COLOR[f.status]} /></View>
            <Text style={S.dim}>{f.detail}{f.needs ? `  Needs: ${f.needs}.` : ''}</Text>
          </View>
        )) : null}
      </Card>
      <Text style={[S.dim, { textAlign: 'center' }]}>Alice 0.7.1. Unofficial; not affiliated with the glasses maker.</Text>
    </ScrollView>
  );
}

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const t = <Text style={{ color: on ? '#FFFFFF' : C.ink, fontFamily: on ? F.semibold : F.regular, fontSize: 14, paddingVertical: 7, paddingHorizontal: 12 }}>{label}</Text>;
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      {on ? <View style={{ borderRadius: 999, backgroundColor: C.violet }}>{t}</View> : <Glass radius={999}>{t}</Glass>}
    </Pressable>
  );
}
