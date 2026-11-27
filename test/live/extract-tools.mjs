// Pulls Alice's live tool list (TOOLS) out of src/live.ts as JSON, so the live test uses exactly what the app sends.
import { readFileSync, writeFileSync } from 'fs';
const src = readFileSync(new URL('../../src/live.ts', import.meta.url), 'utf8');
const start = src.indexOf('const TOOLS = [');
const end = src.indexOf('\n];', start);
const literal = src.slice(start + 'const TOOLS = '.length, end + 2);
const tools = Function(`"use strict"; return (${literal});`)();
writeFileSync(new URL('./tools.json', import.meta.url), JSON.stringify(tools, null, 1));
console.log(tools.length, 'tools extracted');
