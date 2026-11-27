/** People you've told Alice about ("this is Mike from work"). Pure logic, unit-tested on the PC. */
export type Person = { id: string; name: string; notes: string[]; updated: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 '-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(my|the)\s+/, '');
const tidyName = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);

/** Exact name, then first name, then a unique "starts with" match. */
export function findPerson(people: Person[], name: string): Person | null {
  const n = norm(name);
  if (!n) return null;
  const exact = people.find((p) => norm(p.name) === n);
  if (exact) return exact;
  const first = people.filter((p) => norm(p.name).split(' ')[0] === n.split(' ')[0]);
  if (first.length === 1) return first[0];
  const starts = people.filter((p) => norm(p.name).startsWith(n));
  return starts.length === 1 ? starts[0] : null;
}

export function addPersonNote(people: Person[], name: string, note: string, now = Date.now()): { people: Person[]; person: Person } {
  const clean = note.trim().replace(/\s+/g, ' ').slice(0, 300);
  let hit = findPerson(people, name);
  // "Sarah Kim" is not "Sarah Lee": with a full name, only merge into an exact match or a first-name-only entry.
  if (hit && norm(name).includes(' ') && norm(hit.name) !== norm(name) && norm(hit.name).includes(' ')) hit = null;
  if (hit) {
    const notes = clean && !hit.notes.some((x) => x.toLowerCase() === clean.toLowerCase()) ? [...hit.notes, clean].slice(-30) : hit.notes;
    // A fuller name wins ("Mike" then "Mike Torres").
    const better = norm(name).length > norm(hit.name).length && norm(name).startsWith(norm(hit.name).split(' ')[0]) ? tidyName(name) : hit.name;
    const p = { ...hit, name: better, notes, updated: now };
    return { people: people.map((x) => (x.id === hit.id ? p : x)), person: p };
  }
  const p: Person = { id: now.toString(36) + Math.random().toString(36).slice(2, 5), name: tidyName(name), notes: clean ? [clean] : [], updated: now };
  return { people: [...people, p].slice(-300), person: p };
}

export function describePerson(p: Person | null, asked: string): string {
  if (!p) return `I don't know anyone called ${asked} yet. Tell me, like "${asked} is my neighbor and has two kids".`;
  if (!p.notes.length) return `I know the name ${p.name}, but nothing else yet.`;
  return `${p.name}: ${p.notes.map((n) => n.replace(/\.$/, '')).join('; ')}.`;
}
