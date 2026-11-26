import { BUILT_IN_MODES, Mode, importModes } from './modes';
import { readJsonArray, writeJson } from './storage';

let custom: Mode[] = [];
export const allModes = () => [...BUILT_IN_MODES, ...custom];
export async function loadModes() { custom = await readJsonArray<Mode>('modes.json'); }
export async function addModePack(json: string) {
  const r = importModes(json, allModes());
  if (r.added.length) { custom = [...custom, ...r.added]; await writeJson('modes.json', custom); }
  return r;
}
export async function removeMode(id: string) {
  custom = custom.filter((m) => m.id !== id);
  await writeJson('modes.json', custom);
}
