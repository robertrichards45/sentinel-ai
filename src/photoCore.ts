/** Pure parsing for "take a picture and add it to my calendar / notes" (unit-tested on the PC). */
export type PhotoTarget = 'auto' | 'note' | 'calendar' | 'reminder';
export type PhotoFiling =
  | { kind: 'event'; title: string; start: string; durationMin: number; place?: string; details?: string }
  | { kind: 'reminder'; title: string; due?: string; details?: string }
  | { kind: 'note'; title: string; text: string };

export const PHOTO_PROMPT = (target: PhotoTarget, now: Date) => `Look at this photo (a flyer, appointment card, ticket, invitation, receipt, whiteboard, letter, sign or similar) and file it for the user.
Today is ${now.toString()}.
The user asked to put it in: ${target === 'auto' ? 'whatever fits best (calendar if it has a date and time, reminder if it is a to-do with a due date, otherwise a note)' : target}.
Reply with ONLY one JSON object, no other text:
- Calendar: {"kind":"event","title":"...","start":"ISO 8601 with the local UTC offset","durationMin":60,"place":"address or venue if shown","details":"short extra details"}
- Reminder: {"kind":"reminder","title":"...","due":"ISO 8601 with offset, or omit","details":"..."}
- Note: {"kind":"note","title":"short title","text":"everything useful written on it, cleaned up"}
If it should go on the calendar but has no time, use 09:00 and say "time not shown" in details. If a year is missing, use the next date that is not in the past. If you cannot read it, return a note whose text says what you can see.`;

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function parsePhotoFiling(reply: string, target: PhotoTarget): PhotoFiling | null {
  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const title = s(j.title, 200) || 'From a photo';
  let kind = j.kind;
  if (target === 'note') kind = 'note';
  if (kind === 'event') {
    const start = s(j.start, 40);
    if (!start || isNaN(Date.parse(start))) return { kind: 'note', title, text: [s(j.details, 2000), s(j.place, 200)].filter(Boolean).join('\n') || title };
    const d = Number(j.durationMin);
    return { kind: 'event', title, start, durationMin: Number.isFinite(d) && d > 0 && d <= 1440 ? Math.round(d) : 60, ...(s(j.place, 200) ? { place: s(j.place, 200) } : {}), ...(s(j.details, 1000) ? { details: s(j.details, 1000) } : {}) };
  }
  if (kind === 'reminder') {
    const due = s(j.due, 40);
    return { kind: 'reminder', title, ...(due && !isNaN(Date.parse(due)) ? { due } : {}), ...(s(j.details, 1000) ? { details: s(j.details, 1000) } : {}) };
  }
  return { kind: 'note', title, text: s(j.text, 4000) || s(j.details, 4000) || title };
}
