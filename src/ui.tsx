/**
 * SENTINEL design system — "lens cloth".
 * Light, cool and high-contrast so it reads outdoors in daylight. Colour comes from
 * the violet/teal sheen of lens coatings and is used sparingly: the talk lens, the
 * active state, and the recording alert. One typeface (Archivo) at a 4-step scale.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, Switch, TextInput, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const C = {
  bg: '#EEF1F4', // lens cloth
  panel: '#FFFFFF',
  ink: '#172033', // deep navy text
  sub: '#5B6779', // secondary text
  line: '#D5DBE3',
  violet: '#6A57CC', // coating sheen 1
  teal: '#17968D', // coating sheen 2
  tealSoft: '#DDF1EF',
  violetSoft: '#E9E5FA',
  red: '#C23B2A', // recording / danger only
  redSoft: '#FBE7E4',
  amber: '#B7791F',
  // kept for older imports
  text: '#172033', dim: '#5B6779', accent: '#17968D', good: '#17968D', warn: '#B7791F', bad: '#C23B2A', card: '#FFFFFF',
};

export const F = { regular: 'Archivo_400Regular', medium: 'Archivo_500Medium', semibold: 'Archivo_600SemiBold', heavy: 'Archivo_800ExtraBold' };

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48, gap: 16 },
  card: { backgroundColor: C.panel, borderRadius: 18, padding: 16, gap: 10, borderWidth: 1, borderColor: C.line },
  h1: { color: C.ink, fontSize: 30, lineHeight: 34, fontFamily: F.heavy, letterSpacing: -0.6 },
  h2: { color: C.ink, fontSize: 17, lineHeight: 22, fontFamily: F.semibold },
  body: { color: C.ink, fontSize: 16, lineHeight: 23, fontFamily: F.regular },
  dim: { color: C.sub, fontSize: 14, lineHeight: 20, fontFamily: F.regular },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { color: C.ink, backgroundColor: '#F6F8FA', borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: F.regular },
});

export function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <View style={{ gap: 4, marginBottom: 2 }}>
      <Text style={S.h1} accessibilityRole="header">{children}</Text>
      {sub ? <Text style={S.dim}>{sub}</Text> : null}
    </View>
  );
}

export function Btn({ title, onPress, kind = 'primary', disabled, style, icon }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; style?: ViewStyle; icon?: keyof typeof Ionicons.glyphMap }) {
  const bg = kind === 'primary' ? C.ink : kind === 'danger' ? C.red : C.panel;
  const fg = kind === 'ghost' ? C.ink : '#FFFFFF';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [{ backgroundColor: bg, opacity: disabled ? 0.35 : pressed ? 0.75 : 1, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: C.line, minHeight: 46 }, style]}>
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: F.semibold, fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Card({ title, children, right, tone }: { title?: string; children: React.ReactNode; right?: React.ReactNode; tone?: 'alert' }) {
  return (
    <View style={[S.card, tone === 'alert' && { backgroundColor: C.redSoft, borderColor: '#F1C3BC' }]}>
      {title ? <View style={[S.row, { justifyContent: 'space-between' }]}><Text style={S.h2}>{title}</Text>{right}</View> : null}
      {children}
    </View>
  );
}

export function Pill({ text, color, soft }: { text: string; color: string; soft?: string }) {
  return (
    <View style={{ backgroundColor: soft ?? 'transparent', borderColor: soft ? 'transparent' : color, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: 13, fontFamily: F.medium }}>{text}</Text>
    </View>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[S.row, { justifyContent: 'space-between', paddingVertical: 2 }]}>
      <View style={{ flex: 1, gap: 2 }}><Text style={S.body}>{label}</Text>{hint ? <Text style={S.dim}>{hint}</Text> : null}</View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.teal, false: C.line }} accessibilityLabel={label} />
    </View>
  );
}

export function Field({ label, value, onChange, secure, placeholder }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean; placeholder?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[S.dim, { fontFamily: F.medium }]}>{label}</Text>
      <TextInput style={S.input} value={value} onChangeText={onChange} secureTextEntry={secure} placeholder={placeholder} placeholderTextColor="#98A3B3" autoCapitalize="none" autoCorrect={false} accessibilityLabel={label} />
    </View>
  );
}

/** A key/value line used inside cards. */
export function Line({ label, value, valueStyle }: { label: string; value: string; valueStyle?: TextStyle }) {
  return (
    <View style={[S.row, { justifyContent: 'space-between' }]}>
      <Text style={S.dim}>{label}</Text>
      <Text style={[S.body, { fontFamily: F.semibold }, valueStyle]}>{value}</Text>
    </View>
  );
}

export { Ionicons };
