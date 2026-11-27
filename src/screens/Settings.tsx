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
import { diaryEvents } from '../diary';
import { previewLiveVoice } from '../live';
import { glassesInfo } from '../glasses/catalog';
import { Btn, C, Card, F, Field, Glass, Pill, S, Toggle, Title } from '../ui';
import { VOICES, VOICE_STYLES, speak } from '../voice';
import { allModes } from '../modeStore';
import { connSecret, homeControl } from '../connections';
import { showTour } from '../triggers';

const STATUS_COLOR: Record<Status, string> = { tested: C.mint, built: C.violet, partial: C.amber, blocked: C.red, unsupported: C.sub, proposed: C.sub };

export default function Settings() {
  const s = useSettings();
  const gInfo = glassesInfo(s.glassesModel || 'g2');
  const [srv, setSrv] = useState<{ ok: boolean; detail: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [pack, setPack] = useState('');
  const [showMatrix, setShowMatrix] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [perMode, setPerMode] = useState(false);
  const check = () => { setSrv(null); serverStatus().then(setSrv); };
  useEffect(check, [s.serverUrl]);
  const [, bump] = useState(0);
  useEffect(() => { const off = glasses.on((e: any) => { if (e.kind === 'command' || e.kind === 'link') bump((x) => x + 1); }); return () => { off(); }; }, []);

  const exportLog = async () => {
    const f = new File(Paths.cache, `alice-ble-${Date.now()}.jsonl`);
    f.create();
    await f.write(glasses.log.map((l) => JSON.stringify(l)).join('\n'));
    await Sharing.shareAsync(f.uri, { mimeType: 'text/plain', dialogTitle: 'Share Bluetooth log' });
  };

  // Preview with the voice you will actually hear: the live conversation voice when Live conversation is on.
  const preview = (text = "Hi, I'm Alice. This is how I sound.") => (s.liveConversation ? previewLiveVoice(text).catch(() => speak(text)) : speak(text));

  const exportDiary = async () => {
    const f = new File(Paths.cache, `alice-diary-${Date.now()}.jsonl`);
    f.create();
    await f.write(diaryEvents().map((l) => JSON.stringify(l)).join('\n'));
    await Sharing.shareAsync(f.uri, { mimeType: 'text/plain', dialogTitle: 'Share diagnostic diary' });
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
                onPress={async () => { await updateSettings({ voice: v.id }); preview(); }}>
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
            <Chip key={v.id} on={s.voiceStyle === v.id} label={v.label} onPress={async () => { await updateSettings({ voiceStyle: v.id }); preview(); }} />
          ))}
        </View>
        <View style={S.row}>
          <Text style={[S.body, { flex: 1 }]}>Pitch {s.voicePitch === 0 ? 'normal' : s.voicePitch < 0 ? `deeper ${-s.voicePitch}` : `higher ${s.voicePitch}`}</Text>
          <Btn kind="ghost" title="−" onPress={() => updateSettings({ voicePitch: Math.max(-2, s.voicePitch - 1) })} />
          <Btn kind="ghost" title="+" onPress={() => updateSettings({ voicePitch: Math.min(2, s.voicePitch + 1) })} />
        </View>
        <Text style={S.dim}>Previews play in the same voice you hear in conversation. Pitch only applies when Live conversation is off.</Text>
        <View style={S.row}>
          <Btn style={{ flex: 1 }} kind="ghost" icon="volume-high-outline" title="Hear it" onPress={() => preview()} />
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

      <Card title="Your glasses" right={<Btn kind="ghost" title="Change" onPress={() => updateSettings({ glassesModel: '' })} />}>
        <Text style={S.body}>{gInfo.name}</Text>
        <Text style={S.dim}>{gInfo.examples}</Text>
        {gInfo.comingSoon ? <Text style={[S.dim, { color: C.amber }]}>{gInfo.comingSoon}</Text> : null}
      </Card>

      {gInfo.caps.dataLink ? <Card title="Talk through your glasses">
        <Text style={S.dim}>Use your glasses' own AI button or wake word, then just talk. Alice hears you through the glasses' microphone and answers, on any screen and while your phone is locked, as long as Alice is open in the background and the glasses are connected.</Text>
        <Text style={S.dim}>Also works: a Siri shortcut with "Open URLs" alice://talk named "Alice", then "Hey Siri, Alice".</Text>
      </Card> : null}

      <Card title="Voice">
        <Toggle label="Daily heads-up" hint="The first time your glasses connect each day, Alice tells you what's on your calendar today." value={s.dailyHeadsUp} onChange={(v) => updateSettings({ dailyHeadsUp: v })} />
        <Toggle label={'"Hey Alice"'} hint={'Say "Hey Alice" to start talking, no Siri. Uses the phone\'s microphone and Apple\'s on-device recognition (nothing is sent until she wakes). Works while Alice is open or in the background, not after you swipe her closed.'} value={s.heyAlice} onChange={(v) => updateSettings({ heyAlice: v })} />
        {gInfo.caps.dataLink ? <>
        <Toggle label="Conversation through the glasses" hint="Press the glasses button and just talk. Alice hears when you stop, answers, then listens for a follow-up, like the Wheat app." value={s.glassesConversation} onChange={(v) => updateSettings({ glassesConversation: v })} />
        <Toggle label="Hear Alice in the glasses" hint="Connects the glasses to your iPhone as Bluetooth headphones (the same way the Wheat app does), so Alice's voice, and music, play through them." value={s.glassesAudio} onChange={(v) => updateSettings({ glassesAudio: v })} />
        {s.glassesAudio ? <View style={[S.row, { justifyContent: 'space-between' }]}><Text style={[S.dim, { flex: 1 }]}>{glasses.lastCommand ? (glasses.lastCommand.error ? `Couldn't reach the glasses: ${glasses.lastCommand.error}` : `Headphones request sent ${new Date(glasses.lastCommand.at).toLocaleTimeString()}`) : 'Waiting for the glasses to connect'}</Text><Btn kind="ghost" title="Send again" onPress={() => glasses.syncAudio(true)} /></View> : null}
        </> : null}
        <Toggle label="Use glasses microphone" hint="When the glasses are connected as headphones" value={s.preferGlassesMic} onChange={(v) => updateSettings({ preferGlassesMic: v })} />
        <Field label="Translate into" value={s.translateTo} onChange={(v) => updateSettings({ translateTo: v })} />
        <Field label="Voice language (e.g. en-US)" value={s.voiceLanguage} onChange={(v) => updateSettings({ voiceLanguage: v })} />
        <View style={S.row}>
          <Text style={[S.body, { flex: 1 }]}>Speech speed {s.speechRate.toFixed(1)}×</Text>
          <Btn kind="ghost" title="−" onPress={() => updateSettings({ speechRate: Math.max(0.5, +(s.speechRate - 0.1).toFixed(1)) })} />
          <Btn kind="ghost" title="+" onPress={() => updateSettings({ speechRate: Math.min(1.6, +(s.speechRate + 0.1).toFixed(1)) })} />
        </View>
      </Card>

      <Btn icon="sparkles-outline" title="What Alice can do" onPress={showTour} />

      <Connections />

      <Card title="Listening">
        <Toggle label="Ignore background noise" hint="Alice learns your room's normal noise (TV, fan, people nearby) and only listens when someone is clearly talking to her. Turn off if she misses you when you speak quietly." value={s.noiseFilter} onChange={(v) => updateSettings({ noiseFilter: v })} />
      </Card>

      <Card title="Catch-ups and recaps">
        <Toggle label="Catch me up" hint="When your glasses reconnect after 2+ hours away, Alice tells you what's left today, your timers and anything coming up." value={s.catchUp} onChange={(v) => updateSettings({ catchUp: v })} />
        <Toggle label="Evening recap" hint="A notification each evening. Tap it and Alice recaps your day: calendar, finished reminders, notes and meetings." value={s.eveningRecap} onChange={(v) => updateSettings({ eveningRecap: v })} />
        {s.eveningRecap ? (
          <View style={S.row}>
            <Text style={[S.body, { flex: 1 }]}>Recap at {((s.recapHour + 11) % 12) + 1} {s.recapHour < 12 ? 'AM' : 'PM'}</Text>
            <Btn kind="ghost" title="−" onPress={() => updateSettings({ recapHour: (s.recapHour + 23) % 24 })} />
            <Btn kind="ghost" title="+" onPress={() => updateSettings({ recapHour: (s.recapHour + 1) % 24 })} />
          </View>
        ) : null}
      </Card>

      <Card title="Read with Alice">
        <Text style={S.dim}>Copy a link or some text, then say "Alice, read me this" (or "sum this up"). To read straight from the Share button: in the Shortcuts app, make a shortcut that shows in the Share Sheet, receives URLs and text, runs URL Encode on the Shortcut Input, then opens alice://read?url=[URL Encoded Text]. Name it Read with Alice. Ask me and I'll walk you through it.</Text>
      </Card>

      <Card title="Words Alice should know">
        <Text style={S.dim}>Names or words she keeps mishearing (like Kylee). She also knows your contacts' names and the people and places you've told her about. You can say "Alice, learn the name Kylee, K-Y-L-E-E."</Text>
        <NameList items={s.customWords ?? []} onChange={(v) => updateSettings({ customWords: v })} placeholder="e.g. Kylee" />
      </Card>

      <Card title="Siri Shortcuts">
        <Text style={S.dim}>Type the exact names of Shortcuts you want Alice to run (smart-home lights, thermostat, scenes, anything in the Shortcuts app). Then say "Alice, lights off".</Text>
        <NameList items={s.shortcuts ?? []} onChange={(v) => updateSettings({ shortcuts: v })} placeholder="e.g. Lights Off" />
      </Card>

      <Card title="Emergency help">
        <Text style={S.dim}>Say "Alice, I need help" and she gets a text with your location ready for these people (you tap Send), then offers to call 911. Use names from your Contacts or phone numbers.</Text>
        <NameList items={s.emergencyContacts ?? []} onChange={(v) => updateSettings({ emergencyContacts: v })} placeholder="e.g. Mom or 555-123-4567" />
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
        <Btn kind="ghost" title="Share diagnostic diary" onPress={exportDiary} />
        <Text style={S.dim}>The diary records events only (connections, commands, reply times, errors), never what you say, except problems you report ("Alice, log a problem: ..."). It is also sent to Alice's server unless Privacy mode is on.</Text>
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
      <Text style={[S.dim, { textAlign: 'center' }]}>Alice 0.10.0. Unofficial; not affiliated with the glasses maker.</Text>
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

