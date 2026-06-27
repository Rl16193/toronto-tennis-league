/**
 * One-off migration: stamp booking URLs into the courts CSV as a new `BookingUrl`
 * column, replacing the hand-maintained src/pages/courtmap/courtBookings.ts table.
 *
 * It reuses the EXACT table + match logic that courtBookings.ts used, so the CSV
 * reproduces today's links precisely. After writing, it re-parses the file and
 * asserts every appended value equals the legacy getBookingUrl output (regression
 * check), and warns about any table entry that matched zero rows.
 *
 * Run once:  node scripts/add-booking-urls.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '../public/Tennis Courts Facilities - 4326.csv');

// ── Legacy data + matcher (copied verbatim from courtBookings.ts) ───────────────
const D = (id) =>
  `https://anc.ca.apm.activecommunities.com/toronto/reservation/search/detail/simple/${id}?popup_window=yes`;

const BOOKABLE_COURTS = {
  'bestview park': D(7724),
  'buttonwood park': D(7725),
  'champlain parkette': D(338),
  'cliffwood park': D(7726),
  'fenside park': D(7728),
  'jonathan ashbridge park': D(3816),
  'manchester park': D(7733),
  'maple leaf park': D(7729),
  'michael mostyn balmoral park': D(7723),
  'park lawn park': D(5428),
  'pelmo park': D(7730),
  'sweeney park': D(7731),
  'westmount park': D(7734),
};

const matchedKeys = new Set();
function getBookingUrl(dropdown, name) {
  const candidates = [dropdown.toLowerCase().trim(), name.toLowerCase().trim()];
  for (const c of candidates) if (BOOKABLE_COURTS[c]) { matchedKeys.add(c); return BOOKABLE_COURTS[c]; }
  for (const c of candidates)
    for (const key of Object.keys(BOOKABLE_COURTS))
      if (key.startsWith(c) || c.startsWith(key)) { matchedKeys.add(key); return BOOKABLE_COURTS[key]; }
  return undefined;
}

// ── CSV line parser (quote-aware; mirrors parseCsvLine) ─────────────────────────
function parseCsvLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

// ── Main ────────────────────────────────────────────────────────────────────────
const raw = readFileSync(CSV_PATH, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

const header = parseCsvLine(lines[0]);
if (header.includes('BookingUrl')) {
  console.error('BookingUrl column already present — nothing to do.');
  process.exit(0);
}
const iName = header.indexOf('Name');
const iDropdown = header.indexOf('Dropdown');
if (iName < 0 || iDropdown < 0) {
  console.error('Could not find Name/Dropdown columns in header.');
  process.exit(1);
}

lines[0] = lines[0] + ',BookingUrl';

let modified = 0;
const expected = []; // [{ rowIndex, url }] for the regression re-check
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const cells = parseCsvLine(line);
  const dropdown = (cells[iDropdown] || cells[iName] || '').trim();
  const name = (cells[iName] || dropdown).trim();
  if (!dropdown) continue;
  const url = getBookingUrl(dropdown, name);
  if (url) {
    lines[i] = line + ',' + url; // URLs contain no commas/quotes — safe to append raw
    expected.push({ rowIndex: i, url });
    modified++;
  }
}

writeFileSync(CSV_PATH, lines.join(eol), 'utf8');

// ── Regression check: re-parse and confirm equivalence with the legacy table ─────
const reparsed = readFileSync(CSV_PATH, 'utf8').split(/\r?\n/);
const newHeader = parseCsvLine(reparsed[0]);
const iBooking = newHeader.indexOf('BookingUrl');
let mismatches = 0;
for (const { rowIndex, url } of expected) {
  const got = parseCsvLine(reparsed[rowIndex])[iBooking];
  if (got !== url) { mismatches++; console.error(`  MISMATCH row ${rowIndex}: expected ${url} got ${got}`); }
}

const unmatched = Object.keys(BOOKABLE_COURTS).filter((k) => !matchedKeys.has(k));

console.error(`Wrote BookingUrl column: ${modified} rows stamped.`);
console.error(`Regression check: ${mismatches === 0 ? 'OK — all stamped values match legacy getBookingUrl' : `${mismatches} MISMATCHES`}`);
if (unmatched.length) console.error(`WARNING: ${unmatched.length} booking entries matched zero CSV rows: ${unmatched.join(', ')}`);
process.exit(mismatches === 0 ? 0 : 1);
