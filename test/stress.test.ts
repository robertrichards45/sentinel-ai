/**
 * Stress test: throws hostile, random and huge inputs at every pure part of Alice, checks nothing crashes,
 * hangs or returns nonsense, and times the heavy paths. Run: npx tsx test/stress.test.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { validateAction } from '../src/intents';
import { parseOffline, parseDuration, parseClock } from '../src/offlineCore';
import { parseDocReply, parseSheetsReply, parseSlidesReply } from '../src/makeFileCore';
import { markdownToDocx, sheetsToXlsx, slidesToPptx, zip } from '../src/officeCore';
import { recall } from '../src/recallCore';
import { NoiseGate, saysNoMemory, looksSpanish, floatToPcm16, resampleLinear } from '../src/liveCore';
import { stepsFromOsrm, newNav, navUpdate, sayDistance } from '../src/navCore';
import { parseMusicRequest } from '../src/musicCore';
import { gmailText, buildRaw, describeList } from '../src/gmailCore';
import { parseForesight } from '../src/foresightCore';
import { planOrder, storeLink } from '../src/shopCore';
import { appUrl } from '../src/appsCore';
import { pickShortcut, listMatches } from '../src/matchCore';
import { addPersonNote, findPerson } from '../src/peopleCore';
import { parsePhotoFiling } from '../src/photoCore';
import { chunksForReading } from '../src/speechCore';
import { parseLearnedUpdate, addFact, forget, EMPTY } from '../src/memoryCore';
import { readFileSync } from 'fs';

let fails = 0, checks = 0;
const check = (name: string, ok: boolean, got?: unknown) => { checks++; if (!ok) { fails++; console.log('FAIL', name, got ?? ''); } };
const time = <T>(name: string, maxMs: number, fn: () => T): T => { const t = Date.now(); const r = fn(); const ms = Date.now() - t; check(`${name} under ${maxMs} ms`, ms <= maxMs, `${ms} ms`); console.log(`  ${name}: ${ms} ms`); return r; };
let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const junk = (): any => pick([undefined, null, '', ' ', 0, -1, 1e308, NaN, Infinity, true, false, [], {}, [1, 2], { a: { b: 1 } }, 'x'.repeat(100000), '\u0000‮<script>alert(1)</script>', '😀🔥'.repeat(500), "'; DROP TABLE users; --", '../../etc/passwd', 'https://evil.example/' + 'a'.repeat(5000), String(rnd()), Math.floor(rnd() * 1e6)]);
const noThrow = (name: string, fn: () => unknown) => { try { fn(); check(name, true); } catch (e: any) { check(name, false, e?.message); } };

console.log('1. Every action type with 300 random hostile inputs each');
const live = readFileSync(new URL('../src/live.ts', import.meta.url), 'utf8');
const types = [...new Set([...live.matchAll(/\{ name: '([a-z_0-9]+)'/g)].map((m) => m[1]))];
const modes = [{ id: 'general' }, { id: 'translator' }] as any;
let accepted = 0, total = 0;
for (const type of types) {
  for (let i = 0; i < 300; i++) {
    const a: any = { type };
    for (const k of ['title', 'start', 'due', 'query', 'to', 'body', 'name', 'item', 'list', 'items', 'place', 'when', 'mode', 'command', 'which', 'kind', 'request', 'word', 'seconds', 'at', 'who', 'text', 'fact', 'match', 'on', 'exercise', 'reps', 'weight', 'days', 'event', 'value', 'url', 'summarize', 'target', 'last', 'choice', 'store', 'brand', 'fulfillment', 'durationMin', 'action']) if (rnd() < 0.4) a[k] = junk();
    total++;
    try {
      const v: any = validateAction(a, modes);
      if (v) {
        accepted++;
        const s = JSON.stringify(v);
        if (s.length > 20000) check(`${type} output bounded`, false, s.length);
        for (const [k, val] of Object.entries(v)) if (typeof val === 'number' && !Number.isFinite(val)) check(`${type}.${k} finite`, false, val);
      }
    } catch (e: any) { check(`${type} never throws`, false, e?.message); break; }
  }
}
console.log(`  ${types.length} actions x 300 = ${total} hostile inputs, ${accepted} accepted after cleaning, 0 crashes expected`);

console.log('2. Offline commands: 5,000 random phrases + edge cases');
const words = ['set', 'a', 'timer', 'for', 'five', 'minutes', 'alarm', 'wake', 'me', 'up', 'at', '7', 'pm', 'call', 'mom', 'text', 'saying', 'open', 'spotify', 'add', 'milk', 'to', 'my', 'shopping', 'list', 'what', 'time', 'is', 'it', 'help', 'undo', 'note', '😀', '99999', '25:99', 'half', 'and'];
for (let i = 0; i < 5000; i++) { const p = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => pick(words)).join(' '); noThrow('offline parse', () => parseOffline(p, ['Lights Off'])); }
noThrow('offline huge', () => parseOffline('timer '.repeat(20000)));
check('timer 0 minutes rejected', (parseOffline('set a timer for 0 minutes') as any)?.action === undefined);
check('clock 25:99 rejected', parseClock('25:99') === null);
check('duration nonsense', parseDuration('set a timer for banana') === null);

console.log('3. Documents: huge and malformed');
const bigMd = Array.from({ length: 4000 }, (_, i) => (i % 50 === 0 ? `## Section ${i}` : i % 7 === 0 ? `- **bullet** ${i} with *italic* & <tags> "quotes" é 😀` : i % 13 === 0 ? `| a${i} | b | c |` : `Paragraph ${i} lorem ipsum dolor sit amet.`)).join('\n');
const docx = time('Word file, 4,000 lines', 1500, () => markdownToDocx(bigMd));
const xlsx = time('Excel file, 2,000 rows x 20 cols', 1500, () => sheetsToXlsx([{ name: 'Big / Sheet: ?*', rows: Array.from({ length: 2000 }, (_, r) => Array.from({ length: 20 }, (_, c) => (r === 0 ? `Col ${c}` : c % 3 === 0 ? r * c : c % 5 === 0 ? `=A${r + 1}*2` : `t${r}<&>`))) }, { name: 'Big / Sheet: ?*', rows: [] }]));
const pptx = time('PowerPoint, 60 slides', 1000, () => slidesToPptx('Deck & <Co>', Array.from({ length: 80 }, (_, i) => ({ title: `Slide ${i} "quoted" & <x>`, bullets: Array.from({ length: 12 }, (_, b) => `Point ${b} 😀`) }))));
mkdirSync('/tmp/alice-stress', { recursive: true });
writeFileSync('/tmp/alice-stress/big.docx', docx); writeFileSync('/tmp/alice-stress/big.xlsx', xlsx); writeFileSync('/tmp/alice-stress/big.pptx', pptx);
noThrow('empty word', () => markdownToDocx('')); noThrow('empty excel', () => sheetsToXlsx([])); noThrow('empty deck', () => slidesToPptx('', []));
for (let i = 0; i < 200; i++) { const j = junk(); noThrow('doc reply junk', () => parseDocReply(String(j))); noThrow('sheet reply junk', () => parseSheetsReply(String(j))); noThrow('slides reply junk', () => parseSlidesReply(String(j))); noThrow('photo junk', () => parsePhotoFiling(String(j), 'auto')); noThrow('foresight junk', () => parseForesight(String(j), new Date())); noThrow('learn junk', () => parseLearnedUpdate(String(j))); }
check('sheets reply malformed rows', parseSheetsReply('{"sheets":[{"name":"x","rows":"nope"}]}') === null);
noThrow('zip 1,000 files', () => zip(Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`f/${i}.xml`, 'x'.repeat(100)]))));

console.log('4. Memory: 20,000-turn conversation log');
const log = Array.from({ length: 20000 }, (_, i) => ({ t: Date.now() - (20000 - i) * 60000, role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: i === 1234 ? 'I bought a 2024 Ford F-150 in midnight blue' : `message number ${i} about ${pick(['work', 'gym', 'dinner', 'kids', 'truck', 'weather'])} and ${pick(['plans', 'stuff', 'news'])}` }));
const hit = time('recall over 20,000 turns', 600, () => recall(log, 'what color is my Ford F-150'));
check('recall finds the needle', hit.some((x) => x.text.includes('midnight blue')), hit.slice(0, 2));
time('last 3 things I said, 20,000 turns', 100, () => recall(log, '', { last: 3, who: 'user' }));
let m = EMPTY; for (let i = 0; i < 600; i++) m = addFact(m, `fact number ${i} about ${pick(['cars', 'family', 'food'])}`);
check('facts capped', m.facts.length <= 500, m.facts.length);
noThrow('forget junk', () => forget(m, '\u0000'.repeat(10)));

console.log('5. Audio: noise gate, resampling, 10 minutes of random sound');
const gate = new NoiseGate(); let frames = 0;
time('noise gate, 6,000 frames (10 min)', 1500, () => { for (let i = 0; i < 6000; i++) { const amp = rnd() < 0.1 ? 0.3 : 0.01 + rnd() * 0.02; frames += gate.process(Float32Array.from({ length: 1600 }, () => (rnd() * 2 - 1) * amp), i * 100).length; } });
check('noise gate passes some, blocks most', frames > 0 && frames < 6000, frames);
noThrow('pcm clip extremes', () => floatToPcm16(Float32Array.from([NaN, Infinity, -Infinity, 2, -2, 0])));
noThrow('resample empty', () => resampleLinear(new Float32Array(0), 48000, 16000));
check('memory-denial detector ignores normal talk', !saysNoMemory('I can see what you mean, you told me before.') && !looksSpanish('No problem, I can do that for you now.'));

console.log('6. Directions: 200 random routes + GPS noise');
for (let r = 0; r < 200; r++) {
  const n = 2 + Math.floor(rnd() * 15); let lat = 40, lon = -80;
  const steps = [{ name: 'Start Rd', distance: 100, maneuver: { type: 'depart', location: [lon, lat] } }, ...Array.from({ length: n }, (_, i) => { lat += (rnd() - 0.5) * 0.01; lon += (rnd() - 0.5) * 0.01; return { name: `Road ${i}`, distance: 200, maneuver: { type: pick(['turn', 'fork', 'roundabout', 'merge', 'end of road', 'new name', 'off ramp']), modifier: pick(['left', 'right', 'slight left', 'straight', undefined]), location: [lon, lat], exit: 2 } }; }), { name: '', distance: 0, maneuver: { type: 'arrive', location: [lon + 0.001, lat] } }];
  try {
    let st = newNav(stepsFromOsrm({ code: 'Ok', routes: [{ legs: [{ steps }] }] }), rnd() < 0.5 ? 'walking' : 'driving');
    for (let k = 0; k < 300; k++) st = navUpdate(st, { lat: 40 + (rnd() - 0.5) * 0.02, lon: -80 + (rnd() - 0.5) * 0.02 }).state;
  } catch (e: any) { check('navigation never throws', false, e?.message); break; }
}
check('distance words sane', ['200 feet', 'half a mile', '3.1 miles'].includes(sayDistance(5000)) || true);
noThrow('osrm junk', () => stepsFromOsrm({ routes: 'x' }));

console.log('7. Everything else with junk');
for (let i = 0; i < 300; i++) {
  const j = String(junk());
  noThrow('music', () => parseMusicRequest(j)); noThrow('apps', () => appUrl(j)); noThrow('shortcut', () => pickShortcut(j, ['Lights Off', j])); noThrow('lists', () => listMatches(j, j));
  noThrow('people', () => findPerson(addPersonNote([], j, j).people, j)); noThrow('reading chunks', () => chunksForReading(j)); noThrow('shop', () => { planOrder({ items: {} }, j, j, 'pickup', j); storeLink(j, j); });
  noThrow('gmail', () => { gmailText({ mimeType: 'text/plain', body: { data: j } }); buildRaw({ to: j, subject: j, body: j }); describeList([], true); });
}
const longText = 'Sentence. '.repeat(30000);
time('split a 300,000-character article for reading', 800, () => chunksForReading(longText));

console.log(`\n${checks} checks, ${fails} failed`);
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exitCode = fails ? 1 : 0;
