import { parseCourts } from '../courts/csv';
import type { CsvCourt } from '../courts/types';

// Lightweight courts loader for the Tasks features (check-in, photo submission) — just the
// parsed CSV, no Firestore player-count enrichment (that's CourtMap's job). Shares the same
// sessionStorage cache key as useCourtData so a prior /courts visit avoids a re-fetch.
const CSV_URL = '/Tennis Courts Facilities - 4326.csv';
const CACHE_KEY = `csv_cache_${CSV_URL}`;

let cached: CsvCourt[] | null = null;

export async function loadCourtList(): Promise<CsvCourt[]> {
  if (cached) return cached;
  let text = '';
  try { text = sessionStorage.getItem(CACHE_KEY) || ''; } catch { /* unavailable */ }
  if (!text) {
    text = await fetch(CSV_URL).then((r) => (r.ok ? r.text() : ''));
    try { if (text) sessionStorage.setItem(CACHE_KEY, text); } catch { /* quota */ }
  }
  cached = text ? parseCourts(text) : [];
  return cached;
}
