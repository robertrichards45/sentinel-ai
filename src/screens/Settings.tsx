import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useSettings } from '../hooks';
import { updateSettings, DEFAULTS } from '../settings';
import { secret } from '../storage';
import { KEY_NAME, testKey } from '../ai';
import { addModePack } from '../modeStore';
import { glasses, WRITES_ENABLED } from '../ble';
import { FEATURES, STATUS_LABEL, Status } from '../features';
import { Btn, C, Card, Field, Pill, S, Toggle } from '../ui';

const STATUS_COLOR: Record<Status, string> = { tested: C.good, built: C.accent, partial: C.warn, blocked: C.bad, unsupported: C.dim, proposed: C.dim };

export default function Settings() {
  const s = useSettings();
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [msg, setMsg] = useState('');
  const [pack, setPack] = useState('');
  const [showMatrix, setShowMatrix] = useState(false);
  useEffect(() => { secret.get(KEY_NAME).then((k) => setHasKey(!!k)); }, []);

  const exportLog = async () => {
    const f = new File(Paths.cache, `sentinel-ble-${Date.now()}.jsonl`);
    f.create();
    await f.write(glasses.log.map((l) => JSON.stringify(l)).join('\n'));
    await Sharing.shareAsync(f.uri, { mimeType: 'text/plain', dialogTitle: 'Share Bluetooth log' });
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad} keyboardShouldPersistTaps="handled">
      <Text style={S.h1}>Settings</Text>

      <Card title="OpenAI" right={<Pill text={hasKey ? 'Key saved' : 'No key'} color={hasKey ? C.good : C.warn} />}>
        <Field label="API key (stored in iOS Keychain, this iPhone only)" value={key} onChange={setKey} secure placeholder="sk-…" />
        <View style={S.row}>
          <Btn title="Save key" disabled={!key.startsWith('sk-')} onPress={async () => { await secret.set(KEY_NAME, key.trim()); setKey(''); setHasKey(true); setMsg('Key saved.'); }} />
          <Btn kind="ghost" title="Test" disabled={!hasKey} onPress={async () => { setMsg('Testing…'); try { setMsg('OpenAI answered: ' + (await testKey())); } catch (e: any) { setMsg(String(e.message ?? e)); } }} />
          <Btn kind="ghost" title="Delete" disabled={!hasKey} onPress={async () => { await secret.del(KEY_NAME); setHasKey(false); setMsg('Key deleted.'); }} />
        </View>
        {msg ? <Text style={S.dim}>{msg}</Text> : null}
        <Field label="Chat / vision model" value={s.chatModel} onChange={(v) => updateSettings({ chatModel: v.trim() || DEFAULTS.chatModel })} />
        <Field label="Speech-to-text model" value={s.transcribeModel} onChange={(v) => updateSettings({ transcribeModel: v.trim() || DEFAULTS.transcribeModel })} />
      </Card>

      <Card title="Voice">
        <Toggle label="Use glasses microphone" hint="When connected as headphones" value={s.preferGlassesMic} onChange={(v) => updateSettings({ preferGlassesMic: v })} />
        <Field label="Translate into" value={s.translateTo} onChange={(v) => updateSettings({ translateTo: v })} />
        <Field label="Voice language (e.g. en-US)" value={s.voiceLanguage} onChange={(v) => updateSettings({ voiceLanguage: v })} />
        <View style={S.row}>
          <Text style={S.body}>Speech speed {s.speechRate.toFixed(1)}×</Text>
          <Btn kind="ghost" title="−" onPress={() => updateSettings({ speechRate: Math.max(0.5, +(s.speechRate - 0.1).toFixed(1)) })} />
          <Btn kind="ghost" title="+" onPress={() => updateSettings({ speechRate: Math.min(1.6, +(s.speechRate + 0.1).toFixed(1)) })} />
        </View>
      </Card>

      <Card title="Behaviour">
        <Toggle label="Confirm before reminders, events, navigation" value={s.confirmActions} onChange={(v) => updateSettings({ confirmActions: v })} />
        <Toggle label="Glasses button starts assistant (experimental)" hint="Uses the camera-busy signal; may also fire when you take a photo." value={s.buttonTriggersAssistant} onChange={(v) => updateSettings({ buttonTriggersAssistant: v })} />
        <View style={S.row}>
          <Text style={S.body}>Low battery alert at {s.lowBatteryAlert}%</Text>
          <Btn kind="ghost" title="−" onPress={() => updateSettings({ lowBatteryAlert: Math.max(5, s.lowBatteryAlert - 5) })} />
          <Btn kind="ghost" title="+" onPress={() => updateSettings({ lowBatteryAlert: Math.min(50, s.lowBatteryAlert + 5) })} />
        </View>
      </Card>

      <Card title="Mode packs">
        <Text style={S.dim}>Paste a JSON mode pack to add new AI modes without updating the app.</Text>
        <Field label="Mode pack JSON" value={pack} onChange={setPack} placeholder='[{"id":"fishing","name":"Fishing","prompt":"…"}]' />
        <Btn kind="ghost" title="Install pack" disabled={!pack} onPress={async () => { const r = await addModePack(pack); setMsg(`Added ${r.added.length} mode(s). ${r.errors.join(' ')}`); setPack(''); }} />
      </Card>

      <Card title="Diagnostics">
        <Text style={S.dim}>Glasses commands: {WRITES_ENABLED ? 'enabled' : 'OFF (read-only)'} · Firmware-update service: always blocked · Packets logged: {glasses.log.length}</Text>
        <Btn kind="ghost" title="Share Bluetooth log" disabled={!glasses.log.length} onPress={exportLog} />
      </Card>

      <Card title="Feature status" right={<Btn kind="ghost" title={showMatrix ? 'Hide' : 'Show'} onPress={() => setShowMatrix(!showMatrix)} />}>
        <Text style={S.dim}>{(['tested', 'built', 'partial', 'blocked', 'unsupported', 'proposed'] as Status[]).map((k) => `${STATUS_LABEL[k]}: ${FEATURES.filter((f) => f.status === k).length}`).join(' · ')}</Text>
        {showMatrix ? FEATURES.map((f) => (
          <View key={f.id} style={{ gap: 2, borderTopWidth: 1, borderColor: C.line, paddingTop: 6 }}>
            <View style={[S.row, { justifyContent: 'space-between' }]}><Text style={[S.body, { flex: 1 }]}>{f.name}</Text><Pill text={STATUS_LABEL[f.status]} color={STATUS_COLOR[f.status]} /></View>
            <Text style={S.dim}>{f.detail}{f.needs ? `  Needs: ${f.needs}.` : ''}</Text>
          </View>
        )) : null}
      </Card>
      <Text style={[S.dim, { textAlign: 'center' }]}>SENTINEL AI 0.1.1 · unofficial · not affiliated with the glasses maker</Text>
    </ScrollView>
  );
}
