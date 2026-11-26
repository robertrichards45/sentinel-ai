import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useSettings } from '../hooks';
import { updateSettings } from '../settings';
import { serverStatus, DEFAULT_SERVER } from '../ai';
import { addModePack } from '../modeStore';
import { glasses, WRITES_ENABLED } from '../ble';
import { FEATURES, STATUS_LABEL, Status } from '../features';
import { Btn, C, Card, Field, Pill, S, Toggle, Title } from '../ui';

const STATUS_COLOR: Record<Status, string> = { tested: C.mint, built: C.violet, partial: C.amber, blocked: C.red, unsupported: C.sub, proposed: C.sub };

export default function Settings() {
  const s = useSettings();
  const [srv, setSrv] = useState<{ ok: boolean; detail: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [pack, setPack] = useState('');
  const [showMatrix, setShowMatrix] = useState(false);
  const [advanced, setAdvanced] = useState(false);
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
        <Toggle label="Glasses button starts Alice (experimental)" hint="Uses the camera-busy signal; may also fire when you take a photo." value={s.buttonTriggersAssistant} onChange={(v) => updateSettings({ buttonTriggersAssistant: v })} />
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
      <Text style={[S.dim, { textAlign: 'center' }]}>Alice 0.3.0. Unofficial; not affiliated with the glasses maker.</Text>
    </ScrollView>
  );
}
