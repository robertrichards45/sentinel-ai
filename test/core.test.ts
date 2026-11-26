// Unit tests for the pure modules, using the REAL files backed up from the glasses.
// Run: npx tsx test/core.test.ts
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { checkMedia, fixedExifDate, repairJpegDate, readExifDate, findExifSegment } from '../src/mediaCore';
import { parseAssistantTurn, validateAction } from '../src/intents';
import { addFact, forget, addTurn, memoryPrompt, EMPTY, MAX_HISTORY } from '../src/memoryCore';
import { BUILT_IN_MODES, importModes } from '../src/modes';
import { markdownToHtmlBody, documentHtml, fileNameFor } from '../src/docCore';
import { splitForSpeech } from '../src/speechCore';
import { floatToPcm16, resampleLinear, frameText } from '../src/liveCore';
import { describeWeather } from '../src/weatherCore';

const BK = (process.env.USERPROFILE ?? '/nonexistent') + '/Documents/G2-Glasses-Diagnostics/media-backup/';
let fails = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  got: ' + JSON.stringify(got)}`);
  if (!ok) fails++;
};

// ---- EXIF month repair (pure) ----
check('EXIF month fix 10->11', fixedExifDate('2026:10:25 18:10:09', '20261125181008.jpeg') === '2026:11:25 18:10:09');
check('EXIF year rollover 12->01', fixedExifDate('2026:12:31 23:00:00', '20270131230000.jpeg') === '2027:01:31 23:00:00');
check('EXIF already correct -> no change', fixedExifDate('2026:11:25 18:10:09', '20261125181008.jpeg') === null);
check('EXIF unrelated mismatch -> no guess', fixedExifDate('2026:03:02 10:00:00', '20261125181008.jpeg') === null);

// ---- real glasses files: only on Robert's PC (personal photos are never put in the repo) ----
if (!existsSync(BK)) console.log('SKIP  real-media tests (backup folder not on this machine)');
else {
const files = readdirSync(BK).filter((f) => /\.(jpeg|mp4)$/i.test(f));
const results = files.map((f) => ({ f, r: checkMedia(f, new Uint8Array(readFileSync(BK + f))) }));
const bad = results.filter((x) => !x.r.ok).map((x) => x.f);
check(`integrity: ${files.length} real files checked, only the overwritten photo fails`, JSON.stringify(bad) === '["20261125184654.jpeg"]', bad);
const vid = results.find((x) => x.f === '20261125235217.mp4')!.r;
check('mp4 duration 40.1 s read from header', Math.abs((vid.durationSec ?? 0) - 40.124) < 0.01, vid);
const orig = new Uint8Array(readFileSync(BK + '20261125181008.jpeg'));
const before = Buffer.from(orig).toString('hex');
const rep = repairJpegDate('20261125181008.jpeg', orig);
check('real photo repaired: all 3 EXIF dates now 2026:11:25', rep.changed && rep.count === 3 && readExifDate(rep.bytes) === '2026:11:25 18:10:09', rep);
check('repaired photo still a valid JPEG', checkMedia('x.jpeg', rep.bytes).ok);
check('same size, original array not modified', rep.bytes.length === orig.length && Buffer.from(orig).toString('hex') === before);
let diff = 0;
for (let i = 0; i < orig.length; i++) if (orig[i] !== rep.bytes[i]) diff++;
check('only the 3 month digits changed (bytes differ: ' + diff + ')', diff > 0 && diff <= 6, diff);
const seg = findExifSegment(orig)!;
let outside = 0;
for (let i = 0; i < orig.length; i++) if (orig[i] !== rep.bytes[i] && (i < seg.start || i >= seg.end)) outside++;
check('no byte outside the EXIF block changed (image data untouched)', outside === 0, outside);
const allJ = files.filter((f) => f.endsWith('.jpeg') && !bad.includes(f));
const fixedAll = allJ.map((f) => readExifDate(repairJpegDate(f, new Uint8Array(readFileSync(BK + f))).bytes)!.slice(0, 7));
check(`all ${allJ.length} good photos end up with 2026:11 dates`, fixedAll.every((d) => d === '2026:11'), fixedAll);
check('overwritten photo is left alone', !repairJpegDate('20261125184654.jpeg', new Uint8Array(readFileSync(BK + '20261125184654.jpeg'))).changed);
}

