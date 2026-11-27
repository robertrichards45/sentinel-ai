import { AppState } from 'react-native';
import { scanDocument } from './docScan';
import { photoToPlanner } from './photoFile';
import { catchUpText } from './catchUp';
import { personNote, personInfo } from './people';
import { readThis } from './readAloud';
import { recapText } from './recap';
import { runShortcut } from './shortcutsRun';
import { addToList, readList, checkOff } from './lists';
import { emergencyText, call911 } from './emergency';
import { startNotes, stopNotes } from './meetingNotes';
import { startDirections, stopDirections } from './navigation';
import { resolvePlace, driveMinutes } from './places';
import { setLook } from './triggers';
import { callContact, textContact, setTimer, setAlarm, cancelTimers, playMusic } from './comms';
import { restartLiveSoon } from './liveRestart';
import { respond } from './ai';
import { readJson, writeJson } from './storage';
import { agendaText } from './agenda';
import { goToSleep } from './quiet';
import { note, flushDiary } from './diary';
import { Alert, Linking } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as Location from 'expo-location';
import * as MailComposer from 'expo-mail-composer';
import { Action, validateAction } from './intents';
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

/**
 * Ask the user before anything that creates data outside the app — but only with a pop-up when they're
 * looking at the screen. By voice (glasses, Hey Alice, the orb) the phone is usually in a pocket, so a pop-up
 * would wait forever and nothing would get added. Then she just does it and says "say undo to remove it".
 */
let voiceDepth = 0;
export async function byVoice<T>(fn: () => Promise<T>): Promise<T> { voiceDepth++; try { return await fn(); } finally { voiceDepth--; } }
const confirm = (title: string, msg: string) =>
  new Promise<boolean>((res) => {
    if (!getSettings().confirmActions || voiceDepth > 0 || AppState.currentState !== 'active') return res(true);
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel', onPress: () => res(false) },
      { text: 'OK', onPress: () => res(true) },
    ]);
  });

let lastMade: { what: string; remove: () => Promise<unknown> } | null = null;
const UNDO = ' Say "undo" if that\'s wrong.';

/** Calendar to write to: the iPhone's default, or the first one that accepts new events. */
async function writableCalendar(): Promise<any> {
  try { const d: any = Calendar.getDefaultCalendarSync(); if (d && d.allowsModifications !== false) return d; } catch {}
  const cals: any[] = await Calendar.getCalendars('event' as any);
  const c = cals.find((x) => x.allowsModifications && /icloud|calendar/i.test(`${x.source?.name ?? ''} ${x.title ?? ''}`)) ?? cals.find((x) => x.allowsModifications);
  if (!c) throw new Error('There is no calendar on this iPhone that I can add to. Open the Calendar app once, then try again.');
  return c;
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : 'no time set');

