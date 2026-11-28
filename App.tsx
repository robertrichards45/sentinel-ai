import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
// Only the weights Alice uses (the package index would bundle every weight).
import { Sora_300Light } from '@expo-google-fonts/sora/300Light';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
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
import { onGlassesButton } from './src/glassesState';
import { requestListen, isTalkLink, onWake, parseAliceLink } from './src/triggers';
import { readThis } from './src/readAloud';
import * as Calendar from 'expo-calendar';
import { speakRecap, recapReady } from './src/recap';
import { speak } from './src/voice';
import './src/catchUp';
import './src/selfRepair';
import { wakeWordReady } from './src/wakeWord';
import { Onboarding } from './src/screens/Onboarding';
import { Tour } from './src/screens/Tour';
import { checkUpdated } from './src/whatsNew';
import { onTour } from './src/triggers';
import { startGlasses, activeGlasses as glassesInfoActive } from './src/glasses/connector';
import { maybeHeadsUp } from './src/headsUp';
import { getSettings, onSettings } from './src/settings';
import './src/headsUp';
import './src/learn';
import './src/navigation'; // registers the background directions task at startup
import { ActivityBanner } from './src/ActivityBanner';
import { setHealthUrl, checkNet } from './src/netState';
import { healthUrl } from './src/ai';
import { live, LiveState } from './src/live';
import './src/glassesVoice'; // glasses microphone -> Alice, app-wide
import { Backdrop, Orb } from './src/Orb';
import { C, F, Glass, Ionicons } from './src/ui';
import { useLayout } from './src/layout';

type IconName = keyof typeof Ionicons.glyphMap;
export type Tab = 'home' | 'assist' | 'media' | 'memory' | 'settings';
const TABS: { id: Tab; label: string; icon: IconName; iconOn: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'sparkles-outline', iconOn: 'sparkles' },
  { id: 'assist', label: 'Talk', icon: 'mic-outline', iconOn: 'mic' },
  { id: 'media', label: 'Media', icon: 'images-outline', iconOn: 'images' },
  { id: 'memory', label: 'Memory', icon: 'bookmark-outline', iconOn: 'bookmark' },
  { id: 'settings', label: 'Settings', icon: 'options-outline', iconOn: 'options' },
];

