/**
 * Glasses speaker experiment (Robert approved this exact write): right after the glasses finish their own
 * AI recording, send a short Alice clip on the audio channel 57FF/33F5 in the same packet format the
 * glasses use for their microphone. One shot: it disarms itself before sending.
 * The PC could not run this because the glasses only report the button/AI trigger to the phone.
 */
import { Buffer } from 'buffer';
import { glasses } from './ble';
import { SPEAKER_TEST_PACKETS, SPEAKER_TEST_END } from './speakerTestClip';
import { getSettings, updateSettings } from './settings';

export type SpeakerTestResult = { at: number; sent: number; error?: string };
let last: SpeakerTestResult | null = null;
export const lastSpeakerTest = () => last;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSpeakerTestIfArmed(): Promise<boolean> {
  if (!getSettings().speakerTestArmed) return false;
  await updateSettings({ speakerTestArmed: false }); // one-shot
  let sent = 0;
  try {
    await wait(50);
    for (const [hx, n] of SPEAKER_TEST_PACKETS) {
      await glasses.speakerTestWrite(new Uint8Array(Buffer.from(hx, 'hex')));
      sent++;
      await wait(n * 40);
    }
    await glasses.speakerTestWrite(new Uint8Array(Buffer.from(SPEAKER_TEST_END, 'hex')));
    last = { at: Date.now(), sent };
  } catch (e: any) {
    last = { at: Date.now(), sent, error: String(e?.message ?? e) };
  }
  return true;
}
