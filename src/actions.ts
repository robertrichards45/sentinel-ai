import { Alert, Linking } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';
import { Action } from './intents';
import { memory } from './memory';
import { getSettings, updateSettings } from './settings';
import { glassesStatusText } from './glassesState';

/** Ask the user before anything that creates data outside the app. */
const confirm = (title: string, msg: string) =>
  new Promise<boolean>((res) => {
    if (!getSettings().confirmActions) return res(true);
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel', onPress: () => res(false) },
      { text: 'OK', onPress: () => res(true) },
    ]);
  });

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : 'no time set');

/** Runs one action. Returns a short sentence to speak about the outcome (truthful). */
export async function runAction(a: Action): Promise<string> {
  switch (a.type) {
    case 'remember':
      if (!getSettings().memoryEnabled) return 'Memory is turned off in Settings, so I did not save that.';
      await memory.remember(a.fact);
      return 'Saved to memory.';
    case 'forget': {
      const n = await memory.forget(a.match);
      return n ? `Removed ${n} item${n > 1 ? 's' : ''} from memory.` : 'Nothing in memory matched that.';
    }
    case 'note':
      await memory.note(a.text);
      return 'Note saved.';
    case 'reminder': {
      if (!(await confirm('Create reminder?', `${a.title}\n${fmt(a.due)}`))) return 'Reminder cancelled.';
      const p = await Calendar.requestRemindersPermissions();
      if (p.status !== 'granted') return 'I need Reminders permission to do that.';
      const lists = await Calendar.getCalendars('reminder' as any);
      const list = lists.find((c: any) => c.allowsModifications) ?? lists[0];
      if (!list) return 'No reminders list found on this iPhone.';
      await list.createReminder({ title: a.title, ...(a.due ? { dueDate: new Date(a.due), alarms: [{ relativeOffset: 0 }] } : {}) } as any);
      return `Reminder created${a.due ? ' for ' + fmt(a.due) : ''}.`;
    }
    case 'event': {
      const start = new Date(a.start), end = new Date(start.getTime() + a.durationMin * 60000);
      if (!(await confirm('Add calendar event?', `${a.title}\n${start.toLocaleString()} (${a.durationMin} min)`))) return 'Event cancelled.';
      const p = await Calendar.requestCalendarPermissions();
      if (p.status !== 'granted') return 'I need Calendar permission to do that.';
      const cal = Calendar.getDefaultCalendarSync();
      await cal.createEvent({ title: a.title, startDate: start, endDate: end, alarms: [{ relativeOffset: -15 }] } as any);
      return `Added ${a.title} on ${start.toLocaleString()}.`;
    }
    case 'email': {
      if (!(await MailComposer.isAvailableAsync())) return 'Mail is not set up on this iPhone.';
      const r = await MailComposer.composeAsync({ recipients: a.to ? [a.to] : [], subject: a.subject, body: a.body });
      return r.status === 'sent' ? 'Email sent.' : r.status === 'saved' ? 'Draft saved.' : 'Email not sent.';
    }
    case 'where_am_i': {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== 'granted') return 'I need location permission to do that.';
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [addr] = await Location.reverseGeocodeAsync(pos.coords);
      if (!addr) return `You are at latitude ${pos.coords.latitude.toFixed(4)}, longitude ${pos.coords.longitude.toFixed(4)}.`;
      return `You're near ${[addr.name, addr.street, addr.city].filter(Boolean).join(', ')}.`;
    }
    case 'navigate': {
      const flag = a.mode === 'driving' ? 'd' : a.mode === 'transit' ? 'r' : 'w';
      if (!(await confirm('Start navigation?', `${a.destination} (${a.mode})`))) return 'Navigation cancelled.';
      await Linking.openURL(`maps://?daddr=${encodeURIComponent(a.destination)}&dirflg=${flag}`);
      return `Starting ${a.mode} directions to ${a.destination} in Apple Maps. Spoken directions will play through your glasses.`;
    }
    case 'glasses_status':
      return glassesStatusText();
    case 'set_mode':
      await updateSettings({ activeMode: a.mode });
      return `Switched to ${a.mode} mode.`;
  }
}
