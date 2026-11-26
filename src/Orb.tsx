/**
 * Alice's presence: a glowing orb drawn with Skia.
 *  - back layer: a blurred conic ("sweep") gradient ring that rotates
 *  - front layer: a glassy sphere (radial gradient + specular highlight)
 * Motion uses React Native's Animated (native driver), so no extra animation
 * library is needed. Speeds/colours change with state. Respects Reduce Motion.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Canvas, Circle, SweepGradient, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const PALETTE: Record<OrbState, { ring: string[]; core: string[]; glow: string; spinMs: number; scale: number }> = {
  idle:      { ring: ['#59D8FF', '#8C6BFF', '#FF7AD9', '#FFB86B', '#59D8FF'], core: ['#FFFFFF', '#D9CCFF', '#8C6BFF', '#3A1FC9', '#0D0638'], glow: '#7B5CFF', spinMs: 9000, scale: 1.04 },
  listening: { ring: ['#FF7AD9', '#8C6BFF', '#59D8FF', '#FF7AD9'],            core: ['#FFFFFF', '#FFD1F2', '#C86BFF', '#5A1FC9', '#12063A'], glow: '#C04CFF', spinMs: 3500, scale: 1.08 },
  thinking:  { ring: ['#59D8FF', '#4CF5B5', '#8C6BFF', '#59D8FF'],            core: ['#FFFFFF', '#CCF4FF', '#6BA8FF', '#1F3AC9', '#06103A'], glow: '#3FA9FF', spinMs: 1600, scale: 1.02 },
  speaking:  { ring: ['#8C6BFF', '#59D8FF', '#4CF5B5', '#8C6BFF'],            core: ['#FFFFFF', '#D9CCFF', '#8C6BFF', '#3A1FC9', '#0D0638'], glow: '#7B5CFF', spinMs: 5000, scale: 1.06 },
};

export function Orb({ size = 220, state = 'idle' }: { size?: number; state?: OrbState }) {
  const p = PALETTE[state];
  const spin = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce); }, []);

  useEffect(() => {
    if (reduce) return;
    spin.setValue(0);
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: p.spinMs, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: state === 'listening' ? 600 : 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: state === 'listening' ? 600 : 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [state, reduce]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, p.scale] });
  const box = size * 1.5; // room for the glow
  const c = box / 2, r = size / 2;

  return (
    <Animated.View style={{ width: box, height: box, alignSelf: 'center', transform: [{ scale }] }} accessible accessibilityRole="image" accessibilityLabel={`Alice is ${state}`}>
      {/* outer glow (static) */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={r * 1.05} color={p.glow} opacity={0.55}><BlurMask blur={r * 0.55} style="normal" /></Circle>
      </Canvas>
      {/* rotating colour ring */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Circle cx={c} cy={c} r={r * 1.08} opacity={0.9}>
            <SweepGradient c={vec(c, c)} colors={p.ring} />
            <BlurMask blur={r * 0.22} style="normal" />
          </Circle>
        </Canvas>
      </Animated.View>
      {/* glassy sphere */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={r}>
          <RadialGradient c={vec(c - r * 0.32, c - r * 0.44)} r={r * 1.45} colors={p.core} positions={[0, 0.1, 0.34, 0.66, 1]} />
        </Circle>
        <Circle cx={c - r * 0.3} cy={c - r * 0.42} r={r * 0.2} color="rgba(255,255,255,0.55)"><BlurMask blur={r * 0.12} style="normal" /></Circle>
      </Canvas>
    </Animated.View>
  );
}

/** Soft coloured lights behind every screen (static, drawn once). */
export function Backdrop({ mood = 'idle' }: { mood?: OrbState }) {
  const { width: w, height: h } = useWindowDimensions();
  const warm = mood === 'listening';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#05060F' }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={w * 0.05} cy={h * 0.08} r={w * 0.55} color={warm ? '#7A2BFF' : '#3B1CFF'} opacity={0.5}><BlurMask blur={110} style="normal" /></Circle>
        <Circle cx={w * 1.0} cy={h * 0.42} r={w * 0.5} color={warm ? '#FF3FC8' : '#00B8FF'} opacity={0.3}><BlurMask blur={110} style="normal" /></Circle>
        <Circle cx={w * 0.1} cy={h * 0.95} r={w * 0.45} color={warm ? '#00C2FF' : '#FF3FC8'} opacity={0.24}><BlurMask blur={110} style="normal" /></Circle>
      </Canvas>
    </View>
  );
}

/** Animated equaliser bars for "listening". */
export function VoiceBars({ active }: { active: boolean }) {
  const vals = useRef([0, 1, 2, 3, 4, 5, 6].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    if (!active) { vals.forEach((v) => v.setValue(0.3)); return; }
    const loops = vals.map((v, i) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 380 + i * 40, delay: i * 70, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.3, duration: 380 + i * 40, useNativeDriver: true }),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active]);
  const colors = ['#59D8FF', '#8C9BFF', '#B9A2FF', '#FF9AE6', '#B9A2FF', '#8C9BFF', '#59D8FF'];
  return (
    <View style={{ flexDirection: 'row', gap: 6, height: 44, alignItems: 'center', alignSelf: 'center' }} accessibilityElementsHidden>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 6, height: 44, borderRadius: 3, backgroundColor: colors[i], transform: [{ scaleY: v }] }} />
      ))}
    </View>
  );
}
