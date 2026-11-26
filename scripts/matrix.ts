// Generates docs/FEATURE_MATRIX.md from src/features.ts so docs and app never disagree.
import { writeFileSync } from 'node:fs';
import { FEATURES, STATUS_LABEL, Status } from '../src/features';

const order: Status[] = ['tested', 'built', 'partial', 'blocked', 'unsupported', 'proposed'];
const lines = [
  '# SENTINEL AI — feature matrix',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} from \`src/features.ts\` (the same list the app shows).`,
  '',
  '| Status | Count |', '|---|---|',
  ...order.map((s) => `| ${STATUS_LABEL[s]} | ${FEATURES.filter((f) => f.status === s).length} |`),
  '',
  '**Tested (PC)** = verified by automated tests on the PC, using real glasses data where possible. **Built** = compiles and bundles; not yet run on the iPhone. Nothing is listed as working on the phone until it has been tried there.',
  '',
];
for (const s of order) {
  const fs = FEATURES.filter((f) => f.status === s);
  if (!fs.length) continue;
  lines.push(`## ${STATUS_LABEL[s]}`, '', '| Area | Feature | Detail | Needs |', '|---|---|---|---|');
  for (const f of fs) lines.push(`| ${f.area} | ${f.name} | ${f.detail.replace(/\|/g, '/')} | ${f.needs ?? ''} |`);
  lines.push('');
}
writeFileSync(__dirname + '/../docs/FEATURE_MATRIX.md', lines.join('\n'));
console.log('wrote docs/FEATURE_MATRIX.md with', FEATURES.length, 'features');
