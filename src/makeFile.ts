/**
 * "Make me a federal resume in Word", "put my budget in Excel", "make a PowerPoint about…", "make this a PDF".
 * Alice writes the content with web search on, FOLLOWING ANY DEFINED STANDARD (she looks up the current
 * official rules first: USAJOBS/OPM federal resumes, APA/MLA/Chicago, military memos, business letters…),
 * then builds a real .docx / .xlsx / .pptx / .pdf on the phone and saves it in Files > Alice > Alice Documents.
 * If you just gave her a file (Talk screen "Read a file", or a scan), she works from it.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { respond } from './ai';
import { memory } from './memory';
import { getSettings } from './settings';
import { lastAttachment } from './attachments';
import { documentHtml, fileNameFor } from './docCore';
import { markdownToDocx, sheetsToXlsx, slidesToPptx, Sheet, Slide } from './officeCore';
import { parseDocReply, parseSheetsReply, parseSlidesReply } from './makeFileCore';
import { note } from './diary';

export type FileKind = 'word' | 'pdf' | 'excel' | 'powerpoint';

const STANDARDS = `Before writing, decide whether a defined standard or official format applies (examples: a federal resume for USAJOBS / OPM rules, a state or agency application, a military memo or naval letter (SECNAV M-5216.5, AR 25-50), APA / MLA / Chicago papers, a legal pleading, a business letter, an invoice, meeting minutes). If one applies, SEARCH for the CURRENT official requirements and follow every one of them exactly (required fields, order, length or page limits, fonts, margins, dates format). Never invent facts about the user: where information is missing, put a clear placeholder in [square brackets] for them to fill in. Write the real, complete, finished content, not an outline or advice about it.`;

const PROMPTS: Record<FileKind, string> = {
  word: `Write the complete document in Markdown (# title, ## sections, ### sub-sections, - bullets, 1. numbered, | tables |, **bold**). Reply with these lines first, then the Markdown:\nSTANDARD: <the standard you followed, or "none">\nFONT: <font name>, <size in pt>, <margins in inches>   (use what the standard requires; otherwise Calibri, 11, 1)\n---`,
  pdf: `Write the complete document in Markdown (# title, ## sections, - bullets, | tables |, **bold**). Reply with these lines first, then the Markdown:\nSTANDARD: <the standard you followed, or "none">\nFONT: <font name>, <size in pt>, <margins in inches>\n---`,
  excel: `Build the spreadsheet. Reply with ONLY JSON: {"standard":"<standard followed or none>","sheets":[{"name":"Sheet name","rows":[["Header 1","Header 2"],["text",123],["Total","=SUM(B2:B9)"]]}]}. First row of each sheet is the header. Use real numbers (not strings) for amounts, and Excel formulas starting with = for totals and calculations.`,
  powerpoint: `Build the slide deck. Reply with ONLY JSON: {"standard":"<standard followed or none>","title":"Deck title","slides":[{"title":"Slide title","bullets":["short point","short point"],"notes":"what to say"}]}. 6 to 12 slides unless asked otherwise, 3 to 6 short bullets each.`,
};

const EXT: Record<FileKind, string> = { word: 'docx', pdf: 'pdf', excel: 'xlsx', powerpoint: 'pptx' };
const MIME: Record<FileKind, string> = {
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  powerpoint: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
};
const UTI: Record<FileKind, string> = { word: 'org.openxmlformats.wordprocessingml.document', excel: 'org.openxmlformats.spreadsheetml.sheet', powerpoint: 'org.openxmlformats.presentationml.presentation', pdf: 'com.adobe.pdf' };

export async function makeFile(kind: FileKind, request: string, title?: string): Promise<string> {
  const att = lastAttachment();
  const me = getSettings().memoryEnabled ? memory.prompt() : '';
  const system = [`You are Alice making a ${kind === 'word' ? 'Word document' : kind === 'pdf' ? 'PDF document' : kind === 'excel' ? 'Excel spreadsheet' : 'PowerPoint deck'} for the user.`, STANDARDS, PROMPTS[kind], `Today is ${new Date().toDateString()}.`, me ? `What you know about the user (use it to fill in their details):\n${me}` : ''].filter(Boolean).join('\n\n');
  const ask = `${request}${title ? `\nTitle: ${title}` : ''}${att ? `\nUse the attached file "${att.name}" as the source.` : ''}`;
  note('make-file', { kind, attached: !!att });
  const r = await respond('general', system, [], ask, undefined, att);

  const dir = new Directory(Paths.document, 'Alice Documents');
  if (!dir.exists) dir.create();
  let finalTitle = title || 'Document', standard = '';
  let bytes: Uint8Array | null = null;
  let pdfHtml = '';

  if (kind === 'word' || kind === 'pdf') {
    const d = parseDocReply(r.text);
    standard = d.standard; finalTitle = title || d.title || finalTitle;
    if (kind === 'word') bytes = markdownToDocx(d.markdown, { font: d.font, size: d.size, marginsIn: d.margins });
    else pdfHtml = documentHtml(finalTitle, d.markdown, new Date(), { font: d.font, size: d.size, marginsIn: d.margins, plain: !!d.standard && !/^none/i.test(d.standard) });
  } else if (kind === 'excel') {
    const d = parseSheetsReply(r.text);
    if (!d) return "I couldn't build that spreadsheet. Try asking again with a bit more detail.";
    standard = d.standard; finalTitle = title || d.sheets[0]?.name || 'Spreadsheet';
    bytes = sheetsToXlsx(d.sheets as Sheet[]);
  } else {
    const d = parseSlidesReply(r.text);
    if (!d) return "I couldn't build that deck. Try asking again with a bit more detail.";
    standard = d.standard; finalTitle = title || d.title || 'Presentation';
    bytes = slidesToPptx(finalTitle, d.slides as Slide[]);
  }

  let name = fileNameFor(finalTitle, EXT[kind]);
  if (new File(dir, name).exists) name = name.replace(/(\.\w+)$/, ` ${new Date().toISOString().slice(0, 16).replace(':', '.')}$1`);
  const dest = new File(dir, name);
  if (bytes) { dest.create(); await dest.write(bytes); }
  else { const { uri } = await Print.printToFileAsync({ html: pdfHtml }); new File(uri).move(dest); }
  if (await Sharing.isAvailableAsync()) Sharing.shareAsync(dest.uri, { mimeType: MIME[kind], UTI: UTI[kind], dialogTitle: finalTitle }).catch(() => {});
  const label = kind === 'word' ? 'Word document' : kind === 'excel' ? 'Excel spreadsheet' : kind === 'powerpoint' ? 'PowerPoint' : 'PDF';
  const std = standard && !/^none/i.test(standard) ? ` I followed ${standard.replace(/\.$/, '')}.` : '';
  const holes = /\[[^\]]{2,40}\]/.test(r.text) ? ' Fill in the parts in square brackets.' : '';
  return `Your ${label}, "${finalTitle}", is ready.${std}${holes} It's in Files, On My iPhone, Alice, Alice Documents, and the share sheet is open so you can send or save it.`;
}
