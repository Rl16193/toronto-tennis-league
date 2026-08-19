/**
 * One-time script: pre-geocode pickleball-only courts and print PICKLEBALL_ONLY_COORDS.
 * Run: node scripts/geocode-pickleball.js
 * Then paste the printed constant into CourtMap.tsx.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// ── Mirrors CourtMap.tsx constants ──────────────────────────────────────────

const COURT_ALIASES = { 'stanley park': 'stanley park south - toronto' };

const PICKLEBALL_DATA = [
  { location: '20 Castlefield Avenue Park' },
  { location: '50 Queens Quay East Park' },
  { location: 'Albion Gardens Park' },
  { location: 'Alexandra Park' },
  { location: 'Amesbury Park' },
  { location: 'Ancaster Park' },
  { location: 'Angela James Arena & Tennis Courts' },
  { location: 'Antibes Community Centre' },
  { location: 'Banbury Park' },
  { location: 'Baycrest Park' },
  { location: 'Bayview Village Park' },
  { location: 'Beaumonde Heights Park' },
  { location: 'Bennington Heights Park' },
  { location: 'Bestview Park' },
  { location: 'Birch Park' },
  { location: 'Birchmount Park' },
  { location: 'Buttonwood Park' },
  { location: 'Campbell Avenue Park' },
  { location: 'Cedarvale Park' },
  { location: 'Centennial Park - Etobicoke' },
  { location: 'Chalkfarm Park' },
  { location: 'Champlain Parkette' },
  { location: 'Christie Pits Park' },
  { location: 'Clairlea Park' },
  { location: 'Cliffwood Park' },
  { location: 'Cloverdale Park' },
  { location: 'Cummer Park' },
  { location: 'Dieppe Park' },
  { location: 'Dufferin Grove Park' },
  { location: 'Earlscourt Park' },
  { location: 'Eglinton Flats' },
  { location: 'Eglinton Park' },
  { location: 'Elie Wiesel Park' },
  { location: 'Fairmount Park' },
  { location: 'Fenside Park' },
  { location: 'Firgrove Park' },
  { location: 'Flagstaff Park' },
  { location: 'Gihon Spring Park' },
  { location: 'Glen Park' },
  { location: 'Glendora Park' },
  { location: 'Gracedale Park' },
  { location: 'Greenwood Park' },
  { location: 'High Park' },
  { location: 'Howard Talbot Park' },
  { location: 'Hullmar Park' },
  { location: 'Humber Valley Park' },
  { location: 'Indian Line Park' },
  { location: 'Irving W. Chapley Park' },
  { location: 'Jeff Healey Park' },
  { location: 'Jimmie Simpson Park' },
  { location: 'Jonathan Ashbridge Park' },
  { location: 'Kew Gardens' },
  { location: 'Kingsview Park' },
  { location: 'Kirkwood Park' },
  { location: 'Laburnham Park' },
  { location: 'Lakeshore Boulevard Parklands' },
  { location: 'Lambton - Kingsway Park' },
  { location: 'Lanyard Park' },
  { location: 'Lillian Park' },
  { location: 'Lora Hill Park' },
  { location: 'Main Sewage Treatment Playground' },
  { location: 'Malvern Park' },
  { location: 'Manchester Park' },
  { location: 'Maple Leaf Park' },
  { location: 'Martingrove Gardens Park' },
  { location: 'McCowan District Park' },
  { location: 'McDairmid Woods Park' },
  { location: 'McGregor Park' },
  { location: 'Michael Mostyn Balmoral Park' },
  { location: 'Mill Valley Park' },
  { location: 'Millwood Park' },
  { location: 'Monarch Park' },
  { location: 'Otter Creek Centre' },
  { location: 'Ourland Park' },
  { location: 'Park Lawn Park' },
  { location: 'Pelmo Park' },
  { location: 'Pine Point Park' },
  { location: 'Prairie Drive Park' },
  { location: 'Queensway Park' },
  { location: 'Ramsden Park' },
  { location: 'Regent Park Athletic Grounds' },
  { location: 'Riverdale Park East' },
  { location: 'Rotary Peace Park' },
  { location: 'Sentinel Park' },
  { location: 'Shawnee Park' },
  { location: 'Sir Adam Beck Park' },
  { location: 'Stanley Greene Park' },
  { location: 'Stanley Park South - Toronto' },
  { location: 'Stephenson Park' },
  { location: 'Strathburn Park' },
  { location: 'Sunnylea Park' },
  { location: 'Sweeney Park' },
  { location: 'Tom Riley Park' },
  { location: "Toronto Island Park - Ward's Island" },
  { location: 'Trinity Bellwoods Park' },
  { location: 'Valleyfield Park' },
  { location: 'Wanless Park' },
  { location: 'Wedgewood Park - Etobicoke' },
  { location: 'Wedgewood Park - North York' },
  { location: 'Wellesley Park' },
  { location: 'Westgrove Park' },
  { location: 'Westmount Park' },
  { location: 'Withrow Park and Clubhouse' },
];

// ── Simple CSV helpers (mirrors CourtMap.tsx logic) ─────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCourts(csvText) {
  const [headerLine, ...lines] = csvText.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const idx = (col) => headers.indexOf(col);
  const iName = idx('Name'),
    iDropdown = idx('Dropdown'),
    iGeom = idx('geometry');
  const courts = [];
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const geomRaw = cells[iGeom];
    if (!geomRaw) continue;
    try {
      const geom = JSON.parse(geomRaw);
      const [lng, lat] = geom.coordinates[0];
      const dropdown = cells[iDropdown]?.trim() || cells[iName]?.trim() || '';
      if (!dropdown || !lat || !lng) continue;
      courts.push({ name: cells[iName]?.trim() || dropdown, dropdown, lat, lng });
    } catch {
      /* skip */
    }
  }
  return courts;
}

