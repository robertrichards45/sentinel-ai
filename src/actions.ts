import { Alert, Linking } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';
import { Action } from './intents';
import { memory } from './memory';
import { getSettings, updateSettings } from './settings';
import { glassesStatusText } from './glassesState';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { documentHtml, fileNameFor } from './docCore';
import { describeWeather } from './weatherCore';

/** Alice's documents live in the app's Documents folder ("On My iPhone > Alice" in Files). */
async function saveDocument(title: string, format: 'pdf' | 'text', content: string): Promise<File> {
  const dir = new Directory(Paths.document, 'Alice Documents');
  if (!dir.exists) dir.create();
  let name = fileNameFor(title, format === 'pdf' ? 'pdf' : 'md');
  if (new File(dir, name).exists) name = name.replace(/(\.\w+)$/, ` ${new Date().toISOString().slice(0, 16).replace(':', '.')}$1`);
  const dest = new File(dir, name);
  if (format === 'pdf') {
    const { uri } = await Print.printToFileAsync({ html: documentHtml(title, content) });
    new File(uri).move(dest);
  } else {
    dest.create();
    await dest.write(content);
  }
  return dest;
}

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
    case 'weather': {
      let lat: number, lon: number, label: string;
      if (a.place) {
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(a.place)}`)).json();
        const r = g?.results?.[0];
        if (!r) return `I couldn't find a place called ${a.place}.`;
        lat = r.latitude; lon = r.longitude; label = [r.name, r.admin1].filter(Boolean).join(', ');
      } else {
        const p = await Location.requestForegroundPermissionsAsync();
        if (p.status !== 'granted') return 'I need location permission for local weather, or tell me a city.';
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        lat = pos.coords.latitude; lon = pos.coords.longitude; label = 'your area';
      }
      const units = /^en-US/i.test(getSettings().voiceLanguage) ? 'fahrenheit' : 'celsius';
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=${a.days ?? 2}&temperature_unit=${units}&wind_speed_unit=${units === 'fahrenheit' ? 'mph' : 'kmh'}`;
      const w = await (await fetch(url)).json();
      return describeWeather(w, label, units);
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
    case 'document': {
      const f = await saveDocument(a.title, a.format, a.content);
      if (await Sharing.isAvailableAsync()) {
        Sharing.shareAsync(f.uri, { mimeType: a.format === 'pdf' ? 'application/pdf' : 'text/markdown', dialogTitle: a.title, UTI: a.format === 'pdf' ? 'com.adobe.pdf' : 'net.daringfireball.markdown' }).catch(() => {});
      }
      return `I made "${a.title}" as a ${a.format === 'pdf' ? 'PDF' : 'text file'}. It's saved in Files under Alice, and you can share, email or print it now.`;
    }
  }
}
