/**
 * The folded-phone screen (iPhone Duo cover screen, Galaxy Z Fold cover screen).
 * A cover screen is for quick moments, so Alice shows only what matters there: the time, her orb, what was
 * just said, and one big Talk button. Open the phone (or tap the grid) for everything else.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Orb, OrbState, VoiceBars } from '../Orb';
import { LiveCamera } from '../LiveCamera';
import { useGlasses } from '../hooks';
import { activeGlasses } from '../glasses/connector';
import { C, F, Glass, Ionicons, tick } from '../ui';
import { LinearGradient } from 'expo-linear-gradient';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 10_000); return () => clearInterval(t); }, []);
  return now;
}

type Props = {
  state: OrbState; status: string; lastAlice?: string; lastYou?: string; isError?: boolean;
  talking: boolean; voiceActive: boolean; onTalk: () => void;
  look: boolean; onLook: () => void; cameraHidden: boolean;
  onOpenApp?: () => void;
};

/** A round control in the dock. */
function DockButton({ icon, label, onPress, on }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; on?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? 'rgba(140,107,255,0.28)' : 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: on ? 'rgba(140,107,255,0.7)' : 'rgba(255,255,255,0.12)',
        transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      <Ionicons name={icon} size={22} color={on ? C.ink : C.sub} />
    </Pressable>
  );
}

export function CoverGlance(props: Props) {
  const p = { ...props, onTalk: () => { tick(); props.onTalk(); }, onLook: () => { tick('select'); props.onLook(); } };
  const { width, height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  const now = useClock();
  const g = useGlasses();
  const info = activeGlasses();
  const own = info.caps.dataLink;
  const orb = Math.round(Math.min(width * 0.42, height * 0.25, 200)); // the Orb draws its glow around this size
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  const ampm = (now.toLocaleTimeString([], { hour: 'numeric' }).match(/[AP]M/i)?.[0] ?? '').toUpperCase();
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const glassesOn = own ? g.link === 'connected' : info.id !== 'none';

  return (
    <View style={{ flex: 1, paddingHorizontal: 24, paddingBottom: Math.max(inset.bottom, 14) + 6 }}>
      {/* Time and date, with the glasses at a glance */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 6 }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            <Text style={{ fontFamily: F.light, fontSize: 58, lineHeight: 62, color: C.ink, letterSpacing: -2.4 }} accessibilityLabel={now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}>{time}</Text>
            {ampm ? <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.sub, marginBottom: 10 }}>{ampm}</Text> : null}
          </View>
          <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.sub, marginTop: 2 }}>{date}</Text>
        </View>
        {info.id !== 'none' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
            accessibilityLabel={glassesOn ? `Glasses connected${own && g.heartbeat !== undefined ? `, battery ${g.heartbeat} percent` : ''}` : 'Glasses not connected'}>
            <Ionicons name="glasses-outline" size={15} color={glassesOn ? C.mint : C.faint} />
            {own && g.heartbeat !== undefined ? <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.ink }}>{g.heartbeat}%</Text> : null}
          </View>
        ) : null}
      </View>

      {/* Alice */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Pressable onPress={p.onTalk} accessibilityRole="button" accessibilityLabel={p.talking ? 'Stop talking to Alice' : 'Talk to Alice'}>
          <Orb size={orb} state={p.state} />
        </Pressable>
        <View style={{ height: 34, justifyContent: 'center' }}>
          {p.voiceActive ? <VoiceBars active /> : <Text numberOfLines={1} style={{ fontFamily: F.light, fontSize: 21, color: C.ink, letterSpacing: -0.3 }}>{p.status}</Text>}
        </View>
      </View>

      {/* What was just said, or the live camera */}
      {p.look ? (
        <View style={{ marginBottom: 14 }}><LiveCamera hidden={p.cameraHidden} onClose={p.onLook} /></View>
      ) : p.lastAlice ? (
        <Glass radius={22} intensity={40} style={{ paddingHorizontal: 16, paddingVertical: 13, gap: 4, marginBottom: 14 }}>
          {p.lastYou ? <Text numberOfLines={1} style={{ fontFamily: F.regular, fontSize: 13, color: C.faint }}>{p.lastYou}</Text> : null}
          <Text numberOfLines={3} style={{ fontFamily: F.regular, fontSize: 16, lineHeight: 22, color: p.isError ? C.red : C.ink }}>{p.lastAlice}</Text>
        </Glass>
      ) : null}

      {/* Dock: look · talk · everything else */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }}>
        <DockButton icon={p.look ? 'eye-off-outline' : 'eye-outline'} label={p.look ? 'Stop showing Alice' : 'Show Alice what you see'} onPress={p.onLook} on={p.look} />
        <Pressable onPress={p.onTalk} accessibilityRole="button" accessibilityLabel={p.talking ? 'Stop' : 'Talk to Alice'}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <View style={{ width: 84, height: 84, borderRadius: 42, shadowColor: p.talking ? C.pink : C.violet, shadowOpacity: 0.85, shadowRadius: 22, shadowOffset: { width: 0, height: 4 } }}>
            <LinearGradient colors={p.talking ? ['#FF9BE4', '#FF5CC8', '#D9339F'] : ['#A58BFF', '#7A55FF', '#5B36E8']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={{ flex: 1, borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderTopColor: 'rgba(255,255,255,0.5)' }}>
              <Ionicons name={p.talking ? 'stop' : 'mic'} size={32} color="#FFFFFF" />
            </LinearGradient>
          </View>
        </Pressable>
        <DockButton icon="grid-outline" label="Open all of Alice" onPress={() => { tick('select'); p.onOpenApp?.(); }} />
      </View>
    </View>
  );
}
