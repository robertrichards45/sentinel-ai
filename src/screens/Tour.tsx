/** "What Alice can do": shown once after setup, and any time from Settings. */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CAPABILITIES } from '../capabilities';
import { updateSettings } from '../settings';
import { Btn, C, F, Glass, S } from '../ui';

export function Tour({ onDone }: { onDone: () => void }) {
  const done = () => { updateSettings({ toured: true }); onDone(); };
  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, { paddingTop: 40, paddingBottom: 140 }]}>
      <Text style={S.h1}>Meet Alice</Text>
      <Text style={S.dim}>Say "Hey Alice", press your glasses button, or tap the orb on the Talk tab. Here's what you can ask.</Text>
      {CAPABILITIES.map((c) => (
        <Glass key={c.title} style={{ padding: 16, gap: 8 }}>
          <View style={S.row}>
            <Ionicons name={c.icon as any} size={20} color={C.violet} />
            <Text style={[S.h2, { flex: 1 }]}>{c.title}</Text>
          </View>
          {c.say.map((x) => <Text key={x} style={{ fontFamily: F.regular, fontSize: 15, color: C.ink }}>“{x}”</Text>)}
          {c.note ? <Text style={S.dim}>{c.note}</Text> : null}
        </Glass>
      ))}
      <Btn title="Start talking to Alice" onPress={done} />
    </ScrollView>
  );
}
