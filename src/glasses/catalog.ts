/**
 * Which glasses Alice supports and what each kind can do. Everything brand-specific lives behind a
 * "connector"; the rest of Alice (conversation, memory, calendar, search, calls, timers, translator) is the same
 * for all of them.
 */
export type GlassesModel = 'g2' | 'headphones' | 'meta' | 'none';

export type Capabilities = {
  /** Alice talks to the glasses' own data link (battery, button, photo count). */
  dataLink: boolean;
  /** Pressing the glasses' button starts a conversation. */
  button: boolean;
  /** Alice can use the glasses' microphone. */
  glassesMic: boolean;
  /** You hear Alice through the glasses' speakers. */
  speakers: boolean;
  /** Battery level shown in Alice. */
  battery: boolean;
  /** Alice can see through the glasses' camera (otherwise she uses the phone camera). */
  glassesCamera: boolean;
};

export type GlassesInfo = {
  id: GlassesModel;
  name: string;
  examples: string;
  caps: Capabilities;
  /** Not usable yet (shown as "coming soon" with what is needed). */
  comingSoon?: string;
  setupTips: string[];
};

export const GLASSES: GlassesInfo[] = [
  {
    id: 'g2', name: 'G2 AI Smart Glasses', examples: 'G2 AI Smart Glasses Pro and look-alikes that use the Wheat / WheatAi app',
    caps: { dataLink: true, button: true, glassesMic: true, speakers: true, battery: true, glassesCamera: false },
    setupTips: ['Close the Wheat app so the glasses talk to Alice.', 'Press and hold the glasses button to talk.'],
  },
  {
    id: 'headphones', name: 'Any Bluetooth audio glasses', examples: 'Bose Frames, Echo Frames, Razer Anzu, Solos, Ray-Ban Meta used as headphones, and most other audio or AI glasses',
    caps: { dataLink: false, button: false, glassesMic: true, speakers: true, battery: false, glassesCamera: false },
    setupTips: ['Pair the glasses in iPhone Settings > Bluetooth first.', 'Say "Hey Alice", or tap the orb, to talk.', 'Alice uses the phone camera for "what am I looking at?".'],
  },
  {
    id: 'meta', name: 'Ray-Ban Meta / Oakley Meta', examples: 'Ray-Ban Meta (Gen 1 and 2), Oakley Meta HSTN and Vanguard, Meta Ray-Ban Display',
    caps: { dataLink: false, button: false, glassesMic: true, speakers: true, battery: false, glassesCamera: false },
    comingSoon: "Camera support comes through Meta's official developer kit. Until Meta opens it to public apps, these work like any Bluetooth audio glasses.",
    setupTips: ['Pair them in the Meta AI app and iPhone Bluetooth.', 'Say "Hey Alice", or tap the orb, to talk.'],
  },
  {
    id: 'none', name: 'No glasses (phone only)', examples: 'Use Alice on the iPhone with its speaker, microphone and camera',
    caps: { dataLink: false, button: false, glassesMic: false, speakers: false, battery: false, glassesCamera: false },
    setupTips: ['Tap the orb or say "Hey Alice" to talk.'],
  },
];

export const glassesInfo = (id: string | undefined): GlassesInfo => GLASSES.find((g) => g.id === id) ?? GLASSES[0];
