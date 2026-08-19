import type { LeagueRow } from '../leagues/useStandings';

export type Mode = 'tournament' | 'friendlies' | 'challenges';
export type PlayerFilter = 'nearby' | 'new' | 'played' | 'rematch';
export type RandState = { slots: number[]; overrides: Record<number, string> };
export type SeenRecord = { cycle: string; shownUids: string[]; skipUids: string[] };

export const RAND_SLOTS_PER_WEEK = 2;
export const POOL_SIZE = 10;

const CYCLE_ANCHOR = new Date(2024, 0, 4, 8, 0, 0, 0).getTime();
const CYCLE_MS = 7 * 24 * 60 * 60 * 1000;

/** The pool and randomizer share this Thursday 08:00 local rollover. */
export const weekKey = () => `cycle-${Math.floor((Date.now() - CYCLE_ANCHOR) / CYCLE_MS)}`;

const randStoreKey = (uid: string, mode: Mode) => `matches_rand_${mode}_${uid}_${weekKey()}`;
const seenStoreKey = (uid: string, mode: Mode) => `matches_seen_${mode}_${uid}`;

export const loadRandState = (uid: string, mode: Mode): RandState => {
  try {
    const raw = localStorage.getItem(randStoreKey(uid, mode));
    if (raw) return JSON.parse(raw) as RandState;
  } catch {
    // Storage can be unavailable or contain a stale value; the default is safe.
  }
  return { slots: [], overrides: {} };
};

export const saveRandState = (uid: string, mode: Mode, state: RandState) => {
  try {
    localStorage.setItem(randStoreKey(uid, mode), JSON.stringify(state));
  } catch {
    // The in-memory state remains authoritative for the current render.
  }
};

const loadSeen = (uid: string, mode: Mode): SeenRecord | null => {
  try {
    const raw = localStorage.getItem(seenStoreKey(uid, mode));
    if (raw) return JSON.parse(raw) as SeenRecord;
  } catch {
    // A missing or restricted cache should not block browsing the pool.
  }
  return null;
};

const saveSeen = (uid: string, mode: Mode, record: SeenRecord) => {
  try {
    localStorage.setItem(seenStoreKey(uid, mode), JSON.stringify(record));
  } catch {
    // The next render can recompute the pool if persistence is unavailable.
  }
};

/**
 * Remove untouched names from the previous cycle, then cap the visible pool. The skip list is
 * persisted once per cycle so reloads do not reshuffle the same people unexpectedly.
 */
export const refreshPool = (uid: string, mode: Mode, extended: LeagueRow[], requestedIds: Set<string>): LeagueRow[] => {
  const cycle = weekKey();
  const stored = loadSeen(uid, mode);
  const skipUids =
    stored && stored.cycle === cycle
      ? new Set(stored.skipUids)
      : new Set((stored?.shownUids ?? []).filter((id) => !requestedIds.has(id)));
  const filtered = skipUids.size > 0 ? extended.filter((row) => !skipUids.has(row.user_id)) : extended;
  const top = filtered.slice(0, POOL_SIZE);
  if (!stored || stored.cycle !== cycle) {
    saveSeen(uid, mode, { cycle, shownUids: top.map((row) => row.user_id), skipUids: [...skipUids] });
  }
  return top;
};

/** Stable-for-the-week tiebreaker for equally active members. */
export const seededRand = (seed: string): number => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return (hash >>> 0) / 4294967296;
};

export const ALLOCATION_ORDER: Exclude<PlayerFilter, 'rematch'>[] = ['nearby', 'new', 'played'];
