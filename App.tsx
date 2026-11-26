import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
// Import only the 4 weights used (the package index would bundle all 18).
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular';
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import Home from './src/screens/Home';
import Assist from './src/screens/Assist';
import Media from './src/screens/Media';
import Memory from './src/screens/Memory';
import Settings from './src/screens/Settings';
import { loadSettings } from './src/settings';
import { memory } from './src/memory';
import { loadModes } from './src/modeStore';
import { glasses } from './src/ble';
import { useGlasses } from './src/hooks';
import { C, F, Ionicons } from './src/ui';

type IconName = keyof typeof Ionicons.glyphMap;
const TABS: { id: string; label: string; icon: IconName; iconOn: IconName; C: React.ComponentType }[] = [
  { id: 'home', label: 'Glasses', icon: 'glasses-outline', iconOn: 'glasses', C: Home },
  { id: 'assist', label: 'Assist', icon: 'mic-outline', iconOn: 'mic', C: Assist },
  { id: 'media', label: 'Media', icon: 'images-outline', iconOn: 'images', C: Media },
  { id: 'memory', label: 'Memory', icon: 'bookmark-outline', iconOn: 'bookmark', C: Memory },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', iconOn: 'settings', C: Settings },
];

function TabBar({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const g = useGlasses();
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: C.panel, paddingTop: 6 }}>
      {TABS.map((t) => {
        const on = tab === t.id;
        const badge = t.id === 'home' ? (g.busy ? C.red : g.link === 'connected' ? C.teal : undefined) : t.id === 'media' && g.newMediaSinceImport ? C.violet : undefined;
        return (
          <Pressable key={t.id} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} onPress={() => setTab(t.id)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 6, gap: 3 }}>
            <View>
              <Ionicons name={on ? t.iconOn : t.icon} size={24} color={on ? C.ink : C.sub} />
              {badge ? <View style={{ position: 'absolute', right: -4, top: -2, width: 9, height: 9, borderRadius: 5, backgroundColor: badge, borderWidth: 2, borderColor: C.panel }} /> : null}
            </View>
            <Text style={{ fontSize: 11, fontFamily: on ? F.semibold : F.regular, color: on ? C.ink : C.sub }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_800ExtraBold });
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('home');

  useEffect(() => {
    (async () => {
      await Promise.all([loadSettings(), memory.load(), loadModes()]);
      setReady(true);
      glasses.connect().catch(() => {}); // automatic connection on launch
    })();
  }, []);

  const Active = TABS.find((t) => t.id === tab)!.C;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.panel }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {ready && fontsLoaded ? <Active /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="glasses-outline" size={40} color={C.sub} /></View>}
      </View>
      <TabBar tab={tab} setTab={setTab} />
    </SafeAreaView>
  );
}
