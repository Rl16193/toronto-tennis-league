import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { Check, Dices, X } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay, tapScale } from '../lib/motion';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { SegmentedControl } from '../components/SegmentedControl';
import { useUserMatches } from '../features/matches/useUserMatches';
import { RacquetIcon } from '../components/RacquetIcon';
import { ContactOpponentButton, pillButtonCls } from '../components/ContactOpponentButton';
import { PlayerCard, RankMove } from '../components/PlayerCard';
import { ScoreModal } from './tournament/ScoreModal';
import { ScoreForm } from './tournament/types';
import { DivTab, LeagueRow, inDivision, pgWinPct, toTitleCase, useStandings } from '../features/leagues/useStandings';
import { cancelRally, createRally, respondRally, useRallies } from '../features/friendlies/rallyService';
import { fetchEvents } from '../features/events/services/eventService';
import { isLadderEvent } from '../utils/eventTypes';
import { TennisEvent } from '../types';
import { createChallenge, cancelChallenge, respondChallenge, reportChallenge, confirmChallenge, rejectChallenge, proposeConversion, confirmConversion, LadderChallenge, LadderDivision } from '../features/leagues/ladderService';
import { useLadder } from '../features/leagues/useLadder';
import { useCrossEventConflicts } from '../features/leagues/useCrossEventConflicts';
import { isReadyForMatches } from '../features/leagues/useChallengeRules';
import { skillBand } from './tournament/utils';
// Lazy: the tournament subsystem (useTournament.ts alone is ~2k lines, plus the draw engine and
// ~20 components) was the bulk of this route's bundle, shipped even to people who only open
// Friendlies or Challenges.
const Tournament = lazyWithRetry(() => import('./Tournament').then((m) => ({ default: m.Tournament })), 'Tournament');
import { CompleteProfileModal } from '../features/profile/components/CompleteProfileModal';
import { AvailabilityModal } from '../features/profile/components/AvailabilityModal';
import { sharesCourt } from '../utils/courtOverlap';
import { NearbyPill } from '../components/NearbyPill';
import { AvailabilityPills } from '../components/AvailabilityPills';

type Mode = 'tournament' | 'friendlies' | 'challenges';

// `isReadyForMatches` now lives in features/leagues/useChallengeRules so the Leaderboard's
// Challenge button gates on exactly the same rule (see the import above).

// ── Per-slot randomizer (both tabs): 12 category slots, each with its own dice. A weekly budget of
// 2 slots may go "randomized"; re-rolls are then free, originals kept. Same boundary the pool
// refresh rolls over on — both reset Thursday 8:00am local, not on a calendar week.
const RAND_SLOTS_PER_WEEK = 2;
const CYCLE_ANCHOR = new Date(2024, 0, 4, 8, 0, 0, 0).getTime(); // a Thursday, 8:00am local
const CYCLE_MS = 7 * 24 * 60 * 60 * 1000;
const weekKey = () => `cycle-${Math.floor((Date.now() - CYCLE_ANCHOR) / CYCLE_MS)}`;
const randStoreKey = (uid: string, mode: Mode) => `matches_rand_${mode}_${uid}_${weekKey()}`;
type RandState = { slots: number[]; overrides: Record<number, string> };
const loadRandState = (uid: string, mode: Mode): RandState => {
  try { const raw = localStorage.getItem(randStoreKey(uid, mode)); if (raw) return JSON.parse(raw) as RandState; }
  catch { /* ignore */ }
  return { slots: [], overrides: {} };
};
const saveRandState = (uid: string, mode: Mode, s: RandState) => {
  try { localStorage.setItem(randStoreKey(uid, mode), JSON.stringify(s)); } catch { /* ignore */ }
};

// ── Weekly pool refresh: anyone shown last cycle who never got a Challenge/Rally from the viewer
// is dropped this cycle, so the same untouched names don't sit there forever. Not permanent — one
// quiet cycle makes them eligible again. `skipUids` is decided once per cycle (from the PRIOR
// cycle's shown list) and persisted, so it stays stable across reloads within the cycle.
// How many players each filter shows.
const POOL_SIZE = 10;

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
const refreshPool = (uid: string, mode: Mode, extended: LeagueRow[], requestedIds: Set<string>): LeagueRow[] => {
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

// Deterministic pseudo-random in [0,1) from a string seed — used to give the Friendlies pool a
// stable-for-the-week tiebreak among equally-active players (so the 12 shown can rotate weekly
// without jittering on every reload).
const seededRand = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967296;
};

