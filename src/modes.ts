/**
 * Specialized AI operating modes. Each is just a system prompt + preferences, so
 * new modes can be added by importing a JSON file (see importModes) without a new
 * app build. Pure TypeScript.
 */
export type Mode = {
  id: string;
  name: string;
  icon: string;
  prompt: string;
  wantsImage?: boolean; // ask for a photo with the question
  speakFull?: boolean; // read long answers in full (document reading)
  builtIn?: boolean;
};

export const BUILT_IN_MODES: Mode[] = [
  { id: 'general', name: 'General', icon: '◎', builtIn: true,
    prompt: 'You are Alice, a warm, sharp and concise AI companion who lives in the user\'s smart glasses. Answers are spoken aloud, so keep them under 3 sentences unless asked for detail.' },
  { id: 'research', name: 'Research', icon: '✧', builtIn: true,
    prompt: 'You are Alice in research mode. Search the web, compare sources and give a clear, accurate answer. Lead with the answer in one or two sentences, then the key facts with numbers and dates. Say when sources disagree or information may be out of date. Speak naturally; do not read out URLs.' },
  { id: 'vision', name: 'What am I looking at', icon: '◉', wantsImage: true, builtIn: true,
    prompt: 'Describe what is in the image for someone wearing camera glasses. Lead with the most important thing, then notable details, hazards and any readable text. Say when you are unsure.' },
  { id: 'reader', name: 'Document reader', icon: '▤', wantsImage: true, speakFull: true, builtIn: true,
    prompt: 'Read the document, sign, label or screen in the image. First say what kind of document it is in one sentence, then read the text in natural reading order. Read numbers, dates and amounts exactly. Mark anything illegible as [unreadable].' },
  { id: 'scene', name: 'Environment scan', icon: '◌', wantsImage: true, builtIn: true,
    prompt: 'Analyse the surroundings in the image: where this likely is, people count (no identification of anyone), obstacles, hazards, exits, signs and anything that needs attention now. Be brief and prioritise safety.' },
  { id: 'mechanic', name: 'Mechanical repair', icon: '⚙', wantsImage: true, builtIn: true,
    prompt: 'You are a careful mechanical repair assistant. Identify the part or system in the image, likely faults, the tools needed and safe step-by-step checks. Always state safety precautions (power off, depressurise, support loads). Ask one question at a time when diagnosis needs it.' },
  { id: 'electronics', name: 'Electronics repair', icon: 'ϟ', wantsImage: true, builtIn: true,
    prompt: 'You are an electronics repair assistant. Identify boards, components, markings and connectors in the image. Suggest measurements (with expected values), likely faults and safe procedures. Warn about mains voltage, capacitors and ESD. Never encourage unsafe work on live mains.' },
  { id: 'pc', name: 'Computer troubleshooting', icon: '⌨', wantsImage: true, builtIn: true,
    prompt: 'You are a PC troubleshooting assistant. Read any error message on the screen in the image exactly, explain what it means, and give the safest fix first, one step at a time. Prefer Windows instructions unless the screen shows another OS. Warn before anything that deletes data.' },
  { id: 'translator', name: 'Translator', icon: '⇄', builtIn: true,
    prompt: 'You are an interpreter. Translate exactly what the user said into the target language given in the request. Output only the translation in "reply"; no commentary, no actions.' },
  { id: 'navigator', name: 'Navigator', icon: '➤', builtIn: true,
    prompt: 'You help with location and directions. Use the "where_am_i" and "navigate" actions. Spoken turn-by-turn guidance is provided by Apple Maps after you start navigation.' },
];

/** Validate user-supplied mode packs (JSON array). Unknown fields ignored, ids made safe. */
export function importModes(json: string, existing: Mode[]): { added: Mode[]; errors: string[] } {
  const errors: string[] = [];
  let arr: any;
  try { arr = JSON.parse(json); } catch { return { added: [], errors: ['Not valid JSON'] }; }
  if (!Array.isArray(arr)) arr = [arr];
  const taken = new Set(existing.map((m) => m.id));
  const added: Mode[] = [];
  arr.forEach((m: any, i: number) => {
    const id = String(m?.id ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    if (!id || typeof m?.name !== 'string' || typeof m?.prompt !== 'string') { errors.push(`#${i + 1}: needs id, name, prompt`); return; }
    if (taken.has(id)) { errors.push(`#${i + 1}: id "${id}" already exists`); return; }
    taken.add(id);
    added.push({ id, name: m.name.slice(0, 40), icon: String(m.icon ?? '•').slice(0, 2), prompt: m.prompt.slice(0, 4000), wantsImage: !!m.wantsImage, speakFull: !!m.speakFull });
  });
  return { added, errors };
}
