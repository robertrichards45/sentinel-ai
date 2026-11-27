/**
 * Apple Health (read only): sleep, steps, active calories, resting heart rate, heart-rate variability and
 * workouts, so Alice can say "you slept 5 hours, go lighter today". Only read when you ask (or in coach
 * mode); nothing is written to Health and nothing leaves the phone except the short summary Alice reads.
 * General fitness guidance only, not medical advice.
 */
import * as HK from '@kingstinct/react-native-healthkit';
import { note } from './diary';
import { briefingHooks } from './briefingHooks';

const READ = ['HKQuantityTypeIdentifierStepCount', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierRestingHeartRate', 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'HKCategoryTypeIdentifierSleepAnalysis', 'HKWorkoutTypeIdentifier'] as const;

async function ready(): Promise<boolean> {
  try {
    if (!HK.isHealthDataAvailable()) return false;
    return await HK.requestAuthorization({ toRead: READ as any });
  } catch (e: any) { note('health-error', { step: 'auth', msg: String(e?.message ?? e) }); return false; }
}

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export async function healthSummary(): Promise<string> {
  if (!(await ready())) return "I can't read Apple Health on this phone. In the Health app, tap your picture, Apps, Alice, and turn on the data you want me to see.";
  const parts: string[] = [];
  try {
    const now = new Date();
    const evening = new Date(startOfDay().getTime() - 6 * 3600_000); // 6 PM yesterday
    const sleep: any[] = await HK.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis' as any, { limit: 0, filter: { date: { startDate: evening, endDate: now } } } as any);
    const asleepMs = sleep.filter((x) => x.value !== 0 && x.value !== 2).reduce((m, x) => m + (new Date(x.endDate).getTime() - new Date(x.startDate).getTime()), 0);
    if (asleepMs > 0) { const h = Math.floor(asleepMs / 3600000), m = Math.round((asleepMs % 3600000) / 60000); parts.push(`you slept ${h} hours ${m} minutes`); }
  } catch {}
  try {
    const s: any = await HK.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount' as any, ['cumulativeSum'], { filter: { date: { startDate: startOfDay(), endDate: new Date() } } } as any);
    if (s?.sumQuantity?.quantity) parts.push(`${Math.round(s.sumQuantity.quantity).toLocaleString()} steps today`);
  } catch {}
  try {
    const e: any = await HK.queryStatisticsForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned' as any, ['cumulativeSum'], { filter: { date: { startDate: startOfDay(), endDate: new Date() } }, unit: 'kcal' } as any);
    if (e?.sumQuantity?.quantity) parts.push(`${Math.round(e.sumQuantity.quantity)} active calories`);
  } catch {}
  try {
    const r: any = await HK.getMostRecentQuantitySample('HKQuantityTypeIdentifierRestingHeartRate' as any);
    if (r?.quantity) parts.push(`resting heart rate ${Math.round(r.quantity)}`);
  } catch {}
  try {
    const v: any = await HK.getMostRecentQuantitySample('HKQuantityTypeIdentifierHeartRateVariabilitySDNN' as any);
    if (v?.quantity) parts.push(`heart-rate variability ${Math.round(v.quantity)} milliseconds`);
  } catch {}
  try {
    const w: readonly any[] = await HK.queryWorkoutSamples({ limit: 50, filter: { date: { startDate: new Date(Date.now() - 7 * 86400000), endDate: new Date() } } } as any);
    if (w.length) parts.push(`${w.length} workout${w.length > 1 ? 's' : ''} in the last 7 days, ${Math.round(w.reduce((m, x) => m + (x.duration?.quantity ?? x.duration ?? 0), 0) / 60)} minutes total`);
  } catch {}
  note('health', { items: parts.length });
  return parts.length ? `From Apple Health: ${parts.join(', ')}. (General guidance, not medical advice.)` : 'Apple Health has no recent data for me yet, or the permissions are off. Check the Health app, Apps, Alice.';
}

// Morning briefing: last night's sleep, first thing.
briefingHooks.push(async () => {
  if (!(await ready())) return '';
  const evening = new Date(startOfDay().getTime() - 6 * 3600_000);
  const sleep: any[] = await HK.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis' as any, { limit: 0, filter: { date: { startDate: evening, endDate: new Date() } } } as any);
  const ms = sleep.filter((x) => x.value !== 0 && x.value !== 2).reduce((m, x) => m + (new Date(x.endDate).getTime() - new Date(x.startDate).getTime()), 0);
  if (!ms) return '';
  const h = ms / 3600000;
  return `You slept ${Math.floor(h)} hours ${Math.round((h % 1) * 60)} minutes${h < 6 ? ', so take it easier today' : ''}.`;
});
