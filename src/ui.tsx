import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, Switch, TextInput } from 'react-native';

export const C = {
  bg: '#0B0F14', card: '#141A22', line: '#223041', text: '#E6EDF3', dim: '#8B98A9',
  accent: '#36C2B4', warn: '#F2B84B', bad: '#F2645A', good: '#4CC38A',
};

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: C.line },
  h1: { color: C.text, fontSize: 24, fontWeight: '700' },
  h2: { color: C.text, fontSize: 17, fontWeight: '600' },
  body: { color: C.text, fontSize: 15, lineHeight: 21 },
  dim: { color: C.dim, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { color: C.text, backgroundColor: '#0E141B', borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 10, fontSize: 15 },
});

export function Btn({ title, onPress, kind = 'primary', disabled, style }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; style?: ViewStyle }) {
  const bg = kind === 'primary' ? C.accent : kind === 'danger' ? C.bad : 'transparent';
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [{ backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderWidth: kind === 'ghost' ? 1 : 0, borderColor: C.line }, style]}>
      <Text style={{ color: kind === 'ghost' ? C.text : '#06120F', fontWeight: '700', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={S.card}>
      {title ? <View style={[S.row, { justifyContent: 'space-between' }]}><Text style={S.h2}>{title}</Text>{right}</View> : null}
      {children}
    </View>
  );
}

export function Pill({ text, color }: { text: string; color: string }) {
  return <Text style={{ color, borderColor: color, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12, overflow: 'hidden' }}>{text}</Text>;
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[S.row, { justifyContent: 'space-between' }]}>
      <View style={{ flex: 1 }}><Text style={S.body}>{label}</Text>{hint ? <Text style={S.dim}>{hint}</Text> : null}</View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent, false: C.line }} />
    </View>
  );
}

export function Field({ label, value, onChange, secure, placeholder }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean; placeholder?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={S.dim}>{label}</Text>
      <TextInput style={S.input} value={value} onChangeText={onChange} secureTextEntry={secure} placeholder={placeholder} placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false} />
    </View>
  );
}