/** Runs one action. Returns a short sentence to speak about the outcome (truthful). */
export async function runAction(a: Action): Promise<string> {
  switch (a.type) {
    case 'remember':
      if (!getSettings().memoryEnabled) return 'Memory is turned off in Settings, so I did not save that.';
      await memory.remember(a.fact);
      return 'Saved to memory.';
    case 'place_reminder': {
      const where = await resolvePlace(a.place);
      if (!where) return `I couldn't find "${a.place}". Say "remember this place as ${a.place}" when you're there, then try again.`;
      if (!(await confirm('Create reminder?', `${a.title}\nWhen you ${a.when === 'leave' ? 'leave' : 'get to'} ${a.place}`))) return 'Reminder cancelled.';
      const p = await Calendar.requestRemindersPermissions();
      if (p.status !== 'granted') return 'I need Reminders permission to do that.';
      const lists = await Calendar.getCalendars('reminder' as any);
      const list = lists.find((c: any) => c.allowsModifications) ?? lists[0];
      if (!list) return 'No reminders list found on this iPhone.';
      const pr: any = await list.createReminder({ title: a.title, alarms: [{ structuredLocation: { title: a.place, proximity: a.when === 'leave' ? 'leave' : 'enter', radius: 150, coords: { latitude: where.lat, longitude: where.lon } } }] } as any);
      lastMade = { what: `the reminder to ${a.title}`, remove: () => pr.delete() };
      return `Done. I'll remind you to ${a.title.charAt(0).toLowerCase() + a.title.slice(1)} when you ${a.when === 'leave' ? 'leave' : 'get to'} ${a.place}. iPhone handles it, even when I'm closed.`;
    }
    case 'what_you_know': {
      const m = memory.get();
      if (!m.facts.length) return "I don't know much about you yet. Tell me things, like what you drive or who's in your family, and I'll keep them.";
      return `Here's what I know: ${m.facts.slice(-15).map((f) => f.text.replace(/\.$/, '')).join('; ')}.${m.facts.length > 15 ? ` And ${m.facts.length - 15} more on the Memory tab.` : ''}`;
    }
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
      const rm: any = await list.createReminder({ title: a.title, ...(a.due ? { dueDate: new Date(a.due), alarms: [{ relativeOffset: 0 }] } : {}) } as any);
      lastMade = { what: `the reminder to ${a.title}`, remove: () => rm.delete() };
      if (getSettings().memoryEnabled && a.due) memory.note(`Reminder: "${a.title}" at ${fmt(a.due)}`).catch(() => {});
      return `Reminder set${a.due ? ' for ' + fmt(a.due) + ". Your phone will alert you then" : ''}.`;
    }
    case 'event': {
      const start = new Date(a.start), end = new Date(start.getTime() + a.durationMin * 60000);
      if (!(await confirm('Add calendar event?', `${a.title}\n${start.toLocaleString()} (${a.durationMin} min)`))) return 'Event cancelled.';
      const p = await Calendar.requestCalendarPermissions();
      if (p.status !== 'granted') return 'I need Calendar permission to do that.';
      const cal = await writableCalendar();
      // With a place: estimate the drive and add a "time to leave" alert (10 minutes of slack, no live traffic).
      let leaveNote = '';
      const alarms: any[] = [{ relativeOffset: -1440 }, { relativeOffset: -60 }, { relativeOffset: -15 }];
      if (a.place) {
        const where = await resolvePlace(a.place).catch(() => null);
        const mins = where ? await driveMinutes(where) : null;
        if (mins !== null && mins > 3) {
          alarms.push({ relativeOffset: -(mins + 10) });
          leaveNote = ` It's about a ${mins}-minute drive from here, so I'll tell you to leave ${mins + 10} minutes before.`;
        }
      }
      if (isNaN(start.getTime())) return "I didn't catch the date and time for that.";
      const ev: any = await cal.createEvent({ title: a.title, startDate: start, endDate: end, alarms, ...(a.place ? { location: a.place } : {}) } as any);
      lastMade = { what: `${a.title} on your calendar`, remove: () => ev.delete() };
      note('event-added', { cal: String(cal.title ?? '').slice(0, 30) });
      if (getSettings().memoryEnabled) memory.note(`Has "${a.title}" on ${start.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`).catch(() => {});
      return `Added ${a.title} on ${start.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. I'll remind you the day before, an hour before and 15 minutes before.${leaveNote}${UNDO}`;
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
    case 'save_spot': {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== 'granted') return 'I need location permission to do that.';
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const [addr] = await Location.reverseGeocodeAsync(pos.coords).catch(() => [] as any[]);
      const label = a.label || 'car';
      const spots = await readJson<Record<string, any>>('spots.json', {});
      spots[label.toLowerCase()] = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: Date.now(), near: addr ? [addr.name, addr.street].filter(Boolean).join(', ') : '' };
      await writeJson('spots.json', spots);
      return `Saved where your ${label} is${addr?.street ? ', near ' + addr.street : ''}.`;
    }
    case 'find_spot': {
      const spots = await readJson<Record<string, any>>('spots.json', {});
      const label = (a.label || 'car').toLowerCase();
      const s = spots[label] ?? Object.values(spots).sort((x: any, y: any) => y.at - x.at)[0];
      if (!s) return 'I don\'t have a saved spot yet. Say "remember where I parked" next time.';
      await Linking.openURL(`maps://?daddr=${s.lat},${s.lon}&dirflg=w`);
      const ago = Math.round((Date.now() - s.at) / 60000);
      return `Your ${a.label || 'car'} is ${s.near ? 'near ' + s.near : 'where you saved it'}, saved ${ago < 60 ? ago + ' minutes' : Math.round(ago / 60) + ' hours'} ago. Walking directions are in Apple Maps.`;
    }
    case 'call': return callContact(a.who);
    case 'text': return textContact(a.who, a.body);
    case 'timer': return setTimer(a.seconds, a.label);
    case 'alarm': return setAlarm(a.at, a.label);
    case 'cancel_timers': return cancelTimers();
    case 'show_camera':
      setLook(a.on);
      return a.on ? 'Camera is on. Point your phone at it and I will tell you what I see.' : 'Camera off.';
    case 'play_music': return playMusic(a.query, a.app);
    case 'translator': {
      if (a.on) {
        await updateSettings({ activeMode: 'translator', ...(a.language ? { translateTo: a.language } : {}) });
        restartLiveSoon();
        return `Interpreter on: English and ${a.language || getSettings().translateTo}. Say "stop translating" when you're done.`;
      }
      await updateSettings({ activeMode: 'general' });
      restartLiveSoon();
      return 'Translator off.';
    }
    case 'briefing': {
      // Your day in one go: schedule, weather where you are, and the top headlines.
      const [agenda, weather, news] = await Promise.all([
        agendaText(1).catch(() => ''),
        runAction({ type: 'weather' } as Action).catch(() => ''),
        runAction({ type: 'look_up', query: 'top 3 news headlines today, one line each' } as Action).catch(() => ''),
      ]);
      return [agenda, weather, news].filter(Boolean).join(' ');
    }
    case 'look_up': {
      // Live facts from the web through Alice's server (Google Search, verified working).
      const r = await respond('general', `Today is ${new Date().toDateString()}. Search the web and answer the question with current facts in 2-4 short spoken sentences. Include dates and numbers. No URLs.`, [], a.query);
      return r.text || 'I could not find anything on that.';
    }
    case 'take_notes': return a.action === 'stop' ? stopNotes() : startNotes(a.title);
    case 'directions': return startDirections(a.to, a.mode);
    case 'stop_directions': return stopDirections();
    case 'run_shortcut': return runShortcut(a.name);
    case 'list_add': return addToList(a.list, a.items);
    case 'list_read': return readList(a.list);
    case 'list_check': return checkOff(a.list, a.item);
    case 'emergency': return emergencyText();
    case 'call_911': return call911();
    case 'catch_up': return catchUpText(() => runAction({ type: 'weather' } as Action));
    case 'person_note': return personNote(a.name, a.note);
    case 'person_info': return personInfo(a.name);
    case 'read_this': return readThis({ url: a.url, summarize: a.summarize });
    case 'daily_recap': return recapText();
    case 'undo_last': {
      if (!lastMade) return "There's nothing for me to undo.";
      const m = lastMade; lastMade = null;
      await m.remove();
      return `Removed ${m.what}.`;
    }
    case 'scan_doc': return scanDocument();
    case 'photo_file': return photoToPlanner(a.target, !!a.fromLibrary, (x) => { const v = validateAction(x, []); return v ? runAction(v as Action) : Promise.resolve('That did not work.'); });
    case 'stop_listening': {
      setTimeout(goToSleep, 1500); // after she says goodbye
      return 'Okay, I\'ll stop listening.';
    }
    case 'report_problem': {
      note('user-report', { text: a.text });
      flushDiary();
      return "Got it, I've added that to my problem log.";
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
    case 'agenda':
      return agendaText(a.days ?? 7);
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
