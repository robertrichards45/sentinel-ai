import { micExplainsBusy } from '../micState';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { glasses } from '../ble';
import { useGlasses, useMemory, useSettings } from '../hooks';
import { updateSettings } from '../settings';
import { Orb } from '../Orb';
import { Btn, C, Card, F, Glass, Ionicons, Line, Pill, S, Toggle } from '../ui';
import type { Tab } from '../../App';

const LINK: Record<string, [string, string]> = {
  connected: ['Glasses connected', C.mint], connecting: ['Connecting…', C.amber], scanning: ['Looking for your glasses…', C.amber],
  idle: ['Glasses not connected', C.sub], 'bluetooth-off': ['Bluetooth is off', C.red], error: ['Glasses not found', C.red],
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home({ go }: { go: (t: Tab) => void }) {
  const g = useGlasses();
  const s = useSettings();
  const m = useMemory();
  const [label, color] = LINK[g.link] ?? ['Unknown', C.sub];
  const connected = g.link === 'connected';
  const busySec = g.busy && g.busySince ? Math.round((Date.now() - g.busySince) / 1000) : 0;

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <View style={[S.row, { justifyContent: 'space-between', marginTop: 4 }]}>
        <Pill dot text={label} color={color} />
        {g.heartbeat !== undefined ? <Pill dot text={`${g.heartbeat}%`} color={g.heartbeat <= s.lowBatteryAlert ? C.red : C.mint} /> : null}
      </View>

      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Talk to Alice" onPress={() => go('assist')}>
          <Orb size={230} state={s.privacyMode ? 'idle' : g.busy ? 'listening' : 'idle'} />
        </Pressable>
        <Text style={{ fontFamily: F.light, fontSize: 32, lineHeight: 40, color: C.ink, letterSpacing: -0.6, marginTop: 6 }}>{greeting()}.</Text>
        <Text style={[S.dim, { textAlign: 'center', marginTop: 4 }]}>
          {s.privacyMode ? 'Privacy mode is on. Alice is offline.' : 'Tap Alice to talk, or ask below.'}
        </Text>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Ask Alice anything" onPress={() => go('assist')}>
        <Glass radius={999} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 6, paddingVertical: 6 }}>
          <Text style={{ flex: 1, fontFamily: F.regular, fontSize: 16, color: C.sub }}>Ask anything…</Text>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.violet, alignItems: 'center', justifyContent: 'center', shadowColor: C.violet, shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }}>
            <Ionicons name="mic" size={20} color="#FFFFFF" />
          </View>
        </Glass>
      </Pressable>

      {g.busy && !g.aiListening && !micExplainsBusy() && busySec >= 15 ? (
        <Card tone="alert">
          <View style={S.row}><Ionicons name="radio-button-on" size={18} color={C.red} /><Text style={[S.h2, { color: C.red }]}>Glasses camera may be recording{busySec ? ` · ${busySec} s` : ''}</Text></View>
          <Text style={S.dim}>Don't plug the glasses into USB until it stops. Plugging in mid-recording is what overwrote a photo before.</Text>
        </Card>
      ) : null}

      <View style={S.row}>
        <Pressable style={{ flex: 1 }} onPress={() => go('media')} accessibilityRole="button" accessibilityLabel="Photos and videos">
          <Glass style={{ padding: 16, gap: 4 }}>
            <Ionicons name="images" size={20} color={C.pink} />
            <Text style={{ fontFamily: F.displayBold, fontSize: 28, color: C.ink }}>{g.mediaCount ?? '–'}</Text>
            <Text style={S.dim}>{g.newMediaSinceImport ? `${g.newMediaSinceImport} new to import` : 'photos & videos'}</Text>
          </Glass>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => go('memory')} accessibilityRole="button" accessibilityLabel="Memory">
          <Glass style={{ padding: 16, gap: 4 }}>
            <Ionicons name="bookmark" size={20} color={C.cyan} />
            <Text style={{ fontFamily: F.displayBold, fontSize: 28, color: C.ink }}>{m.facts.length}</Text>
            <Text style={S.dim}>things Alice remembers</Text>
          </Glass>
        </Pressable>
      </View>

      <Card title="Glasses">
        <Line label="Clock" value={g.clockSkewSec === undefined ? '–' : Math.abs(g.clockSkewSec) > 120 ? `${Math.round(g.clockSkewSec / 60)} min off` : 'Correct'}
          valueStyle={g.clockSkewSec !== undefined && Math.abs(g.clockSkewSec) > 120 ? { color: C.amber } : undefined} />
        <Line label="Wi-Fi name" value={g.ssid ?? '–'} />
        {g.linkDetail && !connected ? <Text style={S.dim}>{g.linkDetail}</Text> : null}
        {!connected ? <Text style={S.dim}>Close Wheat Pro first. The glasses only talk to one app at a time.</Text> : null}
        {connected
          ? <Btn kind="ghost" icon="close-circle-outline" title="Disconnect" onPress={() => glasses.disconnect()} />
          : <Btn icon="glasses-outline" title="Connect glasses" onPress={() => glasses.connect().catch(() => {})} />}
      </Card>

      <Card title="Privacy">
        <Toggle label="Privacy mode" hint="Pauses all AI. Nothing leaves this iPhone." value={s.privacyMode} onChange={(v) => updateSettings({ privacyMode: v })} />
        <Toggle label="Announce photos and video" hint={'Alice says "Photo saved" after a photo and "Recording video" when a video starts.'} value={s.announceRecording} onChange={(v) => updateSettings({ announceRecording: v })} />
      </Card>
    </ScrollView>
  );
}
