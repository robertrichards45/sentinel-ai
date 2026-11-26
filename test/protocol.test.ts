// Replays the real BLE captures through the decoder and checks known facts.
// Run: npx tsx test/protocol.test.ts
import { readFileSync } from 'node:fs';
import { parseChannelA, parseChannelB, parseAdvert, ssidFromMac } from '../src/protocol';

const DIAG = (process.env.G2_FIXTURES ?? __dirname + '/fixtures') + '/';
let fails = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  got: ' + JSON.stringify(got)}`);
  if (!ok) fails++;
};
const bytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));

function replay(file: string) {
  const out: any[] = [];
  for (const line of readFileSync(DIAG + file, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    const b = bytes(r.hex);
    out.push({ t: r.t, ...(r.ch.startsWith('56FF') ? parseChannelA(b) : parseChannelB(b)) });
  }
  return out;
}

const c1 = replay('notify_capture_1.jsonl');
const c2 = replay('notify_capture_2.jsonl');

// media count: 2 files before capture 1, 4 before capture 2, then 5, 6 (verified against USB drive)
check('capture1 media count = 2', c1.find((e) => e.kind === 'mediaCount')?.count === 2);
const counts2 = c2.filter((e) => e.kind === 'mediaCount').map((e) => e.count);
check('capture2 media counts = 4,5,6', JSON.stringify(counts2) === '[4,5,6]', counts2);

// clock = 2026-11-25 23:39:15 UTC in capture 1
const clk = c1.find((e) => e.kind === 'clock');
check('capture1 clock = 2026-11-25T23:39:15Z', new Date(clk.unixSeconds * 1000).toISOString() === '2026-11-25T23:39:15.000Z', clk);

check('address decoded', c1.find((e) => e.kind === 'address')?.mac === 'C4:01:03:00:4E:31');
check('heartbeats decode as 65', c1.filter((e) => e.kind === 'heartbeat').every((e) => e.value === 65));
const busy = c2.filter((e) => e.kind === 'busy').map((e) => (e.on ? 1 : 0)).join('');
check('capture2 busy toggles 10101010', busy === '10101010', busy);
check('no unparsed channel-B packets', c2.filter((e) => e.kind === 'raw' && e.channel === 'B').length === 0);

const adv = parseAdvert(bytes('4a59c40103004e319d0039004300'));
check('advert company 0x594A', adv.company === 0x594a, adv);
check('advert MAC', adv.mac === 'C4:01:03:00:4E:31', adv);
check('SSID from MAC = G2-4E31', ssidFromMac(adv.mac!) === 'G2-4E31');

const unknown = [...c1, ...c2].filter((e) => e.kind === 'raw').map((e) => e.hex.slice(0, 6));
console.log('unrecognised record prefixes (kept raw):', [...new Set(unknown)].join(', ') || 'none');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
