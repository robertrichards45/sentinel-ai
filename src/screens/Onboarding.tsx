/** First launch: "Which glasses do you have?" Alice then uses the right connector and shows only what they support. */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GLASSES, GlassesModel } from '../glasses/catalog';
import { updateSettings } from '../settings';
import { Btn, C, F, Glass, S } from '../ui';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [pick, setPick] = useState<GlassesModel | null>(null);
  const chosen = GLASSES.find((g) => g.id === pick);
  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, { paddingTop: 40 }]}>
      <Text style={S.h1}>Which glasses do you have?</Text>
      <Text style={S.dim}>Alice works with most AI and audio glasses. You can change this later in Settings.</Text>
      {GLASSES.map((g) => {
        const on = pick === g.id;
        return (
          <Pressable key={g.id} onPress={() => setPick(g.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={g.name}>
            <Glass style={{ padding: 16, gap: 6, borderColor: on ? C.violet : C.glassBorder, borderWidth: on ? 2 : 1 }}>
              <View style={S.row}>
                <Ionicons name={g.id === 'none' ? 'phone-portrait-outline' : 'glasses-outline'} size={20} color={on ? C.ink : C.sub} />
                <Text style={[S.h2, { flex: 1 }]}>{g.name}</Text>
                {on ? <Ionicons name="checkmark-circle" size={22} color={C.violet} /> : null}
              </View>
              <Text style={S.dim}>{g.examples}</Text>
              {g.comingSoon ? <Text style={[S.dim, { color: C.amber }]}>{g.comingSoon}</Text> : null}
            </Glass>
          </Pressable>
        );
      })}
      {chosen ? (
        <Glass style={{ padding: 16, gap: 6 }}>
          <Text style={S.h2}>Getting started</Text>
          {chosen.setupTips.map((t) => <Text key={t} style={S.body}>• {t}</Text>)}
        </Glass>
      ) : null}
      <Btn title="Continue" disabled={!pick} onPress={async () => { if (!pick) return; await updateSettings({ glassesModel: pick }); onDone(); }} />
    </ScrollView>
  );
}
