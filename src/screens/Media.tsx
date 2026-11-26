import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { importFromFiles, ImportResult } from '../media';
import { probeGlassesWifi } from '../wifiProbe';
import { useGlasses } from '../hooks';
import { Btn, C, Card, S, Title } from '../ui';

const COLOR: Record<ImportResult['status'], string> = { saved: C.good, duplicate: C.dim, damaged: C.bad, error: C.warn };

export default function Media() {
  const g = useGlasses();
  const [results, setResults] = useState<ImportResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<string[]>([]);

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <Title>Media</Title>
      <Card title="On the glasses">
        <Text style={S.body}>{g.mediaCount !== undefined ? `${g.mediaCount} files stored, ${g.newMediaSinceImport} new since last import` : 'Connect the glasses to see the count.'}</Text>
      </Card>

      <Card title="Import from Files / USB">
        <Text style={S.dim}>Open the glasses' drive (USB-C iPhones show it in Files) or files you AirDropped from your PC. SENTINEL checks every file, skips duplicates, flags damaged ones and fixes the one-month-behind photo dates. Originals are never changed.</Text>
        <Btn title={busy ? 'Importing…' : 'Choose files'} disabled={busy} onPress={async () => {
          setBusy(true); setResults([]);
          try { await importFromFiles((r) => setResults((x) => [...x, r])); }
          catch (e: any) { setResults([{ name: 'Import', status: 'error', note: String(e?.message ?? e) }]); }
          finally { setBusy(false); }
        }} />
        {results.map((r, i) => (
          <Text key={i} style={[S.dim, { color: COLOR[r.status] }]}>{r.status.toUpperCase()}  {r.name}{r.note ? ` — ${r.note}` : ''}</Text>
        ))}
      </Card>

      <Card title="Wi-Fi transfer">
        <Text style={[S.dim, { color: C.warn }]}>Not available yet: needs the glasses' Bluetooth command, which we'll get from the iPhone Bluetooth log.</Text>
        <Text style={S.dim}>Diagnostic: if you know the password and have joined {g.ssid ?? 'the G2 Wi-Fi'} in iPhone Settings, run this read-only probe and send me the result.</Text>
        <Btn kind="ghost" title="Probe glasses Wi-Fi" onPress={async () => { setProbe([]); await probeGlassesWifi((l) => setProbe((p) => [...p, l])); }} />
        {probe.map((l, i) => <Text key={i} style={S.dim}>{l}</Text>)}
      </Card>
    </ScrollView>
  );
}