function matchCourtName(preference, byDropdown, byName) {
  const raw = preference.toLowerCase().trim();
  const pref = COURT_ALIASES[raw] ?? raw;
  if (byDropdown.has(pref)) return byDropdown.get(pref);
  if (byName.has(pref)) return byName.get(pref);
  for (const [key, court] of byDropdown) {
    if (key.startsWith(pref) || pref.startsWith(key)) return court;
  }
  for (const [key, court] of byName) {
    if (key.startsWith(pref) || pref.startsWith(key)) return court;
  }
  return undefined;
}

// ── Geocoding ────────────────────────────────────────────────────────────────

async function geocodeQuery(location) {
  const viewbox = '-79.75,43.50,-79.05,43.90';
  const url =
    `https://nominatim.openstreetmap.org/search?format=json` +
    `&q=${encodeURIComponent(location + ', Toronto, Ontario')}` +
    `&limit=5&countrycodes=ca&viewbox=${viewbox}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'toronto-tennis-league-geocoder' } });
  const data = await res.json();
  const genericTypes = new Set([
    'city',
    'county',
    'state',
    'administrative',
    'country',
    'municipality',
    'region',
    'province',
    'suburb',
    'quarter',
  ]);
  for (const r of data) {
    if (genericTypes.has(r.type) || genericTypes.has(r.class)) continue;
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    // Must be within ~35km of Toronto centre
    const dLat = ((lat - 43.7) * Math.PI) / 180;
    const dLng = ((lng - -79.38) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((43.7 * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > 35) continue;
    return { lat, lng };
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const csvPath = path.join(scriptDir, '../public/Tennis Courts Facilities - 4326.csv');
const csvText = readFileSync(csvPath, 'utf8');
const courts = parseCourts(csvText);

const byDropdown = new Map();
const byName = new Map();
for (const c of courts) {
  byDropdown.set(c.dropdown.toLowerCase(), c);
  byName.set(c.name.toLowerCase(), c);
}

// Find unique locations that don't match the tennis courts CSV
const uniqueLocations = [...new Set(PICKLEBALL_DATA.map((e) => e.location))];
const pbOnlyLocations = uniqueLocations.filter((loc) => !matchCourtName(loc, byDropdown, byName));

console.error(`Found ${pbOnlyLocations.length} pickleball-only locations needing geocoding:`);
pbOnlyLocations.forEach((l) => console.error(' -', l));
console.error('');

const coords = {};
for (let i = 0; i < pbOnlyLocations.length; i++) {
  const location = pbOnlyLocations[i];
  if (i > 0) await new Promise((r) => setTimeout(r, 1200));
  try {
    const result = await geocodeQuery(location);
    if (result) {
      coords[location] = { lat: result.lat, lng: result.lng };
      console.error(
        `✓ [${i + 1}/${pbOnlyLocations.length}] ${location}: ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`,
      );
    } else {
      console.error(`✗ [${i + 1}/${pbOnlyLocations.length}] ${location}: no result`);
    }
  } catch (e) {
    console.error(`✗ [${i + 1}/${pbOnlyLocations.length}] ${location}: error - ${e.message}`);
  }
}

console.error('');
console.error('Done. Paste the output below into CourtMap.tsx:');
console.error('');

// Print the constant to stdout (so it can be piped or copied)
const lines = ['// Pre-geocoded coordinates for pickleball-only parks (not in tennis courts CSV).'];
lines.push('// Generated by scripts/geocode-pickleball.js — do not edit manually.');
lines.push('const PICKLEBALL_ONLY_COORDS: Record<string, { lat: number; lng: number }> = {');
for (const [loc, { lat, lng }] of Object.entries(coords)) {
  lines.push(`  ${JSON.stringify(loc)}: { lat: ${lat.toFixed(6)}, lng: ${lng.toFixed(6)} },`);
}
lines.push('};');
console.log(lines.join('\n'));
