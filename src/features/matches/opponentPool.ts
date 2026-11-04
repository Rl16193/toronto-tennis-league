// The Challenges and Rallies opponent pool: the weekly cycle, the mixed list with its pills, the
// weekly refresh and the per-slot randomizer. Pure apart from this device's localStorage.
import type { LeagueRow } from '../leagues/useStandings';

export type Mode = 'tournament' | 'rallies' | 'challenges';

// ── Per-slot randomizer (both tabs): 12 category slots, each with its own dice. A weekly budget of
// 2 slots may go "randomized"; re-rolls are then free, originals kept. Same boundary the pool
// refresh rolls over on — both reset Thursday 8:00am local, not on a calendar week.
export const RAND_SLOTS_PER_WEEK = 2;
const CYCLE_ANCHOR = new Date(2024, 0, 4, 8, 0, 0, 0).getTime(); // a Thursday, 8:00am local
const CYCLE_MS = 7 * 24 * 60 * 60 * 1000;
export const weekKey = (now = Date.now()) => `cycle-${Math.floor((now - CYCLE_ANCHOR) / CYCLE_MS)}`;
const randStoreKey = (uid: string, mode: Mode) => `matches_rand_${mode}_${uid}_${weekKey()}`;
export type RandState = { slots: number[]; overrides: Record<number, string> };
export const loadRandState = (uid: string, mode: Mode): RandState => {
  try { const raw = localStorage.getItem(randStoreKey(uid, mode)); if (raw) return JSON.parse(raw) as RandState; }
  catch { /* ignore */ }
  return { slots: [], overrides: {} };
};
export const saveRandState = (uid: string, mode: Mode, s: RandState) => {
  try { localStorage.setItem(randStoreKey(uid, mode), JSON.stringify(s)); } catch { /* ignore */ }
};

/** Re-rolls pool slot `i` from `source`, skipping anyone shown or excluded; null when not allowed. */
export const rerollSlot = (
  rand: RandState, i: number, source: LeagueRow[], shownIds: Set<string>, excluded: Set<string>, random = Math.random,
): RandState | null => {
  const already = rand.slots.includes(i);
  if (!already && RAND_SLOTS_PER_WEEK - rand.slots.length <= 0) return null;
  const pool = source.filter((r) => !shownIds.has(r.user_id) && !excluded.has(r.user_id));
  if (pool.length === 0) return null;
  const pick = pool[Math.floor(random() * pool.length)];
  return { slots: already ? rand.slots : [...rand.slots, i], overrides: { ...rand.overrides, [i]: pick.user_id } };
};
export const resetSlot = (rand: RandState, i: number): RandState => {
  const rest = { ...rand.overrides };
  delete rest[i];
  return { slots: rand.slots.filter((s) => s !== i), overrides: rest };
};

// ── Weekly pool refresh: anyone shown last cycle who never got a Challenge/Rally from the viewer
// is dropped this cycle, so the same untouched names don't sit there forever. Not permanent — one
// quiet cycle makes them eligible again. `skipUids` is decided once per cycle (from the PRIOR
// cycle's shown list) and persisted, so it stays stable across reloads within the cycle.
// How many players each tab shows.
export const POOL_SIZE = 20;

const seenStoreKey = (uid: string, mode: Mode) => `matches_seen_${mode}_${uid}`;
type SeenRecord = { cycle: string; shownUids: string[]; skipUids: string[] };
const loadSeen = (uid: string, mode: Mode): SeenRecord | null => {
  try { const raw = localStorage.getItem(seenStoreKey(uid, mode)); if (raw) return JSON.parse(raw) as SeenRecord; }
  catch { /* ignore */ }
  return null;
};
const saveSeen = (uid: string, mode: Mode, rec: SeenRecord) => {
  try { localStorage.setItem(seenStoreKey(uid, mode), JSON.stringify(rec)); } catch { /* ignore */ }
};
// When each tab was last opened on this device: the week's pool and the requests then waiting.
// Anything newer shows "New Players Available" on that tab's card.
const openedStoreKey = (uid: string, mode: Mode) => `matches_opened_${mode}_${uid}`;
type OpenedRecord = { cycle: string; requestIds: string[] };
export const loadOpened = (uid: string, mode: Mode): OpenedRecord | null => {
  try { const raw = localStorage.getItem(openedStoreKey(uid, mode)); if (raw) return JSON.parse(raw) as OpenedRecord; }
  catch { /* ignore */ }
  return null;
};
export const saveOpened = (uid: string, mode: Mode, rec: OpenedRecord) => {
  try { localStorage.setItem(openedStoreKey(uid, mode), JSON.stringify(rec)); } catch { /* ignore */ }
};
export const refreshPool = (uid: string, mode: Mode, extended: LeagueRow[], requestedIds: Set<string>): LeagueRow[] => {
  const cycle = weekKey();
  const stored = loadSeen(uid, mode);
  const skipUids = stored && stored.cycle === cycle
    ? new Set(stored.skipUids)
    : new Set((stored?.shownUids ?? []).filter((id) => !requestedIds.has(id)));
  const filtered = skipUids.size > 0 ? extended.filter((r) => !skipUids.has(r.user_id)) : extended;
  const top = filtered.slice(0, POOL_SIZE);
  if (!stored || stored.cycle !== cycle) {
    saveSeen(uid, mode, { cycle, shownUids: top.map((r) => r.user_id), skipUids: [...skipUids] });
  }
  return top;
};

