/**
 * "Alice, scan this document." Take a photo of each page with the iPhone camera; Alice reads the text,
 * names it, and saves a PDF plus a text copy in Files > On My iPhone > Alice > Alice Documents. A note with
 * a short summary goes on the Memory tab so you can ask about it later. (No automatic edge-cropping yet:
 * fill the frame with the page, flat and in good light.)
 */
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { Alert, AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { respond } from './ai';
import { memory } from './memory';
import { fileNameFor } from './docCore';
import { note } from './diary';

const OCR = 'Transcribe ALL the text on this document page exactly as written, in reading order. Keep line breaks and lists. No commentary. If there is no text, reply [no text].';
const ask = (title: string, msg: string) => new Promise<boolean>((resolve) =>
  Alert.alert(title, msg, [{ text: 'Done', style: 'cancel', onPress: () => resolve(false) }, { text: 'Add page', onPress: () => resolve(true) }], { cancelable: false }));

export async function scanDocument(): Promise<string> {
  if (AppState.currentState !== 'active') return 'Open Alice on your phone so I can show the camera, then ask again.';
  const p = await ImagePicker.requestCameraPermissionsAsync();
  if (!p.granted) return 'I need camera permission to scan.';
  const pages: { uri: string; b64: string }[] = [];
  while (pages.length < 20) {
    const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, mediaTypes: ['images'] });
    if (r.canceled || !r.assets?.[0]?.base64) break;
    pages.push({ uri: r.assets[0].uri, b64: r.assets[0].base64 });
    if (!(await ask(`Page ${pages.length} scanned`, 'Add another page?'))) break;
  }
  if (!pages.length) return 'Scan cancelled.';

  // Read every page (3 at a time).
  const texts: string[] = new Array(pages.length).fill('');
  for (let i = 0; i < pages.length; i += 3) {
    await Promise.all(pages.slice(i, i + 3).map((pg, k) => respond('general', OCR, [], `Page ${i + k + 1}`, pg.b64)
      .then((r) => { texts[i + k] = r.text.replace(/^\[no text\]$/i, '').trim(); }).catch(() => {})));
  }
  const all = texts.map((t, i) => (pages.length > 1 ? `--- Page ${i + 1} ---\n` : '') + t).join('\n\n').trim();
  let title = 'Scanned document', summary = '';
  try {
    const r = await respond('general', 'Give this scanned document a short title (max 8 words), then on the next line a 1-2 sentence summary with any dates, amounts or deadlines. Plain text, two lines.', [], all.slice(0, 30000) || 'No readable text.');
    const [t, ...rest] = r.text.trim().split('\n');
    title = t.replace(/^title:\s*/i, '').replace(/["*]/g, '').trim().slice(0, 80) || title;
    summary = rest.join(' ').replace(/^summary:\s*/i, '').trim();
  } catch {}

  const dir = new Directory(Paths.document, 'Alice Documents');
  if (!dir.exists) dir.create();
  const stamp = new Date().toISOString().slice(0, 16).replace(':', '.');
  const base = fileNameFor(`${title} ${stamp}`, 'pdf').replace(/\.pdf$/, '');
  const html = `<html><head><meta charset="utf-8"><style>@page{margin:0}body{margin:0}img{width:100%;height:100vh;object-fit:contain;display:block;page-break-after:always}</style></head><body>${pages.map((pg) => `<img src="data:image/jpeg;base64,${pg.b64}"/>`).join('')}</body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  const pdf = new File(dir, `${base}.pdf`);
  new File(uri).move(pdf);
  if (all) { const txt = new File(dir, `${base}.txt`); txt.create(); await txt.write(`${title}\n\n${all}`); }
  let thumb: string | undefined;
  try { const pd = new Directory(Paths.document, 'Alice Photos'); if (!pd.exists) pd.create(); const t = new File(pd, `${Date.now()}.jpg`); new File(pages[0].uri).copy(t); thumb = t.uri; } catch {}
  await memory.note(`Scanned "${title}" (${pages.length} page${pages.length > 1 ? 's' : ''}): ${summary || all.slice(0, 300)}`, thumb);
  note('scan', { pages: pages.length, chars: all.length });
  return `Scanned ${pages.length} page${pages.length > 1 ? 's' : ''}: ${title}. ${summary} It's saved as a PDF in Files, On My iPhone, Alice, Alice Documents.`.replace(/\s+/g, ' ').trim();
}
