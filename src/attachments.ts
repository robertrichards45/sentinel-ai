/** The last file the user gave Alice (picked on the Talk screen, or a scanned document), for "make this into…". */
import type { Attachment } from './ai';
let last: { file: Attachment; at: number } | null = null;
export const setLastAttachment = (file: Attachment | null) => { last = file ? { file, at: Date.now() } : null; };
/** Only files from the last 2 hours count as "this". */
export const lastAttachment = () => (last && Date.now() - last.at < 2 * 3600_000 ? last.file : undefined);
