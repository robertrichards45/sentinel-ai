/** Everything Alice can do: the welcome tour, the "What Alice can do" page and "Alice, what can you do?". */
export type Capability = { icon: string; title: string; say: string[]; note?: string };

export const CAPABILITIES: Capability[] = [
  { icon: 'chatbubbles-outline', title: 'Talk like a real person', say: ['Hey Alice…', 'I need advice about…', 'Tell me a dark joke'], note: 'Live conversation through your glasses or phone. Interrupt any time. She remembers what you tell her and your past conversations.' },
  { icon: 'eye-outline', title: 'See what you see', say: ['What am I looking at?', 'Read this to me', 'Coach my bench press'], note: 'Uses the phone camera (Show Alice). You can hide the camera view and she still sees.' },
  { icon: 'calendar-outline', title: 'Calendar, reminders, alarms', say: ['I have a dentist appointment Tuesday at 2', 'Remind me to take out the trash when I get home', 'Wake me up at 6', 'Set a 10 minute timer'], note: 'Adds straight to your iPhone Calendar and Reminders. Say "undo" if she got it wrong.' },
  { icon: 'navigate-outline', title: 'Directions and places', say: ['Walking directions to Starbucks', 'Drive me to Walmart', 'Where did I park?'], note: 'Spoken turn-by-turn through the glasses; asks which one when there are several nearby.' },
  { icon: 'call-outline', title: 'Calls, texts, apps', say: ['Call Mom', 'Text Kylee I\'m running late', 'Open Spotify', 'Play my workout playlist', 'Skip this song', 'What\'s playing?'] },
  { icon: 'home-outline', title: 'Smart home, car and more', say: ['Turn off the living room lights', 'Start my car', 'Lock the front door'], note: 'Through Home Assistant, Siri Shortcuts or IFTTT (Settings, Connections).' },
  { icon: 'cart-outline', title: 'Shopping', say: ['Order me dog food from Walmart for pickup', 'Add milk to my shopping list'], note: 'Remembers your store, brand and pickup or delivery. You confirm payment.' },
  { icon: 'document-text-outline', title: 'Documents and files', say: ['Make me a federal resume', 'Put my budget in Excel', 'Make a PowerPoint about…', 'Scan this document', 'Take a picture of this flyer and add it to my calendar'], note: 'Follows official standards (like USAJOBS rules) and makes real Word, Excel, PowerPoint and PDF files.' },
  { icon: 'mic-outline', title: 'Meeting notes', say: ['Take notes', 'Stop taking notes'], note: 'Summary, decisions and action items. Ask permission before recording people.' },
  { icon: 'globe-outline', title: 'Live info and research', say: ['What\'s the news?', 'Who won the game?', 'Read me this article', 'Translate for me'], note: 'Searches the web for anything current; two-way live translator.' },
  { icon: 'sunny-outline', title: 'Your day', say: ['What did I miss?', 'Recap my day', 'Anything coming up I should know about?', 'How did I sleep?'], note: 'Morning heads-up, evening recap, deadlines she spotted in your notes, Apple Health (if enabled).' },
  { icon: 'people-outline', title: 'People and memory', say: ['This is Mike from work', 'What do I know about Mike?', 'What did I tell you about my truck?', 'Learn the name Kylee, K-Y-L-E-E'] },
  { icon: 'shield-checkmark-outline', title: 'Safety and reliability', say: ['I need help', 'Fix yourself', 'Why did you do that?', 'Stop listening'], note: 'Emergency text with your location, self-repair, works with no signal for the basics.' },
];

export const CAPABILITIES_SPOKEN = 'I can talk things through with you, see through your phone camera, run your calendar, reminders, alarms and timers, give spoken directions, call and text, open apps, control your smart home and car through Home Assistant or Shortcuts, shop for you, make Word, Excel, PowerPoint and PDF files that follow official standards, scan documents, take meeting notes, search the web, read articles, translate, recap your day, coach your workouts, and remember what matters to you. The full list is in Settings, under What Alice can do.';
