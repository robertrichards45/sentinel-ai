import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { glasses } from '../ble';
import { useGlasses, useSettings } from '../hooks';
import { updateSettings } from '../settings';
import { Btn, Card, C, Pill, S, Toggle } from '../ui';

const LINK_TEXT: Record<string, [string, string]> = {
  connected: ['Connected', C.good], connecting: ['Connecting…', C.warn], scanning: ['Searching…', C.warn],
  idle: ['Not connected', C.dim], 'bluetooth-off': ['Bluetooth is off', C.bad], error: ['Problem', C.bad],
};

export default function Home() {
  const g = useGlasses();
  const s = useSettings();
  const [label, color] = LINK_TEXT[g.link] ?? ['?', C.dim];
  const busySec = g.busy && g.busySince ? Math.round((Date.now() - g.busySince) / 1000) : 0;

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <Text style={S.h1}>SENTINEL AI</Text>

      {g.busy ? (
        <View style={[S.card, { borderColor: C.bad, backgroundColor: '#2A1416' }]}>
          <Text style={[S.h2, { color: C.bad }]}>● Camera / mic active {busySec ? `(${busySec}s)` : ''}</Text>
          <Text style={S.dim}>Don't plug the glasses into USB while this is on — that's when the storage bug overwrote a photo.</Text>
        </View>
      ) : null}

      <Card title="Glasses" right={<Pill text={label} color={color} />}>
        {g.linkDetail ? <Text style={S.dim}>{g.linkDetail}</Text> : null}
        <Text style={S.body}>Wi-Fi name: {g.ssid ?? '—'}</Text>
        <Text style={S.body}>Stored photos/videos: {g.mediaCount ?? '—'}{g.newMediaSinceImport ? `  (${g.newMediaSinceImport} new)` : ''}</Text>
        <Text style={S.body}>Battery (likely): {g.heartbeat !== undefined ? `${g.heartbeat}%` : '—'}</Text>
        {g.clockSkewSec !== undefined && Math.abs(g.clockSkewSec) > 120 ? <Text style={[S.dim, { color: C.warn }]}>Glasses clock is off by {Math.round(g.clockSkewSec / 60)} min.</Text> : null}
        <View style={[S.row, { marginTop: 4 }]}>
          {g.link === 'connected'
            ? <Btn kind="ghost" title="Disconnect" onPress={() => glasses.disconnect()} />
            : <Btn title="Connect glasses" onPress={() => glasses.connect().catch(() => {})} />}
        </View>
        <Text style={S.dim}>Close Wheat Pro first — the glasses accept one app at a time.</Text>
      </Card>

      <Card title="Privacy">
        <Toggle label="Privacy mode" hint="Stops all cloud AI. Nothing leaves the phone." value={s.privacyMode} onChange={(v) => updateSettings({ privacyMode: v })} />
        <Toggle label='Say "camera active"' hint="Spoken alert when the glasses start recording." value={s.announceRecording} onChange={(v) => updateSettings({ announceRecording: v })} />
      </Card>
    </ScrollView>
  );
}
