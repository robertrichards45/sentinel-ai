import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, Glass, Ionicons } from './ui';
import { takingNotes, currentMeeting, stopNotes, onMeetings } from './meetingNotes';
import { directionsTo, stopDirections, onDirections } from './navigation';
import { speak } from './voice';

/** Floating strip above the tab bar while Alice is taking notes or giving directions, with a Stop button. */
export function ActivityBanner() {
  const inset = useSafeAreaInsets();
  const [, tick] = useState(0);
  useEffect(() => {
    const a = onMeetings(() => tick((n) => n + 1));
    const b = onDirections(() => tick((n) => n + 1));
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => { a(); b(); clearInterval(t); };
  }, []);
  const notes = takingNotes();
  const to = directionsTo();
  if (!notes && !to) return null;
  const mins = notes ? Math.max(0, Math.floor((Date.now() - (currentMeeting()?.started ?? Date.now())) / 60000)) : 0;
  const row = (icon: any, label: string, stopLabel: string, onStop: () => void) => (
    <Glass radius={20} intensity={50} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'rgba(10,12,30,0.7)' }}>
      <Ionicons name={icon} size={20} color={C.mint} />
      <Text style={{ flex: 1, color: C.ink, fontFamily: F.medium, fontSize: 14 }} numberOfLines={1}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onStop} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.red }}>
        <Text style={{ color: '#fff', fontFamily: F.semibold, fontSize: 13 }}>{stopLabel}</Text>
      </Pressable>
    </Glass>
  );
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(inset.bottom, 12) + 78, gap: 8 }}>
      {notes ? row('document-text', `Taking notes · ${mins} min`, 'Stop notes', () => { stopNotes().then((t) => speak(t)).catch(() => {}); }) : null}
      {to ? row('navigate', `Directions to ${to}`, 'Stop', () => { stopDirections(); }) : null}
    </View>
  );
}
