import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';
import { listMeetings, onMeetings, deleteMeeting, resummarize, Meeting, takingNotes, startNotes } from '../meetingNotes';
import { memory } from '../memory';
import { useMemory, useSettings } from '../hooks';
import { updateSettings } from '../settings';
import { Btn, C, Card, S, Toggle, Field, Title } from '../ui';

export default function Memory() {
  const m = useMemory();
  const s = useSettings();
  const [fact, setFact] = useState('');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { const load = () => listMeetings().then((l) => setMeetings(l.slice().reverse())); load(); return onMeetings(load); }, []);

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad} keyboardShouldPersistTaps="handled">
      <Title>Memory</Title>
      <Card>
        <Toggle label="Personal memory" hint='Alice keeps lasting facts about you (what you drive, people, plans), whether you say "remember" or not. Stored on this iPhone; delete any of them below.' value={s.memoryEnabled} onChange={(v) => updateSettings({ memoryEnabled: v })} />
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

      <Card title={`Meeting notes (${meetings.length})`}>
        {meetings.length ? meetings.slice(0, 30).map((mt) => (
          <View key={mt.id} style={{ gap: 6 }}>
            <Btn kind="ghost" title={`${open === mt.id ? '▾' : '▸'} ${mt.title} · ${new Date(mt.started).toLocaleDateString()}${mt.ended ? '' : ' (recording)'}`} onPress={() => setOpen(open === mt.id ? null : mt.id)} />
            {open === mt.id ? (
              <View style={{ gap: 6 }}>
                <Text style={S.body}>{mt.summary || (mt.ended ? 'No summary yet.' : 'Still recording…')}</Text>
                <View style={[S.row, { gap: 8, flexWrap: 'wrap' }]}>
                  <Btn kind="ghost" title="Share" onPress={() => Share.share({ message: `${mt.title}\n${new Date(mt.started).toLocaleString()}\n\n${mt.summary ?? ''}\n\nTranscript:\n${mt.transcript}` })} />
                  {mt.ended && mt.transcript && !mt.summary ? <Btn kind="ghost" title="Write summary" onPress={() => resummarize(mt.id).catch(() => Alert.alert('Could not write the summary', 'Check your internet and try again.'))} /> : null}
                  {mt.ended ? <Btn kind="ghost" title="Delete" onPress={() => Alert.alert('Delete these notes?', mt.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteMeeting(mt.id) }])} /> : null}
                </View>
              </View>
            ) : null}
          </View>
        )) : <Text style={S.dim}>Say "Alice, take notes" at the start of a meeting. Press the glasses button or tap Stop notes when it's over.</Text>}
        {!takingNotes() ? <Btn title="Start taking notes" onPress={() => startNotes().catch((e) => Alert.alert('Could not start', String(e?.message ?? e)))} /> : null}
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

      <Btn kind="danger" title="Erase all memory" onPress={() => Alert.alert('Erase everything Alice remembers?', 'Facts, notes and conversation history will be deleted from this iPhone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Erase', style: 'destructive', onPress: () => memory.wipeAll() },
      ])} />
      <Text style={[S.dim, { color: C.dim }]}>Memory is sent to Alice's server only as context for your questions, and never when Privacy mode is on.</Text>
    </ScrollView>
  );
}