// Deterministic pseudo-random in [0,1) from a string seed — used to give the Rallies pool a
// stable-for-the-week tiebreak among equally-active players (so the 12 shown can rotate weekly
// without jittering on every reload).
export const seededRand = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967296;
};

/** Most matches first, then the week's stable shuffle. */
export const byActivity = (week: string) => (a: LeagueRow, b: LeagueRow) =>
  (b.matchesPlayed - a.matchesPlayed) || (seededRand(week + a.user_id) - seededRand(week + b.user_id));

// One mixed list per tab, each person carrying pills that say why they're on it. The BASE POOL
// differs per tab: Challenges is locked to the viewer's league (points only mean something within
// a division); Rallies is cross-league.
export type PlayerTag = 'new' | 'played' | 'nearby' | 'rematch';
export const TAG_LABEL: Record<PlayerTag, string> = {
  new: 'New', played: 'Most matches', nearby: 'Nearby', rematch: 'Re-Match',
};

/**
 * The tab's whole candidate list, mixed, and each person's pills. New = no match played yet;
 * Most matches = the top quarter of this pool by matches played; Nearby = a shared court;
 * Re-Match = played before. No fixed share per pill: the list takes one person from each pill in
 * turn, so a week with more new sign-ups simply shows more New. Untagged people fill the rest.
 */
export const mixPool = (pool: LeagueRow[], ctx: {
  isNearby: (r: LeagueRow) => boolean;
  lastPlayedByUid: Map<string, number>;
  joinedAtByUid: Record<string, number>;
  byActivity: (a: LeagueRow, b: LeagueRow) => number;
}) => {
  const { isNearby, lastPlayedByUid, joinedAtByUid, byActivity: activity } = ctx;
  const played = pool.map((r) => r.matchesPlayed).filter((n) => n > 0).sort((a, b) => b - a);
  const cutoff = played[Math.max(0, Math.ceil(played.length / 4) - 1)] ?? Infinity;
  const tags = new Map<string, PlayerTag[]>();
  pool.forEach((r) => {
    const t: PlayerTag[] = [];
    if (r.matchesPlayed === 0) t.push('new');
    if (r.matchesPlayed > 0 && r.matchesPlayed >= cutoff) t.push('played');
    if (isNearby(r)) t.push('nearby');
    if (lastPlayedByUid.has(r.user_id)) t.push('rematch');
    tags.set(r.user_id, t);
  });
  const bucket = (t: PlayerTag, cmp: (a: LeagueRow, b: LeagueRow) => number) =>
    pool.filter((r) => tags.get(r.user_id)!.includes(t)).sort(cmp);
  const buckets = [
    bucket('new', (a, b) => (joinedAtByUid[b.user_id] ?? 0) - (joinedAtByUid[a.user_id] ?? 0) || activity(a, b)),
    bucket('nearby', activity),
    bucket('played', (a, b) => b.matchesPlayed - a.matchesPlayed || a.name.localeCompare(b.name)),
    bucket('rematch', (a, b) => (lastPlayedByUid.get(b.user_id) ?? 0) - (lastPlayedByUid.get(a.user_id) ?? 0)),
  ];
  const seen = new Set<string>();
  const list: LeagueRow[] = [];
  const add = (r?: LeagueRow) => { if (r && !seen.has(r.user_id)) { seen.add(r.user_id); list.push(r); } };
  for (let i = 0; buckets.some((b) => i < b.length); i++) buckets.forEach((b) => add(b[i]));
  pool.filter((r) => !seen.has(r.user_id)).sort(activity).forEach(add);
  return { list, tags };
};
