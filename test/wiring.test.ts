/** System check: every tool Alice's live voice can call, and every action the typed/offline paths can produce,
 *  is validated (intents.ts) and handled (actions.ts); every capability example is reachable. */
import { readFileSync } from 'fs';
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const live = src('live.ts'), intents = src('intents.ts'), actions = src('actions.ts'), offline = src('offlineCore.ts');
const tools = [...live.matchAll(/\{ name: '([a-z_0-9]+)'/g)].map((m) => m[1]);
const iCases = new Set([...intents.matchAll(/case '([a-z_0-9]+)'/g)].map((m) => m[1]));
const aCases = new Set([...actions.matchAll(/case '([a-z_0-9]+)'/g)].map((m) => m[1]));
const offTypes = [...offline.matchAll(/type: '([a-z_0-9]+)'/g)].map((m) => m[1]);
const schema = [...intents.matchAll(/\{"type":"([a-z_0-9]+)"/g)].map((m) => m[1]);
let fails = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) { fails++; console.log('FAIL', name, got ?? ''); } else console.log('PASS', name); };
check(`${tools.length} live tools all validated`, tools.every((t) => iCases.has(t)), tools.filter((t) => !iCases.has(t)));
check('live tools all handled', tools.every((t) => aCases.has(t)), tools.filter((t) => !aCases.has(t)));
check('offline commands all handled', offTypes.every((t) => aCases.has(t)), offTypes.filter((t) => !aCases.has(t)));
check(`typed-chat schema (${new Set(schema).size} actions) all handled`, schema.every((t) => aCases.has(t)), schema.filter((t) => !aCases.has(t)));
check('no duplicate live tool names', new Set(tools).size === tools.length, tools.filter((t, i) => tools.indexOf(t) !== i));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exitCode = fails ? 1 : 0;
