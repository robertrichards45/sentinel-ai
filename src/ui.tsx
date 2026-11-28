/**
 * Alice design system — "Glow".
 * Deep night background lit by soft coloured light, frosted-glass panels floating
 * over it, and a living orb (src/Orb.tsx) as Alice's presence.
 * Type: Sora (display) + Inter (text). Approved by Robert 2026-11-25.
 * Premium pass (2026-11-28): glass catches light along its top edge, buttons press in with a soft
 * haptic tick, and the primary button is lit from above.
 */

/** A light tap you can feel. Never throws (some devices have no haptics). */
export const tick = (kind: 'light' | 'select' | 'success' = 'light') => {
  try {
    if (kind === 'select') Haptics.selectionAsync();
    else if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
};
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, Switch, TextInput, TextStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

export const C = {
  bg: '#05060F',
  ink: '#F2F4FF', // primary text
  sub: '#A9B0D0', // secondary text (4.5:1+ on bg)
  faint: '#7D86AD',
  glass: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.14)',
  violet: '#8C6BFF',
  cyan: '#59D8FF',
  pink: '#FF7AD9',
  mint: '#4CF5B5',
  red: '#FF5C7A',
  amber: '#FFC46B',
  // aliases used by older screens
  text: '#F2F4FF', dim: '#A9B0D0', accent: '#8C6BFF', good: '#4CF5B5', warn: '#FFC46B', bad: '#FF5C7A',
  card: 'rgba(255,255,255,0.07)', panel: 'rgba(255,255,255,0.07)', line: 'rgba(255,255,255,0.14)', teal: '#4CF5B5',
  tealSoft: 'rgba(76,245,181,0.15)', redSoft: 'rgba(255,92,122,0.12)', violetSoft: 'rgba(140,107,255,0.18)',
};

export const F = { light: 'Sora_300Light', display: 'Sora_600SemiBold', displayBold: 'Sora_700Bold', regular: 'Inter_400Regular', medium: 'Inter_500Medium', semibold: 'Inter_600SemiBold', heavy: 'Sora_700Bold' };

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  pad: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120, gap: 16 },
  card: { borderRadius: 24, padding: 16, gap: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.glassBorder },
  h1: { color: C.ink, fontSize: 30, lineHeight: 36, fontFamily: F.display, letterSpacing: -0.6 },
  h2: { color: C.ink, fontSize: 17, lineHeight: 22, fontFamily: F.display },
  body: { color: C.ink, fontSize: 16, lineHeight: 23, fontFamily: F.regular },
  dim: { color: C.sub, fontSize: 14, lineHeight: 20, fontFamily: F.regular },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { color: C.ink, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: C.glassBorder, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: F.regular },
});

/** Frosted glass panel: real iOS blur + a faint white film + hairline border. */
export function Glass({ children, style, radius = 24, intensity = 30 }: { children?: React.ReactNode; style?: ViewStyle | ViewStyle[]; radius?: number; intensity?: number }) {
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: C.glassBorder, borderTopColor: 'rgba(255,255,255,0.24)' }, style as any]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.glass }]} />
      {/* light catching the top of the glass, fading down */}
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.0)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.55 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <View style={{ gap: 4, marginBottom: 2 }}>
      <Text style={S.h1} accessibilityRole="header">{children}</Text>
      {sub ? <Text style={S.dim}>{sub}</Text> : null}
    </View>
  );
}

export function Btn({ title, onPress, kind = 'primary', disabled, style, icon }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; style?: ViewStyle; icon?: keyof typeof Ionicons.glyphMap }) {
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 18, minHeight: 48 }}>
      {icon ? <Ionicons name={icon} size={18} color={kind === 'danger' ? C.red : C.ink} /> : null}
      <Text style={{ color: kind === 'danger' ? C.red : C.ink, fontFamily: F.semibold, fontSize: 15, letterSpacing: 0.1 }}>{title}</Text>
    </View>
  );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={() => { tick(); onPress(); }}
      style={({ pressed }) => [{ opacity: disabled ? 0.35 : 1, borderRadius: 999, transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}>
      {kind === 'primary'
        ? <View style={{ borderRadius: 999, shadowColor: C.violet, shadowOpacity: 0.75, shadowRadius: 18, shadowOffset: { width: 0, height: 4 } }}>
            <LinearGradient colors={['#A58BFF', '#7A55FF', '#5B36E8']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={{ borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderTopColor: 'rgba(255,255,255,0.45)' }}>{inner}</LinearGradient>
          </View>
        : <Glass radius={999} style={kind === 'danger' ? { borderColor: 'rgba(255,92,122,0.5)' } : undefined}>{inner}</Glass>}
    </Pressable>
  );
}

export function Card({ title, children, right, tone }: { title?: string; children: React.ReactNode; right?: React.ReactNode; tone?: 'alert' }) {
  return (
    <Glass style={[{ padding: 16, gap: 10 }, tone === 'alert' ? { borderColor: 'rgba(255,92,122,0.6)' } : {}]}>
      {tone === 'alert' ? <View style={[StyleSheet.absoluteFill, { backgroundColor: C.redSoft }]} /> : null}
      {title ? <View style={[S.row, { justifyContent: 'space-between' }]}><Text style={S.h2}>{title}</Text>{right}</View> : null}
      {children}
    </Glass>
  );
}

export function Pill({ text, color, dot }: { text: string; color: string; dot?: boolean; soft?: string }) {
  return (
    <Glass radius={999} style={{ paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, shadowColor: color, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }} /> : null}
      <Text style={{ color: dot ? C.ink : color, fontSize: 13, fontFamily: F.medium }}>{text}</Text>
    </Glass>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[S.row, { justifyContent: 'space-between', paddingVertical: 2 }]}>
      <View style={{ flex: 1, gap: 2 }}><Text style={S.body}>{label}</Text>{hint ? <Text style={S.dim}>{hint}</Text> : null}</View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.violet, false: 'rgba(255,255,255,0.18)' }} accessibilityLabel={label} />
    </View>
  );
}

export function Field({ label, value, onChange, secure, placeholder }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean; placeholder?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[S.dim, { fontFamily: F.medium }]}>{label}</Text>
      <TextInput style={S.input} value={value} onChangeText={onChange} secureTextEntry={secure} placeholder={placeholder} placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} accessibilityLabel={label} keyboardAppearance="dark" />
    </View>
  );
}

export function Line({ label, value, valueStyle }: { label: string; value: string; valueStyle?: TextStyle }) {
  return (
    <View style={[S.row, { justifyContent: 'space-between' }]}>
      <Text style={S.dim}>{label}</Text>
      <Text style={[S.body, { fontFamily: F.semibold }, valueStyle]}>{value}</Text>
    </View>
  );
}

export { Ionicons };
