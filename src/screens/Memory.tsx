import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { memory } from '../memory';
import { useMemory, useSettings } from '../hooks';
import { updateSettings } from '../settings';
import { Btn, C, Card, S, Toggle, Field, Title } from '../ui';

export default function Memory() {
  const m = useMemory();
  const s = useSettings();
  const [fact, setFact] = useState('');

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad} keyboardShouldPersistTaps="handled">
      <Title>Memory</Title>
      <Card>
        <Toggle label="Personal memory" hint='SENTINEL only remembers what you ask it to ("remember that…"). Stored on this iPhone only.' value={s.memoryEnabled} onChange={(v) => updateSettings({ memoryEnabled: v })} />
      </Card>

      <Card title={`Remembered facts (${m.facts.length})`}>
        {m.facts.length ? m.facts.map((f) => (
          <View key={f.id} style={[S.row, { justifyContent: 'space-between' }]}>
            <Text style={[S.body, { flex: 1 }]}>{f.text}</Text>
            <Btn kind="ghost" title="✕" onPress={() => memory.forget(f.text)} />
          </View>
        )) : <Text style={S.dim}>Nothing yet. Try: "Remember that my truck is a 2019 F-150."</Text>}
        <Field label="Add a fact" value={fact} onChange={setFact} placeholder="e.g. I'm allergic to penicillin" />
        <Btn title="Add" disabled={!fact.trim()} onPress={() => { memory.remember(fact.trim()); setFact(''); }} />
      </Card>

      <Card title={`Notes (${m.notes.length})`}>
        {m.notes.slice().reverse().slice(0, 30).map((n) => (
          <Text key={n.id} style={S.body}>• {n.text} <Text style={S.dim}>({new Date(n.created).toLocaleDateString()})</Text></Text>
        ))}
        {!m.notes.length ? <Text style={S.dim}>Say "take a note…" to add one.</Text> : null}
      </Card>

      <Card title="Conversation context">
        <Text style={S.dim}>{m.history.length} recent messages are sent with each question so follow-ups make sense.</Text>
        <Btn kind="ghost" title="Clear conversation" onPress={() => memory.clearHistory()} />
      </Card>

      <Btn kind="danger" title="Erase all memory" onPress={() => Alert.alert('Erase everything SENTINEL remembers?', 'Facts, notes and conversation history will be deleted from this iPhone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Erase', style: 'destructive', onPress: () => memory.wipeAll() },
      ])} />
      <Text style={[S.dim, { color: C.dim }]}>Memory is sent to OpenAI only as context for your questions (with "store" turned off) and never when Privacy mode is on.</Text>
    </ScrollView>
  );
}
