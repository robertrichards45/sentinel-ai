// END-TO-END STRESS TEST of Alice's real voice brain. Connects to Gemini Live exactly like the app does
// (production server token, the app's real tool list and persona) and sends 34 everyday requests, checking
// that each one uses the right ability instead of "I can't do that". Fails the build below 90%.
// Usage: node test/live/live-e2e.mjs [app|locked]
import { readFileSync } from 'fs';
const SERVER = process.env.ALICE_SERVER ?? 'https://alice-server-production-4be3ccd5.up.railway.app';
const variant = process.argv[2] ?? 'app';
const TOOLS = JSON.parse(readFileSync(new URL('./tools.json', import.meta.url), 'utf8'));
const PERSONA = readFileSync(new URL('./persona.txt', import.meta.url), 'utf8');
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 300) }; } };

const any = (...names) => (r) => names.some((n) => r.tools.includes(n)) || (names.includes('SEARCH') && r.search);
const CASES = [
  ['who are you', 'Hi, who are you?', (r) => /alice/i.test(r.said) && !/i'?m an ai assistant here to help/i.test(r.said)],
  ['self-check', 'Something feels off. Run a self check and fix yourself.', any('self_check')],
  ['phone call', 'Call Mom.', any('call')],
  ['text message', "Text Kylee that I'm running late.", any('text')],
  ['weather', "What's the weather like today?", any('weather', 'look_up', 'SEARCH')],
  ['music: playlist', 'Play my workout playlist.', any('play_music')],
  ['music: skip', 'Skip this song.', any('music_control')],
  ['memory: past chat', 'What did I tell you yesterday about my truck?', any('recall')],
  ['reminder', 'Remind me to take out the trash tomorrow at 7 pm.', any('reminder')],
  ['calendar event', 'I have a dentist appointment next Tuesday at 2 pm, put it on my calendar.', any('event')],
  ['timer', 'Set a timer for 10 minutes.', any('timer')],
  ['alarm', 'Wake me up at 6 am tomorrow.', any('alarm')],
  ['directions', 'Give me walking directions to the nearest Starbucks.', any('directions')],
  ['open app', 'Open Spotify.', any('open_app', 'play_music')],
  ['shopping list', 'Add milk and eggs to my shopping list.', any('list_add')],
  ['meeting notes', 'Take notes on this meeting.', any('take_notes')],
  ['make a file', 'Make me a federal resume in Word for a police officer job.', any('make_file')],
  ["what's new", "What's new in your latest update?", any('whats_new', 'capabilities')],
  ['smart home', 'Turn off the living room lights.', any('home_control', 'run_shortcut', 'ifttt')],
  ['email', 'Do I have any new emails?', any('email_check')],
  ['shopping', 'Order me dog food from Walmart for pickup.', any('shop')],
  ['health', 'How did I sleep last night?', any('health_summary')],
  ['emergency', "I need help, I'm hurt.", any('emergency')],
  ['live info', 'Who won the Cowboys game last week?', any('look_up', 'SEARCH')],
  ['remember a person', 'This is Mike from work, he loves fishing.', any('person_note', 'remember')],
  ['remember a fact', 'Remember that I drive a 2024 Ford F-150.', any('remember')],
  ['what you know', 'What do you know about me?', any('what_you_know', 'recall')],
  ['workout coach', 'Coach my bench press.', any('coach', 'show_camera')],
  ['learn a name', 'Learn the name Kylee, spelled K-Y-L-E-E.', any('learn_word')],
  ['read aloud', 'Read me the article I just copied.', any('read_this')],
  ['scan', 'Scan this document for me.', any('scan_doc')],
  ['day recap', 'Recap my day.', any('daily_recap')],
  ['look', 'What am I looking at right now?', any('show_camera')],
  ['capabilities', 'What can you do?', any('capabilities', 'whats_new') ],
];

const reg = await j(await fetch(`${SERVER}/v1/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installId: `ci-live-e2e-${variant}-${Date.now() % 100000}` }) }));
const results = [];
// One session per 12 requests (keeps each conversation short, like real use).
for (let start = 0; start < CASES.length; start += 12) {
  const tok = await j(await fetch(`${SERVER}/v1/live`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` }, body: JSON.stringify(variant === 'locked' ? { locked: true } : {}) }));
  if (!tok.endpoints) { console.log('TOKEN ERROR', JSON.stringify(tok)); process.exit(1); }
  if (start === 0) console.log(`variant=${variant} locked=${tok.locked} version=${tok.version} model=${tok.model}`);
  await new Promise((resolve) => {
    const batch = CASES.slice(start, start + 12);
    const ws = new WebSocket(tok.endpoints[0]);
    let i = -1, cur = null, settle = null;
    const finishCase = () => {
      if (!cur) return;
      const ok = cur.check(cur);
      results.push({ name: cur.name, ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${cur.name}: tools=[${cur.tools.join(',')}]${cur.search ? ' +search' : ''} said="${cur.said.trim().replace(/\s+/g, ' ').slice(0, 110)}"`);
      cur = null;
    };
    const next = () => {
      finishCase();
      i++;
      if (i >= batch.length) { ws.close(); return resolve(); }
      const [name, text, check] = batch[i];
      cur = { name, check, tools: [], said: '', search: false };
      ws.send(JSON.stringify({ realtimeInput: { text } }));
    };
    const guard = setTimeout(() => { console.log('TIMEOUT at', cur?.name); finishCase(); ws.close(); resolve(); }, 240000);
    ws.onopen = () => ws.send(JSON.stringify({ setup: {
      model: `models/${tok.model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'en-US', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
      systemInstruction: { parts: [{ text: `${PERSONA}\n\nUse the tools to take actions; never say you can't do something a tool does. You DO remember past conversations (use recall). Always reply in English.` }] },
      tools: [{ googleSearch: {} }, { functionDeclarations: TOOLS }],
      inputAudioTranscription: {}, outputAudioTranscription: {},
    } }));
    ws.onclose = () => { clearTimeout(guard); finishCase(); resolve(); };
    ws.onmessage = async (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : Buffer.from(await ev.data.arrayBuffer()).toString('utf8');
      let m; try { m = JSON.parse(text); } catch { return; }
      if (m.setupComplete) return next();
      if (m.toolCall?.functionCalls?.length) {
        if (settle) { clearTimeout(settle); settle = null; }
        for (const c of m.toolCall.functionCalls) cur?.tools.push(c.name);
        ws.send(JSON.stringify({ toolResponse: { functionResponses: m.toolCall.functionCalls.map((c) => ({ id: c.id, name: c.name, response: { result: c.name === 'weather' ? 'Sunny, 54 F.' : 'Done.' } })) } }));
        return;
      }
      const sc = m.serverContent; if (!sc) return;
      if (sc.groundingMetadata) { if (cur) cur.search = true; }
      if (sc.outputTranscription?.text && cur) cur.said += sc.outputTranscription.text;
      // A tool call can arrive just after a turn ends, so wait a moment before moving on.
      if (sc.turnComplete) { if (settle) clearTimeout(settle); settle = setTimeout(() => { settle = null; next(); }, 1500); }
    };
  });
}
const passed = results.filter((r) => r.ok).length;
const pct = Math.round((passed / CASES.length) * 100);
console.log(`\n${passed}/${CASES.length} passed (${pct}%) [${variant}]`);
console.log(pct >= 90 ? 'ALL GOOD' : 'TOO MANY FAILURES');
process.exit(pct >= 90 ? 0 : 1);
