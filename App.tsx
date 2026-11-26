import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Home from './src/screens/Home';
import Assist from './src/screens/Assist';
import Media from './src/screens/Media';
import Memory from './src/screens/Memory';
import Settings from './src/screens/Settings';
import { loadSettings } from './src/settings';
import { memory } from './src/memory';
import { loadModes } from './src/modeStore';
import { glasses } from './src/ble';
import { C } from './src/ui';

const TABS = [
  { id: 'home', label: 'Home', icon: '◉', C: Home },
  { id: 'assist', label: 'Assist', icon: '◎', C: Assist },
  { id: 'media', label: 'Media', icon: '▣', C: Media },
  { id: 'memory', label: 'Memory', icon: '✦', C: Memory },
  { id: 'settings', label: 'Settings', icon: '⚙', C: Settings },
] as const;

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('home');

  useEffect(() => {
    (async () => {
      await Promise.all([loadSettings(), memory.load(), loadModes()]);
      setReady(true);
      glasses.connect().catch(() => {}); // automatic connection on launch
    })();
  }, []);

  const Active = TABS.find((t) => t.id === tab)!.C;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>{ready ? <Active /> : <Text style={{ color: C.dim, padding: 24 }}>Starting SENTINEL…</Text>}</View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: C.card }}>
        {TABS.map((t) => (
          <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} onPress={() => setTab(t.id)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 18, color: tab === t.id ? C.accent : C.dim }}>{t.icon}</Text>
            <Text style={{ fontSize: 11, color: tab === t.id ? C.accent : C.dim }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
