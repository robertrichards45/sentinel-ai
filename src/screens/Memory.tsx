import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, Share, Text, View } from 'react-native';
import { photoToPlanner } from '../photoFile';
import { scanDocument } from '../docScan';
import { runAction } from '../actions';
import { validateAction, Action } from '../intents';
import { speak } from '../voice';
import { listPeople, onPeople, forgetPerson } from '../people';
import type { Person } from '../peopleCore';
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
  const [people, setPeople] = useState<Person[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const filePhoto = async (lib: boolean) => {
    setPhotoBusy(true); setPhotoMsg('Reading the picture…');
    try {
      const out = await photoToPlanner('auto', lib, (x) => { const v = validateAction(x, []); return v ? runAction(v as Action) : Promise.resolve('That did not work.'); });
      setPhotoMsg(out); speak(out).catch(() => {});
    } catch (e: any) { setPhotoMsg(String(e?.message ?? e)); }
    finally { setPhotoBusy(false); }
  };
  useEffect(() => { const load = () => listPeople().then((l) => setPeople(l.slice().sort((a, b) => a.name.localeCompare(b.name)))); load(); return onPeople(load); }, []);
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

      <Card title={`People (${people.length})`}>
        {people.length ? people.map((p) => (
          <View key={p.id} style={[S.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
            <Text style={[S.body, { flex: 1 }]}><Text style={{ fontWeight: '600' }}>{p.name}</Text>{p.notes.length ? ` · ${p.notes.join('; ')}` : ''}</Text>
            <Btn kind="ghost" title="✕" onPress={() => Alert.alert(`Forget ${p.name}?`, '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Forget', style: 'destructive', onPress: () => forgetPerson(p.id) }])} />
          </View>
        )) : <Text style={S.dim}>Say "This is Mike from work, he's into fishing." Later ask "What do I know about Mike?"</Text>}
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

      <Card title={`Notes & photos (${m.notes.length})`}>
        <View style={[S.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Btn title="📷 Photo to calendar or notes" disabled={photoBusy} onPress={() => filePhoto(false)} />
          <Btn kind="ghost" title="From my photos" disabled={photoBusy} onPress={() => filePhoto(true)} />
          <Btn kind="ghost" title="📄 Scan a document" disabled={photoBusy} onPress={async () => { setPhotoBusy(true); setPhotoMsg('Scanning…'); try { const o = await scanDocument(); setPhotoMsg(o); speak(o).catch(() => {}); } catch (e: any) { setPhotoMsg(String(e?.message ?? e)); } finally { setPhotoBusy(false); } }} />
        </View>
        {photoMsg ? <Text style={S.dim}>{photoMsg}</Text> : null}
        {m.notes.slice().reverse().slice(0, 30).map((n) => (
          <View key={n.id} style={[S.row, { alignItems: 'flex-start', gap: 8 }]}>
            {n.image ? <Image source={{ uri: n.image }} style={{ width: 56, height: 56, borderRadius: 8 }} accessibilityLabel="Photo for this note" /> : null}
            <Text style={[S.body, { flex: 1 }]}>{n.text} <Text style={S.dim}>({new Date(n.created).toLocaleDateString()})</Text></Text>
            <Btn kind="ghost" title="✕" onPress={() => memory.deleteNote(n.id)} />
          </View>
        ))}
        {!m.notes.length ? <Text style={S.dim}>Say "take a note…", or take a photo of a flyer or appointment card and Alice files it.</Text> : null}
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
