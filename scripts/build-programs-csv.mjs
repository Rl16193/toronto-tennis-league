// Build step: slim `data/Registered Programs.csv` (the City's full ~9 MB export) down to the
// tennis rows the app actually fetches, as public/programs-tennis.csv.
//
// Rows are copied VERBATIM and the header is untouched, so the runtime parser needs no changes and
// can't disagree with this script about CSV quoting. Keep the source CSV checked in.
//
// Wired into `npm run build`. Run standalone with: node scripts/build-programs-csv.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Source lives in data/, NOT public/ — everything in public/ is copied verbatim into dist/, and
// shipping the 9 MB original alongside the 0.15 MB slice would defeat the point.
const SRC = path.join(root, 'data', 'Registered Programs.csv');
const OUT = path.join(root, 'public', 'programs-tennis.csv');

// Minimal CSV field splitter — same rules as the app's parseCsvLine (double-quote escaping).
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

if (!existsSync(SRC)) {
  console.error(`[build-programs-csv] Source not found: ${SRC}`);
  process.exit(1);
}

const raw = readFileSync(SRC, 'utf8');
const lines = raw.split(/\r?\n/);
const headerLine = lines[0];
const sectionIdx = parseCsvLine(headerLine).indexOf('Section');

if (sectionIdx < 0) {
  console.error('[build-programs-csv] No "Section" column in the header — aborting rather than shipping a wrong file.');
  process.exit(1);
}

const kept = [headerLine];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const section = parseCsvLine(line)[sectionIdx] ?? '';
  if (section.toLowerCase().includes('tennis')) kept.push(line);
}

const output = kept.join('\n');
writeFileSync(OUT, output, 'utf8');

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
console.log(
  `[build-programs-csv] ${lines.length - 1} rows → ${kept.length - 1} tennis rows  (${mb(raw.length)} → ${mb(output.length)})`,
);
