const PRELOADED_COURTS = [
  'Sorauren Park',
  'High Park',
  'Riverdale',
  'Trinity Bellwoods',
  'Ramsden Park',
  'Stanley Park',
  'Moss Park',
  'Dovercourt',
];

export const defaultCourtOptions = PRELOADED_COURTS;

export const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
};

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
