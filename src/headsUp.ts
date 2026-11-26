/** Daily heads-up: the first time the glasses connect each day (after 5 AM), Alice tells you what's on today. */
import { glasses } from './ble';
import { agendaItems } from './agenda';
import { getSettings } from './settings';
import { readJson, writeJson } from './storage';
import { speak } from './voice';
import { note } from './diary';

const key = () => new Date().toDateString();
glasses.on(async (e: any) => {
  if (e.kind !== 'link' || e.state !== 'connected' || !getSettings().dailyHeadsUp || new Date().getHours() < 5) return;
  const last = await readJson<string>('headsup.json', '');
  if (last === key()) return;
  await writeJson('headsup.json', key());
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const today = (await agendaItems(1)).filter((i) => i.when <= end && i.when >= new Date());
  if (!today.length) return;
  note('heads-up', { count: today.length });
  setTimeout(() => speak(`Heads up, today you have ${today.slice(0, 4).map((i) => i.text.replace(/ today/, '')).join(', and ')}.`), 6000); // after the headphones link is up
});