/** Floating frosted-glass tab bar. The active tab gets a violet glow. */
function TabBar({ tab, setTab, width }: { tab: Tab; setTab: (t: Tab) => void; width?: number }) {
  const g = useGlasses();
  const [ls, setLs] = useState<LiveState>(live.state);
  useEffect(() => live.subscribe({ state: (st) => setLs(st) }), []);
  const talking = ls !== 'off' && ls !== 'error';
  const inset = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={width ? { position: 'absolute', left: 14, width: width - 28, bottom: Math.max(inset.bottom, 12) } : { position: 'absolute', left: 14, right: 14, bottom: Math.max(inset.bottom, 12) }}>
      <Glass radius={30} intensity={50} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, backgroundColor: 'rgba(10,12,30,0.55)' }}>
        {TABS.filter((t) => !(width && t.id === 'assist')).map((t) => {
          const on = tab === t.id;
          const badge = t.id === 'assist' && talking ? C.mint : t.id === 'home' ? (g.busy ? C.red : g.link === 'connected' ? C.mint : undefined) : t.id === 'media' && g.newMediaSinceImport ? C.pink : undefined;
          return (
            <Pressable key={t.id} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} onPress={() => setTab(t.id)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 }}>
              <View style={on ? { shadowColor: C.violet, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } } : undefined}>
                <Ionicons name={on ? t.iconOn : t.icon} size={23} color={on ? C.ink : C.sub} />
                {badge ? <View style={{ position: 'absolute', right: -5, top: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: badge, shadowColor: badge, shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }} /> : null}
              </View>
              <Text style={{ fontSize: 11, fontFamily: on ? F.semibold : F.regular, color: on ? C.ink : C.sub }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

function Shell() {
  const inset = useSafeAreaInsets();
  const lay = useLayout(); // reflows live when a folding phone opens or closes
  const [fontsLoaded] = useFonts({ Sora_300Light, Sora_600SemiBold, Sora_700Bold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [tour, setTour] = useState(false);
  useEffect(() => onTour(() => setTour(true)), []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadSettings(), memory.load(), loadModes()]);
      setHealthUrl(healthUrl()); checkNet(); checkUpdated();
      setNeedsSetup(!getSettings().glassesModel);
      if (getSettings().glassesModel && !getSettings().toured) setTour(true); // existing users see the tour once
      setReady(true);
      if (getSettings().glassesModel) {
        startGlasses(); // connects G2's data link; other glasses are plain iPhone Bluetooth audio
        if (!glassesInfoActive().caps.dataLink) maybeHeadsUp(2000);
      }
    })();
    // Hands-free starts: alice://talk (Siri shortcut, Action Button) and the glasses' button.
    const talk = () => { setTab('assist'); requestListen(); };
    const offWake = onWake(talk);
    const offSetup = onSettings((st) => { if (!st.glassesModel) setNeedsSetup(true); });
    wakeWordReady();
    const link = (u?: string | null) => {
      if (isTalkLink(u)) return talk();
      const l = parseAliceLink(u);
      if (l?.kind === 'recap') speakRecap();
      else if (l?.kind === 'read') readThis({ url: l.url, text: l.text }).then((msg) => { if (!/^Okay, reading/.test(msg)) speak(msg); }).catch(() => {});
    };
    Linking.getInitialURL().then(link);
    const sub = Linking.addEventListener('url', ({ url }) => link(url));
    recapReady();
    // Ask for Calendar and Reminders up front while you're looking at the screen; a permission pop-up that
    // appears later, mid-conversation with the phone in your pocket, would block "add it to my calendar".
    (async () => {
      try {
        if ((await Calendar.getCalendarPermissions()).status === 'undetermined') await Calendar.requestCalendarPermissions();
        if ((await Calendar.getRemindersPermissions()).status === 'undetermined') await Calendar.requestRemindersPermissions();
      } catch {}
    })();
    const offBtn = onGlassesButton(talk);
    return () => { sub.remove(); offBtn(); offWake(); offSetup(); };
  }, []);

  const screens: Record<Tab, React.ReactNode> = {
    home: <Home go={setTab} />, assist: <Assist />, media: <Media />, memory: <Memory />, settings: <Settings />,
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <Backdrop />
      <View style={{ flex: 1, paddingTop: inset.top }}>
        {ready && fontsLoaded && needsSetup ? <Centered wide={lay.wide}><Onboarding onDone={() => { setNeedsSetup(false); startGlasses(); if (!getSettings().toured) setTour(true); }} /></Centered>
          : ready && fontsLoaded && tour ? <Centered wide={lay.wide}><Tour onDone={() => { setTour(false); setTab('assist' as any); }} /></Centered>
          : ready && fontsLoaded && lay.wide ? (
            // Unfolded: the screen you picked on the left, Alice always ready to talk on the right.
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <View style={{ width: lay.left }}>{screens[tab === 'assist' ? 'home' : tab]}</View>
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
              <View style={{ width: lay.right - 1 }}>{screens.assist}</View>
            </View>
          )
          : ready && fontsLoaded ? screens[tab] : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Orb size={140} /></View>}
      </View>
      {ready && fontsLoaded && !needsSetup && !tour ? <ActivityBanner /> : null}
      {ready && fontsLoaded && !needsSetup && !tour ? <TabBar tab={tab} setTab={setTab} width={lay.wide ? lay.left : undefined} /> : null}
    </View>
  );
}

/** Setup and tour read best at phone width, so on an unfolded screen they sit in a centered column. */
function Centered({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  if (!wide) return <>{children}</>;
  return <View style={{ flex: 1, alignItems: 'center' }}><View style={{ flex: 1, width: '100%', maxWidth: 560 }}>{children}</View></View>;
}

export default function App() {
  return <SafeAreaProvider><Shell /></SafeAreaProvider>;
}
