import { parseCsvLine } from '../../../utils/csv';

const PRELOADED_COURTS = [
  'Dovercourt Park',
  'High Park',
  'Moss Park',
  'Ramsden Park',
  'Riverdale Park East',
  'Sorauren Avenue Park',
  'Stanley Park',
  'Trinity Bellwoods Park',
];

export const defaultCourtOptions = PRELOADED_COURTS;

export { parseCsvLine };

export const extractDropdownCourts = (csvText: string) => {
  const [headerLine, ...lines] = csvText.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const dropdownIndex = headers.indexOf('Dropdown');
  if (dropdownIndex < 0) return [];

  return lines
    .map((line) => parseCsvLine(line)[dropdownIndex]?.trim())
    .filter((court): court is string => Boolean(court));
};

export const mergeCourtOptions = (courts: string[]) =>
  [...new Set([...PRELOADED_COURTS, ...courts])].sort((a, b) => a.localeCompare(b));

export const extractCourtsWithCoords = (csvText: string): Map<string, { lat: number; lng: number }> => {
  const [headerLine, ...lines] = csvText.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const iDropdown = headers.indexOf('Dropdown');
  const iName = headers.indexOf('Name');
  const iGeom = headers.indexOf('geometry');
  if (iGeom < 0) return new Map();

  const map = new Map<string, { lat: number; lng: number }>();
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const geomRaw = cells[iGeom];
    if (!geomRaw) continue;
    try {
      const geom = JSON.parse(geomRaw) as { coordinates: [[number, number]] };
      const [lng, lat] = geom.coordinates[0];
      const dropdown = (cells[iDropdown] || cells[iName] || '').trim();
      if (dropdown && lat && lng) map.set(dropdown.toLowerCase(), { lat, lng });
    } catch { /* skip malformed */ }
  }
  return map;
};

export const getCourtSuggestions = (courtOptions: string[], selectedCourts: string[], query: string) => {
  const courtQuery = query.trim().toLowerCase();

  return courtOptions
    .filter((court) => !selectedCourts.includes(court))
    .filter((court) => !courtQuery || court.toLowerCase().includes(courtQuery))
    .sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const score = (value: string) => {
        if (courtQuery && value === courtQuery) return 0;
        if (courtQuery && value.startsWith(courtQuery)) return 1;
        if (courtQuery && value.includes(courtQuery)) return 2;
        return 3;
      };
      return score(aLower) - score(bLower) || a.localeCompare(b);
    })
    .filter(() => courtQuery.length > 0);
};
