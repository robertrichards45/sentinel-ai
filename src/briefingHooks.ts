/** Extra parts of the morning briefing that optional modules add (e.g. Apple Health: last night's sleep). */
export const briefingHooks: (() => Promise<string>)[] = [];
