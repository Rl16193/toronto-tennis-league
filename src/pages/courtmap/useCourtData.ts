import { useEffect, useState } from 'react';
import { getDocs, getDoc, doc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ActivityBreakdown, CourtWithCount, TennisProgram, PickleballOnlyCourt, CsvCourt } from './courtMapUtils';
import { EMPTY_ACTIVITY, parseCourts, parsePrograms, getPickleballMappings, matchCourtName, NINETY_DAYS_MS } from './courtMapUtils';
import { courtKey } from '../../utils/courtKey';
import { toMillis } from '../../utils/eventDates';

// Shape of the `activity` half of site_stats/court_counts (functions/courtCounts.js).
// byKey: court_key → { checkins, waiting_board, queue, condition }; byName: typed court name → scores.
type ActivityWindow = { byKey?: Record<string, Partial<ActivityBreakdown> | number>; byName?: Record<string, number> };
const activityTotal = (b: ActivityBreakdown) => b.scores + b.checkins + b.waiting_board + b.queue + b.condition;
type ActivityAggregate = { d7?: ActivityWindow; d30?: ActivityWindow };

// sessionStorage is ~5 MB per origin, so anything over this simply isn't cached (writing it would
// just throw QuotaExceededError into the catch below). Both CSVs now fit comfortably: the raw
// 9 MB city programs export is filtered down to tennis-only at build time — see
// scripts/build-programs-csv.mjs — so the programs file caches like the courts one.
const MAX_CACHE_BYTES = 2_000_000;

const fetchCsv = async (url: string): Promise<string> => {
  const key = `csv_cache_${url}`;
  try {
    const hit = sessionStorage.getItem(key);
    if (hit) return hit;
  } catch { /* sessionStorage unavailable */ }
  const text = await fetch(url).then((r) => (r.ok ? r.text() : ''));
  if (text && text.length <= MAX_CACHE_BYTES) {
    try { sessionStorage.setItem(key, text); } catch { /* quota exceeded */ }
  }
  return text;
};