// ---- intents ----
const modes = BUILT_IN_MODES.map((m) => m.id);
const t1 = parseAssistantTurn('```json\n{"reply":"Done","actions":[{"type":"reminder","title":"Call mom","due":"2026-11-26T09:00:00-05:00"},{"type":"rm -rf"}]}\n```', modes);
check('fenced JSON parsed, invalid action dropped', t1.actions.length === 1 && t1.actions[0].type === 'reminder', t1);
check('reminder time normalised to ISO', (t1.actions[0] as any).due === '2026-11-26T14:00:00.000Z', t1.actions[0]);
check('plain text reply kept, no actions', parseAssistantTurn('It is sunny.', modes).actions.length === 0);
check('bad email address dropped but draft kept', (validateAction({ type: 'email', to: 'not an email', subject: 's', body: 'b' }, modes) as any)?.to === undefined);
check('unknown mode rejected', validateAction({ type: 'set_mode', mode: 'hacker' }, modes) === null);
check('event duration clamped to default', (validateAction({ type: 'event', title: 'x', start: '2026-12-01T10:00:00Z', durationMin: 99999 }, modes) as any).durationMin === 60);
check('navigate defaults to walking', (validateAction({ type: 'navigate', destination: 'Union Station', mode: 'teleport' }, modes) as any).mode === 'walking');

// ---- memory ----
let m = addFact(EMPTY, 'My truck is a 2019 F-150');
m = addFact(m, 'my truck is a 2019  f-150'); // duplicate (case/space)
check('duplicate facts ignored', m.facts.length === 1);
const fg = forget(addFact(m, 'Gate code is on the fridge'), 'truck');
check('forget removes only matching facts', fg.removed === 1 && fg.state.facts.length === 1, fg);
let h = EMPTY;
for (let i = 0; i < 40; i++) h = addTurn(h, 'user', 'msg ' + i);
check(`history capped at ${MAX_HISTORY}`, h.history.length === MAX_HISTORY && h.history[0].text === 'msg 16');
check('memory prompt contains facts', memoryPrompt(m).includes('F-150'));

// ---- mode packs ----
const imp = importModes('[{"id":"Fishing Guide!","name":"Fishing","prompt":"Identify fish"},{"id":"general","name":"x","prompt":"y"},{"name":"no id"}]', BUILT_IN_MODES);
check('mode pack: 1 added, 2 rejected', imp.added.length === 1 && imp.added[0].id === 'fishingguide' && imp.errors.length === 2, imp);


// ---- documents ----
{
  const t = parseAssistantTurn('{"reply":"Done.","actions":[{"type":"document","title":"Packing list","content":"# Trip\\n- socks"}]}', []);
  check('document action parsed, defaults to pdf', t.actions[0]?.type === 'document' && (t.actions[0] as any).format === 'pdf', t.actions);
  check('document without content rejected', validateAction({ type: 'document', title: 'x', content: '  ' }, []) === null, 'kept');
  const h = markdownToHtmlBody('# Title\n\nHello **bold** and *it*.\n\n- a\n- b\n\n1. one\n2. two\n\n| A | B |\n|---|---|\n| 1 | 2 |');
  check('markdown: heading, bold, italic', h.includes('<h1>Title</h1>') && h.includes('<strong>bold</strong>') && h.includes('<em>it</em>'), h);
  check('markdown: lists and table', h.includes('<ul><li>a</li><li>b</li></ul>'.replace(/></g, '>\n<')) || (h.includes('<li>a</li>') && h.includes('<ol>') && h.includes('<td>2</td>') && h.includes('<th>A</th>')), h);
  const x = markdownToHtmlBody('<script>alert(1)</script> & "q"');
  check('markdown: HTML is escaped (no injection)', !x.includes('<script>') && x.includes('&lt;script&gt;') && x.includes('&amp;'), x);
  check('document has title when no H1', documentHtml('My Plan', 'text').includes('<h1>My Plan</h1>'), 'no title');
  check('safe file name', fileNameFor('Q4: report / draft*?', 'pdf') === 'Q4 report draft.pdf' && fileNameFor('***', 'md') === 'Alice document.md', fileNameFor('Q4: report / draft*?', 'pdf'));
}

