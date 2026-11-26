import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { glasses } from '../ble';
import { useGlasses, useSettings } from '../hooks';
import { updateSettings } from '../settings';
import { GlassesFrame } from '../Lens';
import { Btn, Card, C, F, Ionicons, Line, S, Title, Toggle } from '../ui';

const LINK: Record<string, [string, string]> = {
  connected: ['Connected', C.teal], connecting: ['Connecting', C.amber], scanning: ['Searching', C.amber],
  idle: ['Not connected', C.sub], 'bluetooth-off': ['Bluetooth off', C.red], error: ['Not found', C.red],
};

export default function Home() {
  const g = useGlasses();
  const s = useSettings();
  const [label, color] = LINK[g.link] ?? ['Unknown', C.sub];
  const connected = g.link === 'connected';
  const busySec = g.busy && g.busySince ? Math.round((Date.now() - g.busySince) / 1000) : 0;
  const big = { fontFamily: F.heavy, fontSize: 30, color: C.ink, letterSpacing: -0.5 };

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <Title sub={g.ssid ? `Your glasses: ${g.ssid}` : 'For G2 AI Smart Glasses Pro'}>SENTINEL</Title>

      {g.busy ? (
        <Card tone="alert">
          <View style={S.row}><Ionicons name="radio-button-on" size={18} color={C.red} /><Text style={[S.h2, { color: C.red }]}>Camera is recording{busySec ? ` (${busySec} s)` : ''}</Text></View>
          <Text style={S.dim}>Don't plug the glasses into USB until it stops. That's when the storage bug overwrote a photo.</Text>
        </Card>
      ) : null}

      <GlassesFrame connected={connected}
        left={<>
          <Ionicons name={connected ? 'bluetooth' : 'bluetooth-outline'} size={22} color={color} />
          <Text style={{ fontFamily: F.semibold, fontSize: 15, color, marginTop: 4 }}>{label}</Text>
        </>}
        right={<>
          <Text style={big}>{g.mediaCount ?? '–'}</Text>
          <Text style={S.dim}>{g.newMediaSinceImport ? `${g.newMediaSinceImport} new` : 'photos & videos'}</Text>
        </>} />

      {g.linkDetail && !connected ? <Text style={[S.dim, { textAlign: 'center' }]}>{g.linkDetail}</Text> : null}
      {connected
        ? <Btn kind="ghost" icon="close-circle-outline" title="Disconnect" onPress={() => glasses.disconnect()} />
        : <Btn icon="glasses-outline" title="Connect glasses" onPress={() => glasses.connect().catch(() => {})} />}

      <Card title="Status">
        <Line label="Battery" value={g.heartbeat !== undefined ? `${g.heartbeat}%` : '–'} />
        <Text style={[S.dim, { marginTop: -6 }]}>Reported by the glasses; most likely battery percent.</Text>
        <Line label="Glasses clock" value={g.clockSkewSec === undefined ? '–' : Math.abs(g.clockSkewSec) > 120 ? `${Math.round(g.clockSkewSec / 60)} min off` : 'Correct'}
          valueStyle={g.clockSkewSec !== undefined && Math.abs(g.clockSkewSec) > 120 ? { color: C.amber } : undefined} />
        {!connected ? <Text style={S.dim}>Close Wheat Pro first. The glasses talk to one app at a time.</Text> : null}
      </Card>

      <Card title="Privacy">
        <Toggle label="Privacy mode" hint="Pauses all AI. Nothing leaves this iPhone." value={s.privacyMode} onChange={(v) => updateSettings({ privacyMode: v })} />
        <Toggle label="Announce recording" hint={'Says "camera active" when the glasses start recording.'} value={s.announceRecording} onChange={(v) => updateSettings({ announceRecording: v })} />
      </Card>
    </ScrollView>
  );
}
