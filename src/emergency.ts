/**
 * "Alice, I need help": a text to your emergency contacts with where you are (a map link), ready to send.
 * iOS requires you to tap Send yourself; apps can't send texts silently. She then offers to call 911
 * (iPhone asks you to confirm the call). Needs only cell signal, not internet.
 */
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { Linking } from 'react-native';
import { getSettings } from './settings';
import { findContact } from './comms';
import { note } from './diary';

export async function emergencyText(): Promise<string> {
  const who = (getSettings().emergencyContacts ?? []).filter(Boolean);
  if (!who.length) return 'You have no emergency contacts set up. Add them in Settings under Emergency help. Do you want me to call 911?';
  const numbers: string[] = [];
  for (const w of who) {
    if (/^[+\d][\d\s()-]{6,}$/.test(w)) numbers.push(w.replace(/[^\d+]/g, ''));
    else { const c = await findContact(w).catch(() => null); if (c) numbers.push(c.number); }
  }
  let where = 'Location unavailable.';
  try {
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.status === 'granted') {
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]) ?? await Location.getLastKnownPositionAsync();
      if (pos) where = `My location: https://maps.apple.com/?ll=${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}&q=Help`;
    }
  } catch {}
  note('emergency', { contacts: numbers.length });
  if (!numbers.length) return "I couldn't find phone numbers for your emergency contacts. Do you want me to call 911?";
  if (!(await SMS.isAvailableAsync())) return 'Texting is not available on this phone. Do you want me to call 911?';
  const r = await SMS.sendSMSAsync(numbers, `I need help. ${where} (sent by Alice)`);
  return `${r.result === 'sent' ? 'Help text sent' : 'Your help text is ready, tap Send'}. Do you want me to call 911?`;
}

export async function call911(): Promise<string> {
  note('emergency-call', {});
  await Linking.openURL('tel:911');
  return 'Calling 911.';
}