// ---- speed: spoken-question transcript + early speech ----
{
  const t = parseAssistantTurn('{"heard":"what time is it","reply":"It is noon.","actions":[]}', []);
  check('heard transcript parsed', t.heard === 'what time is it' && t.reply === 'It is noon.', t);
  const [a, b] = splitForSpeech('Short answer.');
  check('short answer stays one piece', a === 'Short answer.' && b === '', [a, b]);
  const long = 'The Milwaukee Brewers won the World Series on October 28, 2026. ' + 'They beat the Rays in five games and it was the first title in franchise history. '.repeat(3);
  const [f, r] = splitForSpeech(long);
  check('long answer splits after first sentence', f.endsWith('2026.') && r.startsWith('They beat') && (f + ' ' + r).replace(/\s+/g, ' ').trim() === long.replace(/\s+/g, ' ').trim(), [f, r.slice(0, 30)]);
  const [g, h] = splitForSpeech('x'.repeat(300));
  check('no sentence end: still splits safely', g.length > 0 && g.length + h.length === 300, [g.length, h.length]);
}

// ---- live conversation audio ----
{
  const p = floatToPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]));
  check('float -> PCM16 with clipping', p[0] === 0 && p[1] === 32767 && p[2] === -32768 && p[3] === 32767 && p[4] === -32768 && p[5] === 16384, Array.from(p));
  const r = resampleLinear(new Float32Array(480).fill(0.25), 48000, 16000);
  check('48 kHz -> 16 kHz keeps length ratio and level', r.length === 160 && Math.abs(r[80] - 0.25) < 1e-6, r.length);
  const same = new Float32Array([1, 2]);
  check('same rate is a no-op', resampleLinear(same, 16000, 16000) === same, 'copied');
}

// ---- weather ----
{
  const w = { current: { temperature_2m: 41.2, apparent_temperature: 35, weather_code: 3, wind_speed_10m: 22, precipitation: 0 },
    daily: { time: ['a', 'b'], weather_code: [61, 0], temperature_2m_max: [45, 50], temperature_2m_min: [33, 30], precipitation_probability_max: [70, 5] } };
  const t = describeWeather(w, 'New York, New York', 'fahrenheit');
  check('weather sentence', t.startsWith("In New York, New York it's 41°F and overcast, feels like 35, windy at 22 mph.") && t.includes('70% chance of rain') && t.includes('Tomorrow: clear, 30 to 50°F.'), t);
  check('weather action validated', JSON.stringify(validateAction({ type: 'weather', place: 'Paris', days: 9 }, [])) === '{"type":"weather","place":"Paris"}', validateAction({ type: 'weather', place: 'Paris', days: 9 }, []));
  check('weather missing data handled', describeWeather({}, 'x', 'celsius').startsWith("I couldn't"), 'threw');
}

// ---- live: binary WebSocket frames (the 0.6.0/0.6.1 "stuck connecting" bug) ----
{
  const json = '{"setupComplete":{}}';
  const ab = new TextEncoder().encode(json).buffer;
  check('frame: text', frameText(json) === json, frameText(json));
  check('frame: ArrayBuffer', frameText(ab) === json, frameText(ab));
  check('frame: Uint8Array view', frameText(new Uint8Array(ab)) === json, 'x');
  check('frame: unknown -> empty', frameText({}) === '', 'x');
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
