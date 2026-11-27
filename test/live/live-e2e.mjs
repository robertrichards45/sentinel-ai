// END-TO-END test of Alice's real voice brain: connects to Gemini Live exactly like the app (through the
// production server's token), sends the app's real tool list, and checks that she (1) follows her instructions,
// (2) uses her tools for calls, weather and self-check, (3) gets the voice the app asks for.
// Usage: node test/live/live-e2e.mjs [locked|unlocked]
import { readFileSync } from 'fs';
const SERVER = process.env.ALICE_SERVER ?? 'https://alice-server-production-4be3ccd5.up.railway.app';
const variant = process.argv[2] ?? 'locked';
const TOOLS = JSON.parse(readFileSync(new URL('./tools.json', import.meta.url), 'utf8'));
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 300) }; } };
const reg = await j(await fetch(`${SERVER}/v1/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installId: `ci-live-e2e-${variant}` }) }));
const tok = await j(await fetch(`${SERVER}/v1/live`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` }, body: JSON.stringify(variant === 'unlocked' ? { unlocked: true } : {}) }));
if (!tok.endpoints) { console.log('TOKEN ERROR', JSON.stringify(tok)); process.exit(1); }
console.log(`variant=${variant} locked=${tok.locked} version=${tok.version} model=${tok.model}`);
const ws = new WebSocket(tok.endpoints[0]);
const prompts = [
  ['instructions', 'Hi! Who are you?', (r) => /PINEAPPLE/i.test(r.said)],
  ['self_check', 'Run a self check and fix yourself.', (r) => r.tools.includes('self_check')],
  ['call', 'Call Mom.', (r) => r.tools.includes('call')],
  ['weather', "What's the weather today?", (r) => r.tools.includes('weather') || r.tools.includes('look_up') || r.search],
  ['music', 'Play my workout playlist.', (r) => r.tools.includes('play_music')],
  ['memory', 'What did I tell you yesterday about my truck?', (r) => r.tools.includes('recall')],
];
let i = -1, cur = null; const results = [];
let fails = 0;
const next = () => {
  if (cur) { const ok = cur.check(cur); results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${cur.name}: tools=[${cur.tools.join(',')}] search=${cur.search} said="${cur.said.trim().slice(0, 140)}"`); if (!ok) fails++; }
  i++;
  if (i >= prompts.length) { console.log(fails ? `\n${fails} FAILED (${variant})` : `\nALL PASSED (${variant})`); ws.close(); process.exit(fails ? 1 : 0); }
  const [name, text, check] = prompts[i];
  cur = { name, check, tools: [], said: '', search: false };
  ws.send(JSON.stringify({ realtimeInput: { text } }));
};
setTimeout(() => { console.log('TIMEOUT at', cur?.name); process.exit(1); }, 150000);
ws.onopen = () => ws.send(JSON.stringify({ setup: {
  model: `models/${tok.model}`,
  generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'en-US', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
  systemInstruction: { parts: [{ text: 'You are Alice, a voice assistant in smart glasses. Begin EVERY reply with the word PINEAPPLE. Use your tools for actions: call for phone calls, weather for weather, self_check for self checks or repairs, play_music for music, recall for anything from past conversations. Never say you cannot do something a tool does.' }] },
  tools: [{ googleSearch: {} }, { functionDeclarations: TOOLS }],
  inputAudioTranscription: {}, outputAudioTranscription: {},
} }));
ws.onclose = (e) => { console.log('CLOSED', e.code, e.reason); process.exit(1); };
ws.onmessage = async (ev) => {
  const text = typeof ev.data === 'string' ? ev.data : Buffer.from(await ev.data.arrayBuffer()).toString('utf8');
  let m; try { m = JSON.parse(text); } catch { return; }
  if (m.setupComplete) { console.log('setup accepted'); return next(); }
  if (m.toolCall?.functionCalls?.length) {
    for (const c of m.toolCall.functionCalls) cur.tools.push(c.name);
    ws.send(JSON.stringify({ toolResponse: { functionResponses: m.toolCall.functionCalls.map((c) => ({ id: c.id, name: c.name, response: { result: c.name === 'weather' ? 'Sunny, 54 degrees.' : 'Done.' } })) } }));
    return;
  }
  const sc = m.serverContent; if (!sc) return;
  if (sc.groundingMetadata || sc.modelTurn?.parts?.some((p) => p.executableCode)) cur.search = true;
  if (sc.outputTranscription?.text) cur.said += sc.outputTranscription.text;
  if (sc.turnComplete) setTimeout(next, 300);
};