/** Small add/remove list for names (shortcuts, emergency contacts). */
function NameList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('');
  return (
    <View style={{ gap: 8 }}>
      {items.map((it) => (
        <View key={it} style={[S.row, { justifyContent: 'space-between' }]}>
          <Text style={[S.body, { flex: 1 }]}>{it}</Text>
          <Btn kind="ghost" title="✕" onPress={() => onChange(items.filter((x) => x !== it))} />
        </View>
      ))}
      <Field label="Add" value={v} onChange={setV} placeholder={placeholder} />
      <Btn title="Add" disabled={!v.trim() || items.includes(v.trim())} onPress={() => { onChange([...items, v.trim()].slice(0, 30)); setV(''); }} />
    </View>
  );
}

/** Settings, Connections: Home Assistant, IFTTT and custom webhooks. Secrets go to the Keychain. */
function Connections() {
  const s = useSettings();
  const [token, setToken] = useState('');
  const [key, setKey] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [msg, setMsg] = useState('');
  const [hookName, setHookName] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  useEffect(() => { connSecret.get('ha-token').then((t) => setHasToken(!!t)); connSecret.get('ifttt-key').then((k) => setHasKey(!!k)); }, []);
  return (
    <Card title="Connections">
      <Text style={S.dim}>Home Assistant controls almost any smart-home device (lights, plugs, locks, thermostats, garage, TV, many cars). Paste its address (use the remote Nabu Casa address so it works away from home) and a long-lived access token (Home Assistant: your profile, Security, Long-lived access tokens).</Text>
      <Field label="Home Assistant address" value={s.homeAssistantUrl} onChange={(v) => updateSettings({ homeAssistantUrl: v.trim() })} placeholder="https://yourname.ui.nabu.casa" />
      <Field label={hasToken ? 'Access token (saved — paste to replace)' : 'Access token'} value={token} onChange={setToken} placeholder="eyJ…" secure />
      <View style={[S.row, { gap: 8, flexWrap: 'wrap' }]}>
        <Btn title="Save token" disabled={!token.trim()} onPress={async () => { await connSecret.set('ha-token', token); setToken(''); setHasToken(true); setMsg('Token saved in the Keychain.'); }} />
        <Btn kind="ghost" title="Test" disabled={!s.homeAssistantUrl} onPress={async () => setMsg(await homeControl('what time is it'))} />
      </View>
      <Text style={S.dim}>IFTTT: your Webhooks key (ifttt.com/maker_webhooks, Documentation). Then "Alice, trigger start car" fires the applet named start_car.</Text>
      <Field label={hasKey ? 'IFTTT key (saved — paste to replace)' : 'IFTTT Webhooks key'} value={key} onChange={setKey} placeholder="key" secure />
      <Btn kind="ghost" title="Save IFTTT key" disabled={!key.trim()} onPress={async () => { await connSecret.set('ifttt-key', key); setKey(''); setHasKey(true); setMsg('IFTTT key saved in the Keychain.'); }} />
      <Text style={S.dim}>Custom connections (Zapier, Make, any https webhook): give it a name you'll say, like "Morning routine".</Text>
      {(s.webhooks ?? []).map((w) => (
        <View key={w.name} style={[S.row, { justifyContent: 'space-between' }]}>
          <Text style={[S.body, { flex: 1 }]}>{w.name}</Text>
          <Btn kind="ghost" title="✕" onPress={() => updateSettings({ webhooks: s.webhooks.filter((x) => x.name !== w.name) })} />
        </View>
      ))}
      <Field label="Name" value={hookName} onChange={setHookName} placeholder="Morning routine" />
      <Field label="Webhook address" value={hookUrl} onChange={setHookUrl} placeholder="https://hooks.zapier.com/…" />
      <Btn kind="ghost" title="Add connection" disabled={!hookName.trim() || !/^https:\/\//i.test(hookUrl.trim())} onPress={() => { updateSettings({ webhooks: [...(s.webhooks ?? []), { name: hookName.trim(), url: hookUrl.trim() }].slice(0, 30) }); setHookName(''); setHookUrl(''); }} />
      {msg ? <Text style={S.dim}>{msg}</Text> : null}
    </Card>
  );
}
