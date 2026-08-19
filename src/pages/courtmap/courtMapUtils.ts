import { parseCsvLine } from '../../features/signup/utils/courtSearch';
export { parseCourts } from '../../features/courts/csv';
import type { CsvCourt } from '../../features/courts/types';
import { haversineKm } from '../../utils/zones';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type { CsvCourt } from '../../features/courts/types';

export type PickleballNetType = 'Tennis' | 'Pickleball' | 'No Net' | 'Adjustable';

export type PickleballEntry = {
  netType: PickleballNetType;
  lights: boolean;
  numCourts: number;
};

export type PickleballOnlyCourt = {
  location: string;
  entries: PickleballEntry[];
  lat?: number;
  lng?: number;
};

export type CourtWithCount = CsvCourt & {
  count: number;
  hasPrograms: boolean;
  pickleballEntries: PickleballEntry[];
};

export type TennisProgram = {
  courseId: string;
  locationId: string;
  locationName: string;
  address: string;
  title: string;
  days: string;
  dateRange: string;
  timeRange: string;
  ageRange: string;
  minAgeYr: number | null;
  maxAgeYr: number | null;
  status: string;
  activityUrl: string;
  lat?: number;
  lng?: number;
  matchedDropdown?: string;  // dropdown of the court this program maps to (for filtering)
};

export type NearestCourt = CourtWithCount & { distKm: number };
export type NearestProgram = TennisProgram & { distKm: number | null };

export type SuggestionItem =
  | { kind: 'court'; label: string; court: CourtWithCount }
  | { kind: 'address'; label: string; lat: number; lng: number };

// ─── Constants ────────────────────────────────────────────────────────────────

export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
export const TORONTO_CENTER: [number, number] = [43.718, -79.38];

const COURT_ALIASES: Record<string, string> = {
  'stanley park': 'stanley park south - toronto',
};