export function useCourtData(): {
  courts: CourtWithCount[];
  programs: TennisProgram[];
  pickleballOnly: PickleballOnlyCourt[];
  loading: boolean;
  loadingProgress: number;
  setPrograms: React.Dispatch<React.SetStateAction<TennisProgram[]>>;
} {
  const [courts, setCourts] = useState<CourtWithCount[]>([]);
  const [programs, setPrograms] = useState<TennisProgram[]>([]);
  const [pickleballOnly, setPickleballOnly] = useState<PickleballOnlyCourt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Only the small courts file (~36 KB) is awaited. The programs file is ~9.5 MB and used to
      // sit in the same Promise.all, so nothing rendered until it had fully downloaded and its
      // 29k rows had been parsed — that was the Court Map's "loading" screen. It now streams in
      // behind the map, and the two Firestore-derived passes below merge in independently.
      const courtsCsv = await fetchCsv('/Tennis Courts Facilities - 4326.csv');
      if (cancelled) return;
      setLoadingProgress(40);

      const rawCourts = parseCourts(courtsCsv);
      const byDropdown = new Map<string, CsvCourt>();
      const byName = new Map<string, CsvCourt>();
      for (const court of rawCourts) {
        byDropdown.set(court.dropdown.toLowerCase(), court);
        byName.set(court.name.toLowerCase(), court);
      }

      const { pbByDropdown, pbOnly } = getPickleballMappings(byDropdown, byName);
      if (cancelled) return;
      setPickleballOnly(pbOnly);
      setLoadingProgress(70);

      // `hasPrograms` starts false and is filled in by the programs pass below.
      setCourts(rawCourts.map((c) => ({
        ...c, count: 0,
        activity7: 0,
        activity30: 0,
        activityBreakdown7: EMPTY_ACTIVITY,
        activityBreakdown30: EMPTY_ACTIVITY,
        reports: [],
        reportCount: 0,
        hasPrograms: false,
        pickleballEntries: pbByDropdown.get(c.dropdown) ?? [],
      })));
      setLoadingProgress(100);
      setLoading(false);

      // ── Player counts per court (independent, merged by dropdown) ──────────────
      const loadCounts = async () => {
        const TIMEOUT_MS = 10_000;
        const withTimeout = <T,>(p: Promise<T>) =>
          Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))]);

        // Preferred path: one document, written every 6h by the aggregateCourtCounts function
        // (functions/courtCounts.js). Its keys are raw preferred_courts strings, so the
        // court-name matching still happens here — over a few hundred distinct strings rather
        // than over every user in the app.
        try {
          const aggSnap = await withTimeout(getDoc(doc(db, 'site_stats', 'court_counts')));
          const data = aggSnap.exists() ? aggSnap.data() : undefined;
          const raw = data?.counts as Record<string, number> | undefined;

          // Recent activity rides along in the same document. Its `byKey` half is already keyed
          // by court_key, so it only needs slugifying our own dropdown to line up; the `byName`
          // half is free-text court names off match docs and goes through matchCourtName, the
          // same one-place-only resolution the preference counts use.
          // Latest court-condition notes, keyed by court_key like activity.byKey.
          const reports = data?.reports as Record<string, string[]> | undefined;
          const reportCounts = (data?.report_counts ?? {}) as Record<string, number>;
          if (reports && !cancelled) {
            setCourts((prev) => prev.map((c) => {
              const notes = reports[courtKey(c.dropdown)] ?? [];
              return { ...c, reports: notes, reportCount: reportCounts[courtKey(c.dropdown)] ?? notes.length };
            }));
          }

          const activity = data?.activity as ActivityAggregate | undefined;
          if (activity) {
            const resolve = (win?: ActivityWindow) => {
              const m = new Map<string, ActivityBreakdown>();
              if (!win) return m;
              const row = (dropdown: string) => {
                if (!m.has(dropdown)) m.set(dropdown, { ...EMPTY_ACTIVITY });
                return m.get(dropdown)!;
              };
              const byKeySlug = new Map<string, string>();
              for (const c of rawCourts) byKeySlug.set(courtKey(c.dropdown), c.dropdown);
              for (const [key, kinds] of Object.entries(win.byKey ?? {})) {
                const dropdown = byKeySlug.get(key);
                // A plain number is the pre-breakdown shape (function not yet redeployed): no pills.
                if (!dropdown || typeof kinds !== 'object') continue;
                const r = row(dropdown);
                r.checkins += kinds.checkins ?? 0;
                r.waiting_board += kinds.waiting_board ?? 0;
                r.queue += kinds.queue ?? 0;
                r.condition += kinds.condition ?? 0;
              }
              for (const [name, n] of Object.entries(win.byName ?? {})) {
                const matched = matchCourtName(name, byDropdown, byName);
                if (matched) row(matched.dropdown).scores += n;
              }
              return m;
            };
            const a7 = resolve(activity.d7);
            const a30 = resolve(activity.d30);
            if (!cancelled) {
              setCourts((prev) => prev.map((c) => {
                const b7 = a7.get(c.dropdown) ?? EMPTY_ACTIVITY;
                const b30 = a30.get(c.dropdown) ?? EMPTY_ACTIVITY;
                return { ...c, activity7: activityTotal(b7), activity30: activityTotal(b30), activityBreakdown7: b7, activityBreakdown30: b30 };
              }));
            }
          }

          if (raw && Object.keys(raw).length) {
            if (cancelled) return;
            const aggMap = new Map<string, number>();
            for (const [pref, n] of Object.entries(raw)) {
              const matched = matchCourtName(pref, byDropdown, byName);
              if (matched) aggMap.set(matched.dropdown, (aggMap.get(matched.dropdown) ?? 0) + n);
            }
            setCourts((prev) => prev.map((c) => ({ ...c, count: aggMap.get(c.dropdown) ?? 0 })));
            return;
          }
        } catch { /* aggregate unavailable — fall through to computing it client-side */ }

        // Fallback: the original in-browser computation. Kept so the page still works before the
        // Cloud Function is deployed, and if the aggregate doc is ever missing or empty.
        const [prefsSnap, statsSnap, usersSnap] = await Promise.all([
          withTimeout(getDocs(collection(db, 'preferences'))),
          withTimeout(getDocs(collection(db, 'stats'))),
          withTimeout(getDocs(collection(db, 'users'))),
        ]);
        if (cancelled) return;

        const statsMap = new Map<string, number>();
        statsSnap.forEach((d) => statsMap.set(d.id, (d.data().leaguePoints as number) || 0));

        const lastActiveMap = new Map<string, number>();
        usersSnap.forEach((d) => {
          lastActiveMap.set(d.id, toMillis(d.data().lastActive));
        });

        const now = Date.now();
        const courtCountMap = new Map<string, number>();
        prefsSnap.forEach((d) => {
          const uid = d.id;
          const preferred: string[] = d.data().preferred_courts || [];
          if (!preferred.length) return;
          const points = statsMap.get(uid) ?? 0;
          const lastActive = lastActiveMap.get(uid) ?? 0;
          if (!points && now - lastActive >= NINETY_DAYS_MS) return;
          for (const pref of preferred) {
            const matched = matchCourtName(pref, byDropdown, byName);
            if (matched) courtCountMap.set(matched.dropdown, (courtCountMap.get(matched.dropdown) ?? 0) + 1);
          }
        });

        if (cancelled) return;
        // Functional update: the programs pass may have already patched `hasPrograms`.
        setCourts((prev) => prev.map((c) => ({ ...c, count: courtCountMap.get(c.dropdown) ?? 0 })));
      };

      // ── Programs ───────────────────────────────────────────────────────────────
      // Tennis-only slice of the city's programs export, prebuilt by
      // scripts/build-programs-csv.mjs (~0.15 MB instead of ~9 MB). Same headers as the source,
      // so parsePrograms is unchanged — it just no longer has to discard 29k non-tennis rows.
      const loadPrograms = async () => {
        const programsCsv = await fetchCsv('/programs-tennis.csv');
        if (cancelled || !programsCsv) return;

        const parsedPrograms = parsePrograms(programsCsv, byDropdown, byName);
        const programDropdowns = new Set<string>();
        for (const prog of parsedPrograms) {
          if (prog.lat !== undefined) {
            const c = matchCourtName(prog.locationName, byDropdown, byName);
            if (c) programDropdowns.add(c.dropdown.toLowerCase());
          }
        }

        if (cancelled) return;
        setPrograms(parsedPrograms);
        // Functional update: the counts pass may have already landed.
        setCourts((prev) => prev.map((c) => ({
          ...c, hasPrograms: programDropdowns.has(c.dropdown.toLowerCase()),
        })));
      };

      await Promise.all([
        loadCounts().catch(() => { /* Firestore unavailable — counts stay 0 */ }),
        loadPrograms().catch(() => { /* programs stay empty; courts still work */ }),
      ]);
    };

    load().catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return { courts, programs, pickleballOnly, loading, loadingProgress, setPrograms };
}