// One "Matches" hub: Friendlies (non-competitive) and Challenges (competitive) tabs.
//
// Four explicit filters, not an automatic tier waterfall — "why is this person on my list?" needs
// an answer the player can see. The BASE POOL differs per tab: Challenges is locked to the
// viewer's league (points only mean something within a division); Friendlies is cross-league.
type PlayerFilter = 'nearby' | 'new' | 'played' | 'rematch';
const PLAYER_FILTERS: { value: PlayerFilter; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'played', label: 'Most matches' },
  { value: 'nearby', label: 'Nearby' },
  { value: 'rematch', label: 'Re-Match' },
];

// Each person is claimed by exactly ONE of the first three filters, so browsing all three shows up
// to 30 different names instead of the same faces. Re-Match is exempt — it's a fact about them,
// not a bucket.
// Allocation order is by how constrained each pool is, NOT display order: Nearby has the smallest
// candidate set, so it picks first or ends up empty; Most matches picks last and can always fill.
const ALLOCATION_ORDER: Exclude<PlayerFilter, 'rematch'>[] = ['nearby', 'new', 'played'];

// RallyRow was removed with the separate open-requests list — a rally's state now lives in
// the player's own row (see the stats cell below).

export const Matches: React.FC = () => {
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode');
  const [mode, setMode] = useState<Mode>(
    initialMode === 'challenges' || initialMode === 'friendlies' ? initialMode : 'tournament',
  );
  const [showCompleteProfile, setShowCompleteProfile] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availabilityByUid, setAvailabilityByUid] = useState<Record<string, string[]>>({});
  const { rows, loading: peopleLoading } = useStandings();
  const { sent, received, activePartnerIds, acceptedPartnerIds: acceptedRallyPartnerIds, contactMap: rallyContactMap } = useRallies();
  const [busy, setBusy] = useState<string | null>(null);
  const [rand, setRand] = useState<RandState>({ slots: [], overrides: {} });
  const [courtsByUid, setCourtsByUid] = useState<Record<string, string[]>>({});
  const [joinedAtByUid, setJoinedAtByUid] = useState<Record<string, number>>({});
  const [zoneByUid, setZoneByUid] = useState<Record<string, string>>({});
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('nearby');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  // The single active league ladder (one per league).
  const [ladder, setLadder] = useState<TennisEvent | null>(null);
  const { challenges, myChallenges, incoming, contactMap, stateWith, acceptedPartnerIds: acceptedChallengePartnerIds, activeChallengesLeft } = useLadder(ladder?.id, user?.uid);
  // Completed matches, for the Re-Match filter's "who have I already played" list.
  const { matches } = useUserMatches(user?.uid);
  // One ScoreModal serves both flows; `kind` decides what submitting does. A Challenge reports
  // straight onto the existing challenge doc; a Friendly instead proposes a conversion to a new
  // Challenge, which the other player has to confirm before it counts.
  const [scoreTarget, setScoreTarget] = useState<{ kind: 'challenge' | 'friendly'; uid: string; name: string } | null>(null);
  const [scoreForm, setScoreForm] = useState<ScoreForm | null>(null);
  const closeScore = () => { setScoreForm(null); setScoreTarget(null); };
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Guards the organizer review row so confirm/reject can't be double-fired.
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  // Anti double-farming: block challenging someone already faced in another still-active event.
  const conflicts = useCrossEventConflicts(user?.uid, ladder?.id);

  useEffect(() => { document.title = 'Matches · Racquets & Strings'; }, []);
  useEffect(() => { if (user?.uid) setRand(loadRandState(user.uid, mode)); }, [user?.uid, mode]);
  useEffect(() => {
    fetchEvents().then((all) => setLadder(all.filter((e) => isLadderEvent(e))[0] ?? null)).catch(() => {});
  }, []);
  // Signup date per member, for the "New" filter. `created_at` lives on `users`, which this page
  // didn't otherwise read.
  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) => {
      const joined: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const raw = d.data().created_at;
        const ms = typeof raw === 'string' ? Date.parse(raw) : 0;
        if (Number.isFinite(ms) && ms > 0) joined[d.id] = ms;
      });
      setJoinedAtByUid(joined);
    }).catch(() => { /* New falls back to activity ordering */ });
  }, []);
  // Everyone's preferred courts + availability tags — public preferences, read once for the
  // Friendlies court-overlap check and for showing each row's own availability pills.
  useEffect(() => {
    getDocs(collection(db, 'preferences')).then((snap) => {
      const courts: Record<string, string[]> = {};
      const availability: Record<string, string[]> = {};
      const zones: Record<string, string> = {};
      snap.docs.forEach((d) => {
        courts[d.id] = (d.data().preferred_courts as string[]) || [];
        availability[d.id] = (d.data().availability_tags as string[]) || [];
        zones[d.id] = (d.data().preferred_zone as string) || '';
      });
      setCourtsByUid(courts);
      setAvailabilityByUid(availability);
      setZoneByUid(zones);
    }).catch(() => {});
  }, []);

  const myName = profile?.user.name || '';
  const myDivision: DivTab | null = useMemo(() => {
    const league = profile?.stats?.league || '';
    if (inDivision(league, 'mens')) return 'mens';
    if (inDivision(league, 'womens')) return 'womens';
    return null;
  }, [profile?.stats?.league]);

  // Challenges base pool: same league as the viewer only (no cross-league challenges), sorted
  // best-rank-first — also doubles as the rank lookup for the "#12" shown next to skill.
  const divisionRanked = useMemo(
    () => [...rows.filter((r) => !myDivision || inDivision(r.league, myDivision))]
      .sort((a, b) => b.leaguePoints26 - a.leaguePoints26 || b.matchesPlayed - a.matchesPlayed || a.name.localeCompare(b.name)),
    [rows, myDivision],
  );
  const rankIndexByUid = useMemo(() => {
    const m = new Map<string, number>();
    divisionRanked.forEach((r, i) => m.set(r.user_id, i));
    return m;
  }, [divisionRanked]);
  const myRankIdx = user ? (rankIndexByUid.get(user.uid) ?? -1) : -1;

  // Friendlies base pool: everyone, every league — casual play doesn't care about division.
  const allLeaguesPool = useMemo(
    () => rows.filter((r) => r.user_id && r.user_id !== user?.uid && r.name),
    [rows, user?.uid],
  );

  const myCourts = useMemo(() => new Set(profile?.preferences.preferred_courts ?? []), [profile?.preferences.preferred_courts]);
  const week = weekKey();

  // Most recent completed match against each opponent — drives the Re-Match filter.
  const lastPlayedByUid = useMemo(() => {
    const m = new Map<string, number>();
    matches.forEach((mt) => {
      if (!mt.opponentId) return;
      m.set(mt.opponentId, Math.max(m.get(mt.opponentId) ?? 0, mt.completedAt || 0));
    });
    return m;
  }, [matches]);
  // These comparators feed the pool useMemos below. They're useCallbacks so those memos can list
  // them honestly instead of suppressing exhaustive-deps — the old hand-written dep arrays
  // omitted rankIndexByUid entirely, so a rank refresh didn't re-sort the Challenges pool.
  const byActivity = useCallback((a: LeagueRow, b: LeagueRow) =>
    (b.matchesPlayed - a.matchesPlayed) || (seededRand(week + a.user_id) - seededRand(week + b.user_id)),
  [week]);
  // Shares a preferred court, OR is in the same preferred zone. Court overlap alone is a narrow
  // signal — most members pick two or three courts — and Nearby needs a big enough candidate set
  // to fill its own slice once names are being handed out exclusively.
  const myZone = profile?.preferences.preferred_zone || '';
  const isNearby = useCallback(
    (r: LeagueRow) => sharesCourt(courtsByUid[r.user_id], myCourts)
      || (!!myZone && zoneByUid[r.user_id] === myZone),
    [courtsByUid, myCourts, zoneByUid, myZone],
  );

  const sortFor = useCallback((f: Exclude<PlayerFilter, 'rematch'>) => {
    if (f === 'played') return (a: LeagueRow, b: LeagueRow) => b.matchesPlayed - a.matchesPlayed || a.name.localeCompare(b.name);
    if (f === 'new') return (a: LeagueRow, b: LeagueRow) => (joinedAtByUid[b.user_id] ?? 0) - (joinedAtByUid[a.user_id] ?? 0) || byActivity(a, b);
    return byActivity; // nearby — most active among the people you can actually reach
  }, [joinedAtByUid, byActivity]);

  /**
   * Hands each person to exactly one of the three exclusive filters, then returns the slice for the
   * showing tab. Walks ALLOCATION_ORDER so the most constrained pool claims first.
   * Re-Match is outside this — seeing a familiar name again is its point, so it draws from all.
   */
  const applyFilter = useCallback((pool: LeagueRow[]): LeagueRow[] => {
    if (playerFilter === 'rematch') {
      return pool
        .filter((r) => lastPlayedByUid.has(r.user_id))
        .sort((a, b) => (lastPlayedByUid.get(b.user_id) ?? 0) - (lastPlayedByUid.get(a.user_id) ?? 0));
    }

    // Each filter claims a BLOCK, not just the 10 it shows. The spares feed the weekly refresh and
    // the dice. Because blocks don't overlap, the visible 10s can't either — even after a re-roll.
    const BLOCK = POOL_SIZE * 3;
    const claimed = new Set<string>();
    let mine: LeagueRow[] = [];
    for (const f of ALLOCATION_ORDER) {
      const available = pool.filter((r) => !claimed.has(r.user_id) && (f !== 'nearby' || isNearby(r)));
      const take = available.sort(sortFor(f)).slice(0, BLOCK);
      take.forEach((r) => claimed.add(r.user_id));
      if (f === playerFilter) { mine = take; break; }
    }
    return mine;
  }, [playerFilter, isNearby, sortFor, lastPlayedByUid]);

  const friendliesExtended = useMemo(() => applyFilter(allLeaguesPool), [applyFilter, allLeaguesPool]);
  // "Requested" = a rally you've ever sent them, any status — that's what exempts them from the
  // weekly refresh below.
  const friendliesRequestedIds = useMemo(() => new Set(sent.map((r) => r.player_2_uid)), [sent]);
  const friendliesPool = useMemo(
    () => (user ? refreshPool(user.uid, 'friendlies', friendliesExtended, friendliesRequestedIds) : friendliesExtended.slice(0, POOL_SIZE)),
    [user, friendliesExtended, friendliesRequestedIds, week],
  );

  // Challenges uses the same filter, just over the viewer's own league.
  const challengesExtended = useMemo(
    () => (user ? applyFilter(divisionRanked.filter((r) => r.user_id !== user.uid)) : []),
    [divisionRanked, user, applyFilter],
  );
  // "Requested" = a challenge you've ever sent them, any status.
  const challengesRequestedIds = useMemo(
    () => new Set(challenges.filter((c) => c.player_1_uid === user?.uid).map((c) => c.player_2_uid)),
    [challenges, user?.uid],
  );
  const challengesPool = useMemo(
    () => (user ? refreshPool(user.uid, 'challenges', challengesExtended, challengesRequestedIds) : challengesExtended.slice(0, POOL_SIZE)),
    [user, challengesExtended, challengesRequestedIds, week],
  );

  const people = mode === 'challenges' ? challengesPool : friendliesPool;
  // Re-roll source: each tab keeps drawing from its own full tiered candidate list (not just the
  // initial top 12), so a re-roll still respects that tab's pool and tiering.
  const rerollSource = mode === 'challenges' ? challengesExtended : friendliesExtended;

  const rowById = useMemo(() => new Map(rows.map((r) => [r.user_id, r])), [rows]);

  // Everyone the viewer has an open request with, in either direction, for the current tab.
  // These used to live in their own list above the player grid; that list is gone and the state
  // now shows inside the person's own row.
  const openRequestUids = useMemo(() => {
    const ids = new Set<string>();
    if (mode === 'friendlies') {
      received.filter((r) => r.status === 'open').forEach((r) => ids.add(r.player_1_uid));
      sent.filter((r) => r.status === 'open').forEach((r) => ids.add(r.player_2_uid));
    } else {
      // player_1 is the challenger, player_2 the person challenged — so the "other" person
      // depends on which list it came from.
      incoming.forEach((c) => ids.add(c.player_1_uid));
      myChallenges.forEach((c) => ids.add(c.player_2_uid));
    }
    return ids;
  }, [mode, received, sent, incoming, myChallenges]);

  const slots = useMemo(() => {
    const base = people.map((p, i) => (rand.overrides[i] && rowById.get(rand.overrides[i])) || p);
    // Pinned to the top and exempt from the cap: an open request must never be unreachable just
    // because the person didn't happen to land in the current filter's ten.
    const shown = new Set(base.map((r) => r.user_id));
    const pinned = [...openRequestUids]
      .filter((id) => !shown.has(id))
      .map((id) => rowById.get(id))
      .filter((r): r is LeagueRow => !!r);
    return [...pinned, ...base];
  }, [people, rand.overrides, rowById, openRequestUids]);
  const budgetLeft = RAND_SLOTS_PER_WEEK - rand.slots.length;

  if (!user) return null; // private route

  const randomizeSlot = (i: number) => {
    const already = rand.slots.includes(i);
    if (!already && budgetLeft <= 0) return;
    const shownIds = new Set(slots.map((s) => s.user_id));
    const pool = rerollSource.filter((r) => !shownIds.has(r.user_id) && !activePartnerIds.has(r.user_id));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const next: RandState = {
      slots: already ? rand.slots : [...rand.slots, i],
      overrides: { ...rand.overrides, [i]: pick.user_id },
    };
    setRand(next); saveRandState(user.uid, mode, next);
  };
  const resetSlot = (i: number) => {
    const rest = { ...rand.overrides };
    delete rest[i];
    const next: RandState = { slots: rand.slots.filter((s) => s !== i), overrides: rest };
    setRand(next); saveRandState(user.uid, mode, next);
  };

  // ── Actions ──
  const sendRally = async (to: { id: string; name: string }) => {
    setBusy(to.id);
    try { await createRally({ id: user.uid, name: myName }, to); } finally { setBusy(null); }
  };
  const sendChallenge = async (to: LeagueRow) => {
    if (!ladder || !myDivision) return;
    setBusy(to.user_id);
    try {
      await createChallenge({
        eventId: ladder.id,
        division: myDivision as LadderDivision,
        challenger: { id: user.uid, name: myName },
        opponent: { id: to.user_id, name: to.name },
      });
    } finally { setBusy(null); }
  };

  // Scoring an accepted Friendly — same ScoreModal, but proposes a NEW Challenge (converted from
  // this Friendly) instead of updating an existing one. The other player must confirm it (see
  // confirmConversionRequest below) before it counts toward anything.
  const blankScoreForm = (matchDocId: string): ScoreForm => ({
    matchDocId,
    winnerUserId: '',
    sets: [{ mine: '', opponent: '' }, { mine: '', opponent: '' }, { mine: '', opponent: '' }],
    court: '',
  });

  const openFriendlyScore = (opponent: { user_id: string; name: string }) => {
    setScoreTarget({ kind: 'friendly', uid: opponent.user_id, name: opponent.name });
    setScoreForm(blankScoreForm(''));
  };

  const buildScoreLine = (sets: ScoreForm['sets']) =>
    sets
      .map((s) => ({ mine: Number(s.mine || 0), opponent: Number(s.opponent || 0) }))
      .filter((s) => s.mine > 0 || s.opponent > 0)
      .map((s) => `${s.mine}-${s.opponent}`)
      .join(', ');

  const handleFriendlyScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scoreForm || !scoreTarget || !scoreForm.winnerUserId || !ladder || !myDivision) return;
    const winnerName = scoreForm.winnerUserId === user.uid ? myName : scoreTarget.name;
    await proposeConversion({
      eventId: ladder.id,
      division: myDivision as LadderDivision,
      source: 'friendly',
      sourceId: scoreTarget.uid, // no single rally doc id to key off — the pairing is enough
      proposer: { id: user.uid, name: myName },
      other: { id: scoreTarget.uid, name: scoreTarget.name },
      winner: { id: scoreForm.winnerUserId, name: winnerName },
      scoreLine: buildScoreLine(scoreForm.sets),
      court: scoreForm.court.trim() || undefined,
    });
    closeScore();
  };

  // The other player's side of a proposed conversion (Friendly or Tournament match → Challenge):
  // confirm the same reported score. Lands in 'reported', same as any challenge, awaiting the
  // organizer's normal confirm.
  const confirmConversionRequest = async (c: LadderChallenge) => {
    if (!c.claimed_winner_uid || !c.claimed_winner_name) return;
    setConfirmingId(c.id);
    try {
      await confirmConversion(
        c.id,
        { id: user.uid, name: myName },
        { id: c.claimed_winner_uid, name: c.claimed_winner_name },
        c.score_line || '',
        c.court,
      );
    } finally {
      setConfirmingId(null);
    }
  };

  // Score entry for an accepted challenge — same ScoreModal the tournament bracket uses.
  const openChallengeScore = (opponent: { user_id: string; name: string }) => {
    const ch = challenges.find((c) =>
      c.status === 'accepted' &&
      ((c.player_1_uid === user.uid && c.player_2_uid === opponent.user_id) ||
        (c.player_2_uid === user.uid && c.player_1_uid === opponent.user_id)));
    if (!ch) return;
    setScoreTarget({ kind: 'challenge', uid: opponent.user_id, name: opponent.name });
    setScoreForm(blankScoreForm(ch.id));
  };

  const handleChallengeScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scoreForm || !scoreTarget || !scoreForm.winnerUserId) return;
    const parsedSets = scoreForm.sets.map((s) => ({ mine: Number(s.mine || 0), opponent: Number(s.opponent || 0) }));
    if (parsedSets.some((s) => !Number.isInteger(s.mine) || !Number.isInteger(s.opponent) || s.mine < 0 || s.opponent < 0)) return;
    const scoreLine = buildScoreLine(scoreForm.sets);
    const winnerName = scoreForm.winnerUserId === user.uid ? myName : scoreTarget.name;
    await reportChallenge(
      scoreForm.matchDocId,
      { id: scoreForm.winnerUserId, name: winnerName },
      scoreLine,
      user.uid,
      scoreForm.court.trim() || undefined,
    );
    closeScore();
  };

  // Only OPEN rallies show here — once accepted, the request row disappears from this panel and
  // a Contact button takes its place inline in the players list below.
  const reportedChallenges = challenges.filter((c) => c.status === 'reported');

  return (
    <div className="max-w-xl mx-auto px-4 pb-20 pt-4">
      <h1 className="sr-only">Matches</h1>

      <SegmentedControl<Mode>
        options={[
          { value: 'tournament', label: 'Tournament' },
          { value: 'challenges', label: 'Challenges' },
          { value: 'friendlies', label: 'Friendlies' },
        ]}
        value={mode}
        onChange={setMode}
        className="mb-3"
      />

      {/* Who to show. Sits directly under the mode control so the two read as one filter stack;
          the Tournament tab has no player list, so it doesn't apply there. */}
      {mode !== 'tournament' && (
        <SegmentedControl<PlayerFilter>
          options={PLAYER_FILTERS}
          value={playerFilter}
          onChange={setPlayerFilter}
          className="mb-5"
        />
      )}

      {mode === 'tournament' ? (
        <React.Suspense fallback={<div className="h-64 bg-tennis-surface/30 rounded-3xl animate-pulse" />}>
          <Tournament />
        </React.Suspense>
      ) : !isReadyForMatches(profile) ? (
        <div className="rounded-3xl bg-tennis-surface/30 py-12 px-6 text-center">
          <p className="text-sm text-fg/70 mb-4">
            Set your preferred courts, skill level, and league so we can match you with players.
          </p>
          <Button onClick={() => setShowCompleteProfile(true)}>Complete Profile</Button>
        </div>
      ) : (
      <>
      {/* The old "open requests" lists that sat here are gone. An open request now shows inside
          that person''s own row (Accept/Decline, or Cancel), and openRequestUids pins them into
          the list so a request can never be hidden by the current filter. */}

      {mode === 'challenges' && !ladder && (
        <div className="rounded-2xl bg-fg/5 px-4 py-3 mb-4 text-sm text-fg/70">
          No active league ladder right now.
        </div>
      )}

      {/* Organizer queue — reported results awaiting confirm/reject. */}
      {mode === 'challenges' && ladder?.creator_id === user.uid && reportedChallenges.length > 0 && (
        <div className="rounded-3xl border border-amber-400/30 bg-amber-400/5 overflow-hidden divide-y divide-amber-400/10 mb-5">
          <p className="text-xs font-bold text-amber-300 uppercase tracking-widest px-4 pt-3">Needs your review</p>
          {reportedChallenges.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg truncate">{toTitleCase(c.player_1_name)} vs {toTitleCase(c.player_2_name)}</p>
                <p className="text-[11px] text-fg/70">
                  Winner: {toTitleCase(c.claimed_winner_name || '—')}{c.score_line ? ` · ${c.score_line}` : ''}{c.court ? ` · ${c.court}` : ''}
                </p>
              </div>
              {/* Both actions are disabled while one is in flight. confirmChallenge is now
                  idempotent server-side too, but a double-tap shouldn't fire two transactions
                  in the first place — and the review row disappears a beat after confirming. */}
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={reviewBusy === c.id}
                  onClick={async () => {
                    setReviewBusy(c.id);
                    try { await confirmChallenge(c); } finally { setReviewBusy(null); }
                  }}
                  className="p-2.5 rounded-xl bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40"
                  aria-label="Confirm result"
                ><Check className="w-4 h-4" /></button>
                <button
                  type="button"
                  disabled={reviewBusy === c.id}
                  onClick={async () => {
                    setReviewBusy(c.id);
                    try { await rejectChallenge(c.id); } finally { setReviewBusy(null); }
                  }}
                  className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40"
                  aria-label="Reject result"
                ><X className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] font-bold uppercase tracking-widest text-fg/70 mb-2">
        {budgetLeft} of {RAND_SLOTS_PER_WEEK} randomizes left this week
      </p>
      {mode === 'friendlies' && (
        <p className="text-[11px] text-fg/70 mb-2">Submit the Match Score to convert a Friendly to a Challenge.</p>
      )}

      {peopleLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}</div>
      ) : slots.length === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 py-12 text-center">
          {/* Nearby and Re-Match genuinely can be empty — say why rather than "no players". */}
          <p className="text-sm text-fg">
            {playerFilter === 'rematch' ? 'You haven’t played anyone yet.'
              : playerFilter === 'nearby' ? 'Nobody shares your preferred courts yet.'
              : 'No players found.'}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 overflow-hidden divide-y divide-white/5">
          {slots.map((p, i) => {
            const isRandomized = rand.slots.includes(i);
            const canRandomize = isRandomized || budgetLeft > 0;
            const rallyAccepted = acceptedRallyPartnerIds.has(p.user_id);
            const rallyPending = !rallyAccepted && activePartnerIds.has(p.user_id);
            const challengeAccepted = acceptedChallengePartnerIds.has(p.user_id);
            const challengeState = ladder ? stateWith(p.user_id) : 'cooldown';
            const challengeBlocked = !ladder || !myDivision || challengeState !== 'available'
              || activeChallengesLeft === 0 || conflicts.has(p.user_id);
            // "Connected" is specific to the tab you're on — an accepted Challenge doesn't make
            // someone's name clickable on the Friendlies tab while their rally is still pending.
            const isConnected = mode === 'friendlies' ? rallyAccepted : challengeAccepted;
            const showScore = mode === 'friendlies' ? rallyAccepted : challengeAccepted;
            const showContact = showScore; // contact only once accepted, same gate as Score
            // "Waiting to reply" — request sent, not yet answered. Lives in the expansion now
            // rather than as a word on the row, matching the leaderboard's compact shape.
            const isPending = mode === 'friendlies' ? rallyPending : challengeState === 'pending';
            // An request THEY sent YOU, still unanswered — the row offers Accept/Decline instead
            // of Cancel. Previously this only existed in a separate list above the grid.
            const incomingReq = mode === 'friendlies'
              ? received.find((r) => r.status === 'open' && r.player_1_uid === p.user_id)
              : incoming.find((c) => c.player_1_uid === p.user_id);
            const respondToIncoming = (accept: boolean) => {
              if (!incomingReq) return;
              if (mode === 'friendlies') respondRally(incomingReq.id, accept);
              else respondChallenge(incomingReq.id, accept);
            };
            const cancelRequest = () => {
              if (mode === 'friendlies') {
                const r = sent.find((x) => x.player_2_uid === p.user_id);
                if (r) cancelRally(r.id);
                return;
              }
              const ch = challenges.find((c) =>
                c.status === 'open' &&
                ((c.player_1_uid === user.uid && c.player_2_uid === p.user_id) ||
                  (c.player_2_uid === user.uid && c.player_1_uid === p.user_id)));
              if (ch) cancelChallenge(ch.id);
            };
            return (
              <motion.div
                key={`${i}-${p.user_id}`}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
              >
              <PlayerCard
                id={p.user_id}
                name={toTitleCase(p.name)}
                nameHref={isConnected ? `/players/${p.user_id}` : undefined}
                subtitle={p.skill_level > 0 ? `Skill ${p.skill_level} · ${skillBand(p.skill_level)}` : undefined}
                open={expandedUid === p.user_id}
                onToggle={() => setExpandedUid((cur) => (cur === p.user_id ? null : p.user_id))}
                // Exactly four cells: the lifecycle/contact control, tags, P/G Won %, Rank Move.
                // P/G Played and Matches Won were volume figures that belong on the leaderboard.
                stats={[
                  {
                    // One cell for the whole request lifecycle, so the same spot always answers
                    // "what's happening with this person":
                    //   nothing sent → Rally / Challenge  ·  sent → Waiting to reply (+ Cancel)
                    //   accepted → Contact (+ Cancel)     ·  they asked us → Accept / Decline
                    label: '',
                    value: (
                      <div className="flex flex-col items-center gap-1">
                        {showContact ? (
                          <ContactOpponentButton
                            name={p.name}
                            phone={(mode === 'friendlies' ? rallyContactMap : contactMap)[p.user_id]?.phone}
                            email={(mode === 'friendlies' ? rallyContactMap : contactMap)[p.user_id]?.email}
                            whatsappContact={(mode === 'friendlies' ? rallyContactMap : contactMap)[p.user_id]?.whatsapp_contact}
                            whatsappSameAsPhone={(mode === 'friendlies' ? rallyContactMap : contactMap)[p.user_id]?.whatsapp_same_as_phone}
                            variant="white"
                            size="sm"
                          />
                        ) : incomingReq ? (
                          // Their request, awaiting your answer.
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => respondToIncoming(true)} className="p-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors" aria-label="Accept"><Check className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => respondToIncoming(false)} className="p-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors" aria-label="Decline"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : isPending ? (
                          <span className="text-[11px] font-bold text-fg">Waiting to reply</span>
                        ) : mode === 'friendlies' ? (
                          <button type="button" className={pillButtonCls('sm', 'clay')} disabled={busy === p.user_id} onClick={() => sendRally({ id: p.user_id, name: p.name })}>
                            <RacquetIcon className="w-3.5 h-3.5" />Rally
                          </button>
                        ) : (
                          <button type="button" className={`${pillButtonCls('sm', 'clay')} disabled:opacity-40`} disabled={challengeBlocked || busy === p.user_id} onClick={() => sendChallenge(p)}>
                            <RacquetIcon className="w-3.5 h-3.5" />Challenge
                          </button>
                        )}
                        {/* Cancel stays available once accepted too, not just while pending — but
                            never for an incoming request, where Decline is the right verb. */}
                        {!incomingReq && (showContact || isPending) && (
                          <button
                            type="button"
                            onClick={cancelRequest}
                            className="text-[10px] font-bold text-fg hover:text-red-400 transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ),
                  },
                  {
                    label: '',
                    value: (
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <NearbyPill show={isNearby(p)} />
                        <AvailabilityPills tags={availabilityByUid[p.user_id]} />
                      </div>
                    ),
                  },
                  { label: 'P/G Won %', value: pgWinPct(p) },
                  { label: 'Rank Move', value: <RankMove t={p.rankTrend} move={p.rankMove} /> },
                ]}
                actionClassName="w-auto"
                action={(
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {/* Once a friendly is accepted, Score takes the dice's slot — no room for both. */}
                    {!(mode === 'friendlies' && rallyAccepted) && (
                      <motion.button type="button" onClick={() => randomizeSlot(i)} disabled={!canRandomize} whileTap={canRandomize ? tapScale.whileTap : undefined} transition={tapScale.transition} title={canRandomize ? 'Randomize this slot' : 'No randomizes left this week'} className="p-2 rounded-xl bg-fg/5 text-fg/70 hover:text-fg transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0" aria-label="Randomize slot"><Dices className="w-4 h-4" /></motion.button>
                    )}
                    {isRandomized && !(mode === 'friendlies' && rallyAccepted) && (
                      <motion.button type="button" onClick={() => resetSlot(i)} whileTap={tapScale.whileTap} transition={tapScale.transition} title="Restore original player" className="p-2 rounded-xl bg-fg/5 text-fg/70 hover:text-fg transition-colors shrink-0" aria-label="Reset slot"><X className="w-4 h-4" /></motion.button>
                    )}
                    {/* Row actions are pills, not <Button>, so they match Profile's rows and the
                        Contact/Schedule pills they sit beside. Score is the same orange pill
                        everywhere in the app. */}
                    {mode === 'friendlies' ? (
                      rallyAccepted ? (
                        <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => openFriendlyScore(p)}>
                          <RacquetIcon className="w-3.5 h-3.5" />Score
                        </button>
                      ) : rallyPending ? null : (
                        <button type="button" className={pillButtonCls('sm', 'clay')} disabled={busy === p.user_id} onClick={() => sendRally({ id: p.user_id, name: p.name })}>
                          <RacquetIcon className="w-3.5 h-3.5" />Rally
                        </button>
                      )
                    ) : (
                      challengeAccepted ? (
                        <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => openChallengeScore(p)}>
                          <RacquetIcon className="w-3.5 h-3.5" />Score
                        </button>
                      ) : challengeState === 'pending' ? null : (
                        <button type="button" className={`${pillButtonCls('sm', 'clay')} disabled:opacity-40`} disabled={challengeBlocked || busy === p.user_id} onClick={() => sendChallenge(p)}>
                          <RacquetIcon className="w-3.5 h-3.5" />Challenge
                        </button>
                      )
                    )}
                  </div>
                </div>
                )}
              />
              </motion.div>
            );
          })}
        </div>
      )}

      {scoreForm && scoreTarget && (
        <ScoreModal
          matchInfo={{
            title: scoreTarget.kind === 'challenge' ? 'Challenge' : 'Friendly → Challenge',
            player1: { uid: user.uid, name: myName },
            player2: { uid: scoreTarget.uid, name: scoreTarget.name },
          }}
          scoreForm={scoreForm}
          onChange={setScoreForm}
          onClose={closeScore}
          onSubmit={scoreTarget.kind === 'challenge' ? handleChallengeScoreSubmit : handleFriendlyScoreSubmit}
        />
      )}
      </>
      )}

      <div className="flex justify-center mt-5">
        <Button
          size="sm"
          variant="white"
          onClick={() => setShowAvailabilityModal(true)}
        >
          {(profile?.preferences.availability_tags?.length ?? 0) > 0 ? 'Edit Availability' : 'Add Availability'}
        </Button>
      </div>

      {showCompleteProfile && (
        <CompleteProfileModal
          onClose={() => setShowCompleteProfile(false)}
          onDone={() => setShowCompleteProfile(false)}
        />
      )}

      {showAvailabilityModal && (
        <AvailabilityModal onClose={() => setShowAvailabilityModal(false)} />
      )}
    </div>
  );
};
