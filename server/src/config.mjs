// All configuration comes from environment variables (set in Railway).
// Provider keys are never logged and never returned by any endpoint.
const env = process.env;
const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

export const config = {
  port: Number(env.PORT ?? 8080),
  secret: env.SERVER_SECRET ?? '',                 // signs install tokens (Railway: ${{secret(48)}})
  keys: { gemini: env.GEMINI_API_KEY ?? '', openai: env.OPENAI_API_KEY ?? '' },
  // Which provider answers each mode. "default" covers modes not listed.
  routes: json(env.ROUTES, { default: 'gemini' }),
  transcribeProvider: env.TRANSCRIBE_PROVIDER ?? 'gemini',
  models: {
    gemini: { fast: env.GEMINI_FAST_MODEL ?? 'gemini-3.8-flash', research: env.GEMINI_RESEARCH_MODEL ?? 'gemini-4-argon', transcribe: env.GEMINI_TRANSCRIBE_MODEL ?? 'gemini-3.8-flash', tts: env.GEMINI_TTS_MODEL ?? 'gemini-3.8-flash-tts' },
    openai: { fast: env.OPENAI_FAST_MODEL ?? 'gpt-6-luna', research: env.OPENAI_RESEARCH_MODEL ?? 'gpt-6-luna', transcribe: env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-transcribe' },
  },
  // Modes that may use web search (Google Search / OpenAI web_search)
  searchModes: json(env.SEARCH_MODES, ['general', 'research', 'navigator', 'pc']),
  researchModes: json(env.RESEARCH_MODES, ['research']),
  // USD per 1M tokens [input, output], used only for cost estimates in responses/benchmarks.
  // gpt-6-luna verified on OpenAI's model page 2026-11-25; Gemini values are PLACEHOLDERS until checked.
  prices: json(env.PRICES, {
    'gpt-6-luna': [0.10, 0.50],
    'gemini-3.8-flash': [1.50, 9.00],
    'gemini-4-argon': [null, null],
  }),
  // Real-time conversation (Gemini Live). The phone connects to Google directly with a short-lived token.
  live: { model: env.GEMINI_LIVE_MODEL ?? 'gemini-3.8-live', perInstallPerDay: Number(env.LIVE_DAILY_LIMIT ?? 150) },
  // Natural voices for Alice (Gemini prebuilt voices). The app may pick any of these.
  voices: json(env.VOICES, ['Sulafat', 'Aoede', 'Achernar', 'Vindemiatrix', 'Kore', 'Leda', 'Puck', 'Achird', 'Charon', 'Algieba', 'Iapetus', 'Gacrux']),
  defaultVoice: env.DEFAULT_VOICE ?? 'Sulafat',
  limits: {
    speechPerInstallPerDay: Number(env.SPEECH_DAILY_LIMIT ?? 600),
    perInstallPerDay: Number(env.DAILY_LIMIT ?? 300),
    globalPerDay: Number(env.GLOBAL_DAILY_LIMIT ?? 5000),     // hard spend brake for the whole server
    registrationsPerIpPerDay: Number(env.REG_LIMIT_PER_IP ?? 10),
    maxBodyBytes: Number(env.MAX_BODY_BYTES ?? 12_000_000),
  },
  allowProviderOverride: env.ALLOW_PROVIDER_OVERRIDE === 'true', // on only while benchmarking
  mock: env.MOCK_PROVIDERS === 'true',                             // tests: no real API calls
};

export function costUsd(model, usage) {
  const p = config.prices[model];
  if (!p || p[0] == null || !usage) return null;
  return +(((usage.in ?? 0) * p[0] + (usage.out ?? 0) * p[1]) / 1e6).toFixed(6);
}
