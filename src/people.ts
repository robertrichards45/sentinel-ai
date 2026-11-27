import { readJson, writeJson } from './storage';
import { Person, addPersonNote, findPerson, describePerson } from './peopleCore';

let people: Person[] = [];
let loaded = false;
const listeners = new Set<() => void>();
export const onPeople = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export async function listPeople() { if (!loaded) { people = await readJson<Person[]>('people.json', []); loaded = true; } return people; }
export const peopleNames = () => people.map((p) => p.name);
const save = async () => { await writeJson('people.json', people); listeners.forEach((l) => l()); };

export async function personNote(name: string, note: string): Promise<string> {
  await listPeople();
  const r = addPersonNote(people, name, note);
  people = r.people; await save();
  return `Got it, I'll remember that about ${r.person.name}.`;
}
export async function personInfo(name: string): Promise<string> {
  await listPeople();
  return describePerson(findPerson(people, name), name);
}
export async function forgetPerson(id: string) { await listPeople(); people = people.filter((p) => p.id !== id); await save(); }
listPeople();
