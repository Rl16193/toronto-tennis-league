import { parseCourts, type CsvCourt } from '../../pages/courtmap/courtMapUtils';

// The one loader for the courts CSV outside the map: check-in, photo submission, the score sheet,
// the courts editor and signup. No player-count enrichment (that's CourtMap's job). Shares the
// sessionStorage cache key with useCourtData so a prior /courts visit avoids a re-fetch.
const CSV_URL = '/Tennis Courts Facilities - 4326.csv';
const CACHE_KEY = `csv_cache_${CSV_URL}`;

let cached: CsvCourt[] | null = null;

/** The raw CSV text ('' if it can't be fetched), cached for the session. */
export async function loadCourtsCsv(): Promise<string> {
  let text = '';
  try { text = sessionStorage.getItem(CACHE_KEY) || ''; } catch { /* unavailable */ }
  if (!text) {
    text = await fetch(CSV_URL).then((r) => (r.ok ? r.text() : ''));
    try { if (text) sessionStorage.setItem(CACHE_KEY, text); } catch { /* quota */ }
  }
  return text;
}

export async function loadCourtList(): Promise<CsvCourt[]> {
  if (cached) return cached;
  const text = await loadCourtsCsv();
  cached = text ? parseCourts(text) : [];
  return cached;
}