const PICKLEBALL_DATA: Array<{ location: string; netType: PickleballNetType; lights: boolean; numCourts: number }> = [
  { location: '20 Castlefield Avenue Park',         netType: 'Pickleball', lights: true,  numCourts: 2  },
  { location: '50 Queens Quay East Park',           netType: 'No Net',     lights: false, numCourts: 2  },
  { location: 'Albion Gardens Park',                netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Alexandra Park',                     netType: 'Pickleball', lights: false, numCourts: 1  },
  { location: 'Amesbury Park',                      netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Ancaster Park',                      netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Angela James Arena & Tennis Courts', netType: 'Tennis',     lights: true,  numCourts: 4  },
  { location: 'Antibes Community Centre',           netType: 'No Net',     lights: false, numCourts: 1  },
  { location: 'Banbury Park',                       netType: 'Pickleball', lights: false, numCourts: 1  },
  { location: 'Baycrest Park',                      netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Bayview Village Park',               netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Beaumonde Heights Park',             netType: 'Tennis',     lights: false, numCourts: 2  },
  { location: 'Bennington Heights Park',            netType: 'No Net',     lights: true,  numCourts: 1  },
  { location: 'Bestview Park',                      netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Birch Park',                         netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Birchmount Park',                    netType: 'Pickleball', lights: true,  numCourts: 6  },
  { location: 'Buttonwood Park',                    netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Campbell Avenue Park',               netType: 'No Net',     lights: true,  numCourts: 5  },
  { location: 'Cedarvale Park',                     netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Centennial Park - Etobicoke',        netType: 'Pickleball', lights: true,  numCourts: 12 },
  { location: 'Chalkfarm Park',                     netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Champlain Parkette',                 netType: 'Tennis',     lights: false, numCourts: 2  },
  { location: 'Christie Pits Park',                 netType: 'No Net',     lights: true,  numCourts: 5  },
  { location: 'Clairlea Park',                      netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Cliffwood Park',                     netType: 'Tennis',     lights: false, numCourts: 3  },
  { location: 'Cloverdale Park',                    netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Cummer Park',                        netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Dieppe Park',                        netType: 'No Net',     lights: true,  numCourts: 8  },
  { location: 'Dufferin Grove Park',                netType: 'No Net',     lights: true,  numCourts: 4  },
  { location: 'Earlscourt Park',                    netType: 'No Net',     lights: true,  numCourts: 5  },
  { location: 'Eglinton Flats',                     netType: 'Tennis',     lights: true,  numCourts: 6  },
  { location: 'Eglinton Flats',                     netType: 'No Net',     lights: true,  numCourts: 1  },
  { location: 'Eglinton Park',                      netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Elie Wiesel Park',                   netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Fairmount Park',                     netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Fenside Park',                       netType: 'Tennis',     lights: true,  numCourts: 4  },
  { location: 'Firgrove Park',                      netType: 'Tennis',     lights: false, numCourts: 2  },
  { location: 'Flagstaff Park',                     netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Gihon Spring Park',                  netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Glen Park',                          netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Glendora Park',                      netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Gracedale Park',                     netType: 'No Net',     lights: false, numCourts: 1  },
  { location: 'Greenwood Park',                     netType: 'No Net',     lights: true,  numCourts: 4  },
  { location: 'High Park',                          netType: 'Tennis',     lights: false, numCourts: 2  },
  { location: 'High Park',                          netType: 'No Net',     lights: true,  numCourts: 9  },
  { location: 'Howard Talbot Park',                 netType: 'Tennis',     lights: false, numCourts: 2  },
  { location: 'Hullmar Park',                       netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Humber Valley Park',                 netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Indian Line Park',                   netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Irving W. Chapley Park',             netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Jeff Healey Park',                   netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Jimmie Simpson Park',                netType: 'No Net',     lights: true,  numCourts: 4  },
  { location: 'Jonathan Ashbridge Park',            netType: 'Tennis',     lights: false, numCourts: 2  },
  { location: 'Kew Gardens',                        netType: 'No Net',     lights: true,  numCourts: 5  },
  { location: 'Kingsview Park',                     netType: 'Pickleball', lights: true,  numCourts: 2  },
  { location: 'Kirkwood Park',                      netType: 'Tennis',     lights: true,  numCourts: 4  },
  { location: 'Laburnham Park',                     netType: 'Pickleball', lights: true,  numCourts: 2  },
  { location: 'Lakeshore Boulevard Parklands',      netType: 'Tennis',     lights: false, numCourts: 4  },
  { location: 'Lambton - Kingsway Park',            netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Lanyard Park',                       netType: 'No Net',     lights: false, numCourts: 2  },
  { location: 'Lillian Park',                       netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Lora Hill Park',                     netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Main Sewage Treatment Playground',   netType: 'Pickleball', lights: false, numCourts: 11 },
  { location: 'Malvern Park',                       netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Manchester Park',                    netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Maple Leaf Park',                    netType: 'No Net',     lights: true,  numCourts: 2  },
  { location: 'Maple Leaf Park',                    netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Martingrove Gardens Park',           netType: 'Pickleball', lights: true,  numCourts: 2  },
  { location: 'McCowan District Park',              netType: 'No Net',     lights: true,  numCourts: 4  },
  { location: 'McDairmid Woods Park',               netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'McDairmid Woods Park',               netType: 'Adjustable', lights: true,  numCourts: 2  },
  { location: 'McGregor Park',                      netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'McGregor Park',                      netType: 'Pickleball', lights: true,  numCourts: 2  },
  { location: 'Michael Mostyn Balmoral Park',       netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Mill Valley Park',                   netType: 'Tennis',     lights: false, numCourts: 2  },
  { location: 'Millwood Park',                      netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Monarch Park',                       netType: 'No Net',     lights: true,  numCourts: 4  },
  { location: 'Otter Creek Centre',                 netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Ourland Park',                       netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Park Lawn Park',                     netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Pelmo Park',                         netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Pine Point Park',                    netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Prairie Drive Park',                 netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Queensway Park',                     netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Ramsden Park',                       netType: 'No Net',     lights: true,  numCourts: 7  },
  { location: 'Ramsden Park',                       netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Regent Park Athletic Grounds',       netType: 'No Net',     lights: true,  numCourts: 5  },
  { location: 'Riverdale Park East',                netType: 'No Net',     lights: true,  numCourts: 4  },
  { location: 'Riverdale Park East',                netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Rotary Peace Park',                  netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Sentinel Park',                      netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Shawnee Park',                       netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Sir Adam Beck Park',                 netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Stanley Greene Park',                netType: 'Tennis',     lights: true,  numCourts: 1  },
  { location: 'Stanley Park South - Toronto',       netType: 'Tennis',     lights: false, numCourts: 2  },
  { location: 'Stephenson Park',                    netType: 'No Net',     lights: false, numCourts: 1  },
  { location: 'Strathburn Park',                    netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: 'Strathburn Park',                    netType: 'No Net',     lights: false, numCourts: 3  },
  { location: 'Sunnylea Park',                      netType: 'Tennis',     lights: false, numCourts: 2  },
  { location: 'Sweeney Park',                       netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Tom Riley Park',                     netType: 'Tennis',     lights: true,  numCourts: 2  },
  { location: "Toronto Island Park - Ward's Island",netType: 'Pickleball', lights: false, numCourts: 2  },
  { location: 'Trinity Bellwoods Park',             netType: 'No Net',     lights: true,  numCourts: 4  },
  { location: 'Valleyfield Park',                   netType: 'No Net',     lights: true,  numCourts: 5  },
  { location: 'Wanless Park',                       netType: 'No Net',     lights: true,  numCourts: 1  },
  { location: 'Wedgewood Park - Etobicoke',         netType: 'No Net',     lights: true,  numCourts: 1  },
  { location: 'Wedgewood Park - North York',        netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Wellesley Park',                     netType: 'Pickleball', lights: false, numCourts: 1  },
  { location: 'Westgrove Park',                     netType: 'No Net',     lights: true,  numCourts: 1  },
  { location: 'Westmount Park',                     netType: 'Tennis',     lights: true,  numCourts: 3  },
  { location: 'Withrow Park and Clubhouse',         netType: 'Tennis',     lights: false, numCourts: 1  },
  { location: 'Withrow Park and Clubhouse',         netType: 'No Net',     lights: true,  numCourts: 2  },
];

// Pre-geocoded coordinates for pickleball-only parks (not in tennis courts CSV).
// Generated by scripts/geocode-pickleball.js — re-run if PICKLEBALL_DATA locations change.
const PICKLEBALL_ONLY_COORDS: Record<string, { lat: number; lng: number }> = {
  '20 Castlefield Avenue Park':        { lat: 43.708825, lng: -79.413713 },
  '50 Queens Quay East Park':          { lat: 43.642900, lng: -79.372800 },
  'Alexandra Park':                    { lat: 43.650380, lng: -79.401620 },
  'Campbell Avenue Park':              { lat: 43.663764, lng: -79.448410 },
  'Centennial Park - Etobicoke':       { lat: 43.653590, lng: -79.588869 },
  'Christie Pits Park':                { lat: 43.664746, lng: -79.420776 },
  'Dieppe Park':                       { lat: 43.691657, lng: -79.335582 },
  'Dufferin Grove Park':               { lat: 43.656206, lng: -79.432451 },
  'Greenwood Park':                    { lat: 43.668404, lng: -79.328439 },
  'Main Sewage Treatment Playground':  { lat: 43.663237, lng: -79.316919 },
  'McCowan District Park':             { lat: 43.733571, lng: -79.238277 },
  'Monarch Park':                      { lat: 43.677793, lng: -79.325523 },
  'Otter Creek Centre':                { lat: 43.718027, lng: -79.414760 },
  'Regent Park Athletic Grounds':      { lat: 43.659296, lng: -79.359032 },
  'Stephenson Park':                   { lat: 43.686020, lng: -79.303655 },
  "Toronto Island Park - Ward's Island": { lat: 43.631315, lng: -79.357145 },
  'Wellesley Park':                    { lat: 43.669596, lng: -79.362199 },
};

export const MONTH_ABBR: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export const PROGRAM_LOCATION_ADDRESSES: Record<string, string> = {
  '9': '101 Emmett Ave, Toronto',
  '27': '81 Ranleigh Ave, Toronto',
  '33': '454 Avenue Rd, Toronto',
  '96': '181 Cleveland St, Toronto',
  '127': '1725 Gerrard St E, Toronto',
  '155': '870 Queen St E, Toronto',
  '220': '19 Coleman Ave, Toronto',
  '241': '790 Queen St W, Toronto',
  '276': '181 Westview Blvd, Toronto',
  '329': '1081 Pape Ave, Toronto',
  '348': '289 Sorauren Ave, Toronto',
  '405': '4325 Mccowan Rd, Toronto',
  '472': '1507 Lawrence Ave W, Toronto',
  '484': '151 Culford Rd, Toronto',
  '487': '41 Ancaster Rd, Toronto',
  '510': '569 Jane St, Toronto',
  '514': '1200 Lansdowne Ave, Toronto',
  '582': '165 Grenoble Dr, Toronto',
  '638': '35 Glen Long Ave, Toronto',
  '643': '45 Goulding Ave, Toronto',
  '648': '23 Grandravine Dr, Toronto',
  '665': '205 Wilmington Ave, Toronto',
  '699': '300 Silver Springs Blvd, Toronto',
  '712': '2467 Eglinton Ave E, Toronto',
  '750': '10 Rampart Rd, Toronto',
  '755': '850 Humberwood Blvd, Toronto',
  '793': '18 Ourland Ave, Toronto',
  '797': '105 Norseman St, Toronto',
  '892': '590 Rathburn Rd, Toronto',
  '959': '46 Kingsview Blvd, Toronto',
  '1056': '29 St Dennis Dr, Toronto',
  '1078': '28 Colonel Samuel Smith Park Dr, Toronto',
  '1105': '2500 Birchmount Rd, Toronto',
  '1132': '10 Toledo Rd, Toronto',
  '1234': '90 Thirty First St, Toronto',
  '1236': '95 Mimico Ave, Toronto',
  '1237': '130 Lloyd Manor Rd, Toronto',
  '1288': '71 Ballacaine Dr, Toronto',
  '2831': '50 Davisville Ave, Toronto',
};

export const locationGeoCache = new Map<string, { lat: number; lng: number } | null>();

export const GENERIC_OSM_TYPES = new Set([
  'city', 'county', 'state', 'administrative', 'country',
  'municipality', 'region', 'province', 'suburb', 'quarter',
]);

// ─── Pickleball mappings (module-level cache) ─────────────────────────────────

let _pbByDropdown: Map<string, PickleballEntry[]> | null = null;
let _pbOnly: PickleballOnlyCourt[] | null = null;

export function getPickleballMappings(
  byDropdown: Map<string, CsvCourt>,
  byName: Map<string, CsvCourt>,
): { pbByDropdown: Map<string, PickleballEntry[]>; pbOnly: PickleballOnlyCourt[] } {
  if (_pbByDropdown && _pbOnly) return { pbByDropdown: _pbByDropdown, pbOnly: _pbOnly };

  const pbByDropdown = new Map<string, PickleballEntry[]>();
  const unmatchedByLocation = new Map<string, PickleballEntry[]>();

  for (const { location, ...entry } of PICKLEBALL_DATA) {
    const matched = matchCourtName(location, byDropdown, byName);
    if (matched) {
      const arr = pbByDropdown.get(matched.dropdown) ?? [];
      arr.push(entry);
      pbByDropdown.set(matched.dropdown, arr);
    } else {
      const arr = unmatchedByLocation.get(location) ?? [];
      arr.push(entry);
      unmatchedByLocation.set(location, arr);
    }
  }

  const pbOnly: PickleballOnlyCourt[] = [...unmatchedByLocation.entries()]
    .map(([loc, entries]) => ({
      location: loc,
      entries,
      ...PICKLEBALL_ONLY_COORDS[loc],
    }));

  _pbByDropdown = pbByDropdown;
  _pbOnly = pbOnly;
  return { pbByDropdown, pbOnly };
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function parseDateStr(s: string): Date | null {
  const parts = s.trim().split('-');
  if (parts.length !== 3) return null;
  const m = MONTH_ABBR[parts[0]];
  if (m === undefined) return null;
  const yr = parseInt(parts[2]);
  const day = parseInt(parts[1]);
  if (isNaN(yr) || isNaN(day)) return null;
  return new Date(yr, m, day);
}

export function formatDateRange(dateRange: string): string {
  const parts = dateRange.split(' to ');
  const fmt = (s: string) => {
    const p = s.trim().split('-');
    if (p.length < 2) return s.trim();
    return `${p[0]} ${parseInt(p[1])}`;
  };
  if (parts.length === 2) return `${fmt(parts[0])} – ${fmt(parts[1])}`;
  return dateRange;
}

export function getProgramStatus(dateRange: string, today: Date): 'ongoing' | 'upcoming' | 'past' | null {
  const parts = dateRange.split(' to ');
  const start = parseDateStr(parts[0]?.trim() || '');
  const end = parts[1] ? parseDateStr(parts[1].trim()) : null;
  if (!start) return null;
  if (end && end < today) return 'past';
  if (start > today) return 'upcoming';
  return 'ongoing';
}

export function toYears(months: string | undefined): number | null {
  if (!months || months === 'None') return null;
  const m = parseInt(months);
  return isNaN(m) ? null : Math.floor(m / 12);
}

export function matchCourtName(
  preference: string,
  byDropdown: Map<string, CsvCourt>,
  byName: Map<string, CsvCourt>,
): CsvCourt | undefined {
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

// ─── CSV parsers ──────────────────────────────────────────────────────────────

export function parsePrograms(
  programCsv: string,
  byDropdown: Map<string, CsvCourt>,
  byName: Map<string, CsvCourt>,
): TennisProgram[] {
  const [headerLine, ...lines] = programCsv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const pIdx = (col: string) => headers.indexOf(col);

  const iCourseId = pIdx('Course_ID'), iLocId = pIdx('Location ID');
  const iLocName = pIdx('Location Name'), iSection = pIdx('Section');
  const iCourseTitle = pIdx('Course Title'), iDays = pIdx('Days of The Week');
  const iFromTo = pIdx('From To'), iStartHr = pIdx('Start Hour');
  const iStartMin = pIdx('Start Min'), iEndHr = pIdx('End Hour');
  const iEndMin = pIdx('End Min'), iMinAge = pIdx('Min Age');
  const iMaxAge = pIdx('Max Age'), iStatus = pIdx('Status / Information');
  const iActivityUrl = pIdx('Activity URL');

  const programs: TennisProgram[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const cells = parseCsvLine(line);
    if (!cells[iSection]?.toLowerCase().includes('tennis')) continue;
    const courseId = cells[iCourseId]?.trim() || '';
    if (!courseId || seen.has(courseId)) continue;
    seen.add(courseId);

    const locationId = cells[iLocId]?.trim() || '';
    const locationName = cells[iLocName]?.trim() || '';
    const address = PROGRAM_LOCATION_ADDRESSES[locationId] || '';

    const pad = (s: string) => s.padStart(2, '0');
    const timeRange = `${pad(cells[iStartHr]?.trim() || '0')}:${pad(cells[iStartMin]?.trim() || '0')}–${pad(cells[iEndHr]?.trim() || '0')}:${pad(cells[iEndMin]?.trim() || '0')}`;

    const minAgeYr = toYears(cells[iMinAge]?.trim());
    const maxAgeYr = toYears(cells[iMaxAge]?.trim());
    const ageRange = minAgeYr !== null && maxAgeYr !== null
      ? `${minAgeYr}–${maxAgeYr} yr`
      : minAgeYr !== null ? `${minAgeYr}+ yr` : 'All ages';

    const courtMatch = locationName ? matchCourtName(locationName, byDropdown, byName) : undefined;
    if (courtMatch && !locationGeoCache.has(locationId)) {
      locationGeoCache.set(locationId, { lat: courtMatch.lat, lng: courtMatch.lng });
    }
    const cached = locationGeoCache.get(locationId);

    programs.push({
      courseId, locationId,
      locationName: locationName || address,
      address,
      title: cells[iCourseTitle]?.trim() || '',
      days: cells[iDays]?.trim() || '',
      dateRange: cells[iFromTo]?.trim() || '',
      timeRange, ageRange,
      minAgeYr, maxAgeYr,
      status: cells[iStatus]?.trim() || '',
      activityUrl: iActivityUrl >= 0 ? (cells[iActivityUrl]?.trim() || '') : '',
      lat: cached?.lat,
      lng: cached?.lng,
      matchedDropdown: courtMatch?.dropdown,
    });
  }
  return programs;
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

export async function geocodeQuery(query: string): Promise<{ lat: number; lng: number } | null> {
  const viewbox = '-79.75,43.50,-79.05,43.90';
  const url =
    `https://nominatim.openstreetmap.org/search?format=json` +
    `&q=${encodeURIComponent(query + ', Toronto, Ontario')}` +
    `&limit=3&countrycodes=ca&viewbox=${viewbox}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'toronto-tennis-league' } });
  const data = (await res.json()) as { lat: string; lon: string; type: string; class: string }[];
  for (const r of data) {
    if (GENERIC_OSM_TYPES.has(r.type) || GENERIC_OSM_TYPES.has(r.class)) continue;
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (haversineKm(43.70, -79.38, lat, lng) > 35) continue;
    return { lat, lng };
  }
  return null;
}

export async function geocodeLocationId(locationId: string, locationName: string): Promise<{ lat: number; lng: number } | null> {
  if (locationGeoCache.has(locationId)) return locationGeoCache.get(locationId) ?? null;
  const address = PROGRAM_LOCATION_ADDRESSES[locationId] || '';
  const query = locationName ? `${locationName} Toronto` : address;
  if (!query) { locationGeoCache.set(locationId, null); return null; }
  try {
    const coords = await geocodeQuery(query);
    locationGeoCache.set(locationId, coords);
    return coords;
  } catch {
    locationGeoCache.set(locationId, null);
    return null;
  }
}

// ─── Marker HTML ──────────────────────────────────────────────────────────────

export function hasPublicHours(court: CourtWithCount): boolean {
  return court.courtType.toLowerCase() === 'club'
    && !!court.clubInfo
    && !court.clubInfo.toLowerCase().includes('private');
}

// Half-and-half circle (two markers at once, e.g. active players + a program).
const splitMarkerSvg = (s: number, colorA: string, colorB: string, label: string, fs: number): string => {
  const r = s / 2;
  return `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${r},0 A${r},${r} 0 0,0 ${r},${s} Z" fill="${colorA}" opacity="0.95"/>
      <path d="M${r},0 A${r},${r} 0 0,1 ${r},${s} Z" fill="${colorB}" opacity="0.95"/>
      <text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle" fill="white" font-size="${fs}" font-family="sans-serif" font-weight="bold">${label}</text>
    </svg>`;
};

// Single-color circle, with an optional centered count label.
const soloMarkerSvg = (s: number, color: string, opacity: number, label?: string, fs?: number): string => {
  const r = s / 2;
  const text = label != null
    ? `\n      <text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle" fill="white" font-size="${fs}" font-family="sans-serif" font-weight="bold">${label}</text>`
    : '';
  return `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${r}" cy="${r}" r="${r}" fill="${color}" opacity="${opacity}"/>${text}
    </svg>`;
};

/**
 * Marker size bands, scaled off the busiest court so they stay meaningful as the league grows.
 *
 * `unit` is a fifth of the busiest count, rounded to the nearest 10 (floor of 10). The smallest
 * and largest bands each take one unit at either end; the two middle bands split the remaining
 * three units evenly. With a busiest court of 100 that gives 1-20 / 21-50 / 51-80 / 81+.
 *
 * Hardcoded bands would have put every court in the top tier once the league doubled.
 */
export const markerSizeBands = (busiestCount: number) => {
  const unit = Math.max(10, Math.round(busiestCount / 5 / 10) * 10);
  return { small: unit, medium: unit * 2.5, large: unit * 4 };
};

const MARKER_SIZES = [16, 22, 28, 34];

export function courtMarkerHtml(court: CourtWithCount, busiestCount = 0): string {
  const hasPlayers = court.count > 0;
  const bands = markerSizeBands(busiestCount);
  const tier = court.count <= bands.small ? 0
    : court.count <= bands.medium ? 1
    : court.count <= bands.large ? 2
    : 3;
  const s = !hasPlayers ? 12 : MARKER_SIZES[tier];
  const label = String(court.count);
  // Three-digit counts need to shrink to stay inside the circle.
  const fs = label.length >= 3 ? 8 : label.length === 2 ? 10 : 11;

  if (hasPlayers && court.hasPrograms) return splitMarkerSvg(s, '#15803d', '#eab308', label, fs);
  if (hasPlayers && hasPublicHours(court)) return splitMarkerSvg(s, '#15803d', '#3b82f6', label, fs);
  if (hasPlayers) return soloMarkerSvg(s, '#15803d', 0.95, label, fs);
  if (court.hasPrograms) return soloMarkerSvg(s, '#eab308', 0.82);
  if (hasPublicHours(court)) return soloMarkerSvg(s, '#3b82f6', 0.82);
  if (court.courtType.toLowerCase() === 'club') return soloMarkerSvg(s, '#f97316', 0.75);
  return soloMarkerSvg(s, '#94a3b8', 0.75);
}

export function pickleballMarkerHtml(): string {
  return soloMarkerSvg(12, '#94a3b8', 0.75);
}
