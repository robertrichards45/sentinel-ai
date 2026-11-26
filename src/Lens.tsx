/**
 * The signature element: a camera-lens shaped control. Two coating rings (violet,
 * teal) around a glass centre. While listening, the rings breathe; that motion only
 * happens in answer to the user's press. Respects Reduce Motion.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, Text, View } from 'react-native';
import { C, F } from './ui';

export function TalkLens({ state, onPressIn, onPressOut, label, size = 220 }: {
  state: 'idle' | 'listening' | 'thinking'; onPressIn: () => void; onPressOut: () => void; label: string; size?: number;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce); }, []);
  useEffect(() => {
    if (state !== 'listening' || reduce) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [state, reduce]);

  const outer = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const inner = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const listening = state === 'listening';
  const glass = listening ? C.red : state === 'thinking' ? '#2A3550' : C.ink;
  const ring = (s: number, color: string, width: number, scale?: Animated.AnimatedInterpolation<number>) => (
    <Animated.View style={{ position: 'absolute', width: s, height: s, borderRadius: s / 2, borderWidth: width, borderColor: color, transform: scale ? [{ scale }] : [] }} />
  );

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} disabled={state === 'thinking'}
      accessibilityRole="button" accessibilityLabel={listening ? 'Listening. Release to send.' : 'Hold to talk'}
      style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
      {ring(size, listening ? C.red : C.violet, 3, outer)}
      {ring(size * 0.86, C.teal, 6, inner)}
      {ring(size * 0.74, '#C9D1DC', 1)}
      <View style={{ width: size * 0.66, height: size * 0.66, borderRadius: size, backgroundColor: glass, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* glass highlight */}
        <View style={{ position: 'absolute', top: size * 0.07, left: size * 0.12, width: size * 0.22, height: size * 0.11, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.18)', transform: [{ rotate: '-30deg' }] }} />
        {state === 'thinking'
          ? <ActivityIndicator color="#FFFFFF" size="large" />
          : <Text style={{ color: '#FFFFFF', fontFamily: F.semibold, fontSize: 17, textAlign: 'center', lineHeight: 22 }}>{label}</Text>}
      </View>
    </Pressable>
  );
}

/** The glasses drawn as two lenses + bridge; each lens holds one status. */
export function GlassesFrame({ left, right, connected }: { left: React.ReactNode; right: React.ReactNode; connected: boolean }) {
  const lens = (child: React.ReactNode) => (
    <View style={{ flex: 1, aspectRatio: 1.25, borderRadius: 999, borderWidth: 5, borderColor: connected ? C.ink : '#AAB4C2', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
      <View style={{ position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 999, borderWidth: 2, borderColor: connected ? C.tealSoft : '#EEF1F4' }} />
      {child}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} accessible accessibilityLabel={connected ? 'Glasses connected' : 'Glasses not connected'}>
      {lens(left)}
      <View style={{ width: 18, height: 10, borderTopWidth: 5, borderColor: connected ? C.ink : '#AAB4C2', borderTopLeftRadius: 12, borderTopRightRadius: 12, marginTop: -18 }} />
      {lens(right)}
    </View>
  );
}
