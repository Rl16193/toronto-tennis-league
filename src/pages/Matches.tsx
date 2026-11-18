import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { skillBand } from '../utils/skillLevels';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { Check, Dices, Handshake, Plus, Swords, X, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay, tapScale } from '../lib/motion';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Button, buttonCls } from '../components/Button';
import { Fab } from '../components/Fab';
import { SegmentedControl } from '../components/SegmentedControl';
import { useUserMatches } from '../features/matches/useUserMatches';
import { RacquetIcon } from '../components/RacquetIcon';
import { ContactOpponentButton } from '../components/ContactOpponentButton';
import { PlayerCard, RankMove } from '../components/PlayerCard';
import { ScoreModal } from '../features/matches/ScoreModal';
import { ScoreForm } from './tournament/types';
import { abbreviatePlayerName } from './tournament/utils';
import { LeagueRow, byLeagueRank, inDivision, pgWinPct, useStandings } from '../features/leagues/useStandings';
import { cancelRally, createRally, respondRally, useRallies } from '../features/rallies/rallyService';
import { cancelChallenge, respondChallenge, LadderDivision } from '../features/leagues/ladderService';
import { useRequestScoring } from '../features/matches/useRequestScoring';
import { recordScore, resultFromForm } from '../features/matches/scoring';
import { isReadyForMatches, useChallengeRules } from '../features/leagues/useChallengeRules';
import { isOrganizerProfile } from '../utils/eventTypes';
import { toMillis } from '../utils/eventDates';
import { resolveStorageUrl, type DisplayEvent } from '../features/events/services/eventService';
import {
  type Mode, type RandState, POOL_SIZE, RAND_SLOTS_PER_WEEK, TAG_LABEL, byActivity as activityOrder, loadOpened, loadRandState,
  mixPool, refreshPool, rerollSlot, resetSlot as resetSlotState, saveOpened, saveRandState, weekKey,
} from '../features/matches/opponentPool';

// Lazy: the tournament subsystem (useTournament.ts alone is ~2k lines, plus the draw engine and
// ~20 components) is the bulk of this route's bundle. It loads on every tab now, because it draws
// the tournament cards in the shared card row; until it arrives the row shows only these cards.
const Tournament = lazyWithRetry(() => import('./Tournament').then((m) => ({ default: m.Tournament })), 'Tournament');
import { CompleteProfileModal } from '../features/profile/components/CompleteProfileModal';
import { AvailabilityModal } from '../features/profile/components/AvailabilityModal';
import { sharesCourt } from '../components/NearbyPill';
import { AvailabilityPills } from '../components/AvailabilityPills';

const RALLIES_IMAGE = '/matches/Rallies.webp';
// Members away from Toronto: left out of the Challenges and Rallies lists. See CLAUDE.md.
const AWAY_UIDS = new Set(['HN9QV7zrmic5xbaSAf02h9Qqwsl2']); // Wan Eizzul
const MODE_CARDS:{ value: 'challenges' | 'rallies'; label: string; Icon: LucideIcon }[] = [
  { value: 'challenges', label: 'Challenges', Icon: Swords },
  { value: 'rallies', label: 'Rallies', Icon: Handshake },
];

// `isReadyForMatches` now lives in features/leagues/useChallengeRules so the Leaderboard's
// Challenge button gates on exactly the same rule (see the import above).

// One "Matches" hub: Rallies (non-competitive) and Challenges (competitive) tabs. The opponent
// pool (weekly cycle, pills, refresh, randomizer) is features/matches/opponentPool.ts.

// RallyRow was removed with the separate open-requests list — a rally's state now lives in
// the player's own row (see the stats cell below).

export const Matches: React.FC = () => {
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  // `friendlies` is the tab's old name, still in links sent before the rename.
  const initialMode = searchParams.get('mode') === 'friendlies' ? 'rallies' : searchParams.get('mode');
  const [mode, setMode] = useState<Mode>(
    initialMode === 'challenges' || initialMode === 'rallies' ? initialMode : 'tournament',
  );
  const [showCompleteProfile, setShowCompleteProfile] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availabilityByUid, setAvailabilityByUid] = useState<Record<string, string[]>>({});
  const { rows, loading: peopleLoading } = useStandings();
  const { sent, received, activePartnerIds, acceptedPartnerIds: acceptedRallyPartnerIds, rallyWith, contactMap: rallyContactMap } = useRallies();
  const [busy, setBusy] = useState<string | null>(null);
  const [rand, setRand] = useState<RandState>({ slots: [], overrides: {} });
  const [courtsByUid, setCourtsByUid] = useState<Record<string, string[]>>({});
  const [joinedAtByUid, setJoinedAtByUid] = useState<Record<string, number>>({});
  const [zoneByUid, setZoneByUid] = useState<Record<string, string>>({});
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  // The active ladder, the viewer's division and every "may I challenge them?" rule come from
  // useChallengeRules, the same hook the Leaderboard uses.
  const { ladder, myDivision, blockReason, challenge, ladderState } = useChallengeRules();
  const { challenges, myChallenges, incoming, contactMap, stateWith, acceptedPartnerIds: acceptedChallengePartnerIds } = ladderState;

  // "New Players Available" on a tab card: this week's refresh not opened yet, or a request
  // received since that tab was last opened. Opening the tab clears it.
  const [, setOpenedTick] = useState(0);
  const openRequestIds = useMemo(() => ({
    rallies: received.filter((r) => r.status === 'open').map((r) => r.id),
    challenges: incoming.map((c) => c.id),
  }), [received, incoming]);
  useEffect(() => {
    if (!user || mode === 'tournament') return;
    saveOpened(user.uid, mode, { cycle: weekKey(), requestIds: openRequestIds[mode] });
    setOpenedTick((t) => t + 1);
  }, [user, mode, openRequestIds]);
  const hasNew = (m: 'rallies' | 'challenges') => {
    if (!user) return false;
    const opened = loadOpened(user.uid, m);
    if (!opened || opened.cycle !== weekKey()) return true;
    return openRequestIds[m].some((id) => !opened.requestIds.includes(id));
  };
  // The Challenges card wears the league ladder's own picture. fetchEvents moves a gs:// path out
  // of `image` into `imagePath`, so read both and resolve the path.
  const [ladderImage, setLadderImage] = useState('');
  const ladderImageSrc = ladder?.image || (ladder as DisplayEvent | null)?.imagePath || '';
  useEffect(() => {
    if (!ladderImageSrc) { setLadderImage(''); return; }
    resolveStorageUrl(ladderImageSrc).then(setLadderImage).catch(() => setLadderImage(''));
  }, [ladderImageSrc]);

  // Same square card as the tournament cards beside them.
  const modeCards = MODE_CARDS.map(({ value, label, Icon }) => {
    const active = mode === value;
    const fresh = !active && hasNew(value);
    const image = value === 'challenges' ? ladderImage : RALLIES_IMAGE;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setMode(value)}
        aria-pressed={active}
        className={`relative w-full aspect-square rounded-2xl overflow-hidden text-left bg-fg/5
                    transition-[opacity,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2
                    focus-visible:outline-clay ${active ? 'ring-2 ring-clay' : 'opacity-90 hover:opacity-100'}`}
      >
        {image ? (
          // object-top crops the Rallies picture's own title off; the card's label names it.
          <img src={image} alt="" loading="lazy" decoding="async" className={`absolute inset-0 w-full h-full object-cover ${value === 'rallies' ? 'object-top' : 'object-center'}`} />
        ) : (
          <Icon className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 ${active ? 'text-clay' : 'text-fg/70'}`} />
        )}
        <span className={`absolute inset-x-0 bottom-0 p-2.5 ${image ? 'bg-gradient-to-t from-tennis-dark via-tennis-dark/75 to-transparent' : ''}`}>
          <span className="block text-sm font-bold text-clay truncate">{label}</span>
          {fresh && <span className="block text-xs font-semibold text-fg/70 leading-tight">New Players Available</span>}
        </span>
      </button>
    );
  });
  // Completed matches, for the Re-Match filter's "who have I already played" list.
  const { matches } = useUserMatches(user?.uid);

  // Organizer-only: record a match two OTHER members already played, as a challenge or a rally.
  // Two steps — pick the pair, then the same ScoreModal every other result goes through. It is
  // written complete, so the pair never see an invitation and the points land on write.
  const [recordStep, setRecordStep] = useState<'closed' | 'players' | 'score'>('closed');
  const [recordKind, setRecordKind] = useState<'challenge' | 'rally'>('challenge');
  const [recordPair, setRecordPair] = useState<LeagueRow[]>([]);
  const [recordSearch, setRecordSearch] = useState('');
  const [recordForm, setRecordForm] = useState<ScoreForm | null>(null);
  const [recordMsg, setRecordMsg] = useState<string | null>(null);
  const closeRecord = () => {
    setRecordStep('closed'); setRecordPair([]); setRecordSearch('');
    setRecordForm(null); setRecordMsg(null);
  };

  useEffect(() => { document.title = 'Matches · Racquets & Strings'; }, []);
  useEffect(() => { if (user?.uid) setRand(loadRandState(user.uid, mode)); }, [user?.uid, mode]);
  // Signup date per member, for the "New" filter. `created_at` lives on `users`, which this page
  // didn't otherwise read.
  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) => {
      const joined: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const ms = toMillis(d.data().created_at);
        if (ms > 0) joined[d.id] = ms;
      });
      setJoinedAtByUid(joined);
    }).catch(() => { /* New falls back to activity ordering */ });
  }, []);
  // Everyone's preferred courts + availability tags — public preferences, read once for the
  // Rallies court-overlap check and for showing each row's own availability pills.
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
  // One score sheet for both tabs, shared with the Player Dash (features/matches/useRequestScoring).
  const scoring = useRequestScoring(user ? { uid: user.uid, name: myName } : null);

  // Challenges base pool: same league as the viewer only (no cross-league challenges), sorted
  // best-rank-first — also doubles as the rank lookup for the "#12" shown next to skill.
  const divisionRanked = useMemo(
    () => [...rows.filter((r) => !myDivision || inDivision(r.league, myDivision))]
      .sort(byLeagueRank),
    [rows, myDivision],
  );

  // Rallies base pool: everyone, every league — casual play doesn't care about division.
  const allLeaguesPool = useMemo(
    () => rows.filter((r) => r.user_id && r.user_id !== user?.uid && r.name && !AWAY_UIDS.has(r.user_id)),
    [rows, user?.uid],
  );

  const myCourts = useMemo(() => new Set(profile?.preferences.preferred_courts ?? []), [profile?.preferences.preferred_courts]);
  const week = weekKey();

  // Most recent completed match against each opponent — drives the Re-Match pill.
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
  const byActivity = useMemo(() => activityOrder(week), [week]);
  // Nearby: shares one of your preferred courts.
  const isNearby = useCallback(
    (r: LeagueRow) => sharesCourt(courtsByUid[r.user_id], myCourts),
    [courtsByUid, myCourts],
  );

  // The tab's whole candidate list, mixed, with each person's pills (mixPool).
  const mixFor = useCallback(
    (pool: LeagueRow[]) => mixPool(pool, { isNearby, lastPlayedByUid, joinedAtByUid, byActivity }),
    [isNearby, lastPlayedByUid, joinedAtByUid, byActivity],
  );

  const ralliesMix = useMemo(() => mixFor(allLeaguesPool), [mixFor, allLeaguesPool]);
  const ralliesExtended = ralliesMix.list;
  // "Requested" = a rally you've ever sent them, any status — that's what exempts them from the
  // weekly refresh below.
  const ralliesRequestedIds = useMemo(() => new Set(sent.map((r) => r.player_2_uid)), [sent]);
  const ralliesPool = useMemo(
    () => (user ? refreshPool(user.uid, 'rallies', ralliesExtended, ralliesRequestedIds) : ralliesExtended.slice(0, POOL_SIZE)),
    [user, ralliesExtended, ralliesRequestedIds, week],
  );

  // Challenges uses the same mix, just over the viewer's own league.
  const challengesMix = useMemo(
    // Away members filtered here, not in divisionRanked: that list is also the "#12" rank lookup.
    () => mixFor(user ? divisionRanked.filter((r) => r.user_id !== user.uid && !AWAY_UIDS.has(r.user_id)) : []),
    [divisionRanked, user, mixFor],
  );
  const challengesExtended = challengesMix.list;
  // "Requested" = a challenge you've ever sent them, any status.
  const challengesRequestedIds = useMemo(
    () => new Set(challenges.filter((c) => c.player_1_uid === user?.uid).map((c) => c.player_2_uid)),
    [challenges, user?.uid],
  );
  const challengesPool = useMemo(
    () => (user ? refreshPool(user.uid, 'challenges', challengesExtended, challengesRequestedIds) : challengesExtended.slice(0, POOL_SIZE)),
    [user, challengesExtended, challengesRequestedIds, week],
  );

  const people = mode === 'challenges' ? challengesPool : ralliesPool;
  const tagsByUid = mode === 'challenges' ? challengesMix.tags : ralliesMix.tags;
  // Re-roll source: each tab keeps drawing from its own full tiered candidate list (not just the
  // initial top 12), so a re-roll still respects that tab's pool and tiering.
  const rerollSource = mode === 'challenges' ? challengesExtended : ralliesExtended;

  const rowById = useMemo(() => new Map(rows.map((r) => [r.user_id, r])), [rows]);

  /**
   * Everyone the viewer has a LIVE match with on the current tab — open or accepted. These used
   * to live in their own list above the player grid; that list is gone and the state now shows
   * inside the person's own row.
   *
   * It must cover every non-terminal state, not just `open`. The row is the only place Score
   * exists, so un-pinning at `accepted` made an agreed match unscoreable the moment it was
   * agreed — the person simply vanished unless they happened to sit in the current filter's ten.
   * Pinned until the result is recorded or the request is declined or cancelled.
   */
  const liveMatchUids = useMemo(() => {
    const ids = new Set<string>();
    if (mode === 'rallies') {
      // rallyWith is already keyed by opponent and already excludes finished rallies.
      Object.keys(rallyWith).forEach((id) => ids.add(id));
    } else {
      // player_1 is the challenger, player_2 the person challenged — so the "other" person
      // depends on which list it came from. Both lists are `open` only; accepted challenges come
      // from acceptedChallengePartnerIds.
      incoming.forEach((c) => ids.add(c.player_1_uid));
      myChallenges.forEach((c) => ids.add(c.player_2_uid));
      acceptedChallengePartnerIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [mode, rallyWith, incoming, myChallenges, acceptedChallengePartnerIds]);

  /**
   * The rendered list. Each entry carries the POOL SLOT it occupies, because the two indexes are
   * not the same: pinned rows are prepended, so screen position `i` is pool slot `i - pinned`.
   * `rand.overrides` is keyed by pool slot, and passing the screen index to randomizeSlot rerolled
   * a row further down the page instead of the one whose dice was pressed.
   * `slot: -1` marks a pinned row — it owns no pool slot and can't be rerolled, which is the point
   * of pinning it.
   */
  const slots = useMemo(() => {
    const base = people.map((p, i) => ({
      row: (rand.overrides[i] && rowById.get(rand.overrides[i])) || p,
      slot: i,
    }));
    // Pinned to the top and exempt from the cap: a live match must never be unreachable just
    // because the person didn't happen to land in the current filter's ten.
    const shown = new Set(base.map((b) => b.row.user_id));
    const pinned = [...liveMatchUids]
      .filter((id) => !shown.has(id))
      .map((id) => rowById.get(id))
      .filter((r): r is LeagueRow => !!r)
      .map((row) => ({ row, slot: -1 }));
    return [...pinned, ...base];
  }, [people, rand.overrides, rowById, liveMatchUids]);
  const budgetLeft = RAND_SLOTS_PER_WEEK - rand.slots.length;

  if (!user) return null; // private route

  const setSlots = (next: RandState | null) => { if (next) { setRand(next); saveRandState(user.uid, mode, next); } };
  const randomizeSlot = (i: number) =>
    setSlots(rerollSlot(rand, i, rerollSource, new Set(slots.map((s) => s.row.user_id)), activePartnerIds));
  const resetSlot = (i: number) => setSlots(resetSlotState(rand, i));

  // ── Actions ──
  const sendRally = async (to: { id: string; name: string; league: string; skill_level: number }) => {
    setBusy(to.id);
    try { await createRally({ id: user.uid, name: myName, league: profile?.stats.league, skill_level: profile?.stats.skill_level }, to); } finally { setBusy(null); }
  };
  const sendChallenge = async (to: LeagueRow) => {
    setBusy(to.user_id);
    try { await challenge(to); } finally { setBusy(null); }
  };

  // Same score sheet for both tabs — a rally records against its rally doc, a challenge against
  // its challenge doc. Both pay the moment they are written; the Cloud Function on that
  // transition is what moves leaguePoints, since no client may write it.
  const openRallyScore = (opponent: { user_id: string; name: string }) => {
    // The score is reported against the rally doc itself, so it needs the real id.
    const rally = rallyWith[opponent.user_id];
    if (!rally) return;
    scoring.open({
      kind: 'rally', docId: rally.id,
      opponent: { uid: opponent.user_id, name: opponent.name },
      viewerIsP1: rally.player_1_uid === user.uid,
    });
  };

  // Score entry for an accepted challenge — same ScoreModal the tournament bracket uses.
  const openChallengeScore = (opponent: { user_id: string; name: string }) => {
    const ch = challenges.find((c) =>
      c.status === 'accepted' &&
      ((c.player_1_uid === user.uid && c.player_2_uid === opponent.user_id) ||
        (c.player_2_uid === user.uid && c.player_1_uid === opponent.user_id)));
    if (!ch) return;
    scoring.open({
      kind: 'challenge', docId: ch.id,
      opponent: { uid: opponent.user_id, name: opponent.name },
      viewerIsP1: ch.player_1_uid === user.uid,
    });
  };

  // Organizer: recording a match two other members played. Settling disputes moved to the
  // Organizer Dash (/profile?dash=organizer), which is now the only place they are listed.
  const isOrganizer = isOrganizerProfile(profile);

  const recordCandidates = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    const chosen = new Set(recordPair.map((r) => r.user_id));
    return rows
      .filter((r) => !chosen.has(r.user_id) && (!q || r.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [rows, recordSearch, recordPair]);

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const [p1, p2] = recordPair;
    if (!recordForm || !p1 || !p2) return;
    // The organizer is neither player, so the modal's "mine" side IS player 1.
    const players = {
      player_1_uid: p1.user_id, player_1_name: p1.name,
      player_2_uid: p2.user_id, player_2_name: p2.name,
    };
    try {
      if (recordKind === 'rally') {
        await recordScore({ newMatch: { category: 'rally', ...players } }, resultFromForm(recordForm, true));
      } else {
        if (!ladder) { setRecordMsg('There is no active league ladder to record a challenge in.'); return; }
        // Division follows the players, not the organizer — an organizer records for either league.
        const division: LadderDivision | null = inDivision(p1.league, 'mens') ? 'mens'
          : inDivision(p1.league, 'womens') ? 'womens' : null;
        if (!division) { setRecordMsg(`${abbreviatePlayerName(p1.name)} has no league set, so this can’t be a challenge.`); return; }
        await recordScore({ newMatch: { category: 'challenge', event_id: ladder.id, division, ...players } }, resultFromForm(recordForm, true));
      }
    } catch (err) {
      setRecordMsg(err instanceof Error ? err.message : 'Could not record that match.');
      return;
    }
    closeRecord();
  };

  return (
    <div className="max-w-xl mx-auto px-4 pb-20 pt-4">
      <h1 className="sr-only">Matches</h1>

      {/* One card row: your tournaments (drawn by Tournament, which owns that list), then these. */}
      <React.Suspense fallback={<div className="grid grid-cols-3 gap-3 mb-4">{modeCards}</div>}>
        <Tournament showDraw={mode === 'tournament'} extraCards={modeCards} onPickEvent={() => setMode('tournament')} />
      </React.Suspense>

      {mode === 'tournament' ? null : !isReadyForMatches(profile) ? (
        <div className="rounded-2xl bg-fg/5 py-12 px-6 text-center">
          <p className="text-sm text-fg/70 mb-4">
            Set your preferred courts, skill level, and league so we can match you with players.
          </p>
          <Button onClick={() => setShowCompleteProfile(true)}>Complete Profile</Button>
        </div>
      ) : (
      <>
      {/* The old "open requests" lists that sat here are gone. A request now shows inside that
          person's own row (Accept/Decline, or Cancel), and liveMatchUids pins them into the list
          until the match is finished, so neither a request nor a score can be hidden by the
          current filter. */}

      {mode === 'challenges' && !ladder && (
        <div className="rounded-2xl bg-fg/5 px-4 py-3 mb-4 text-sm text-fg/70">
          No active league ladder right now.
        </div>
      )}

      {mode === 'rallies' && (
        <p className="text-xs text-fg/70 mb-2">Submit the score to record a rally match, both players get points.</p>
      )}

      {peopleLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-fg/5 rounded-2xl animate-pulse" />)}</div>
      ) : slots.length === 0 ? (
        <div className="rounded-2xl bg-fg/5 py-12 text-center">
          <p className="text-sm text-fg">No players found.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-fg/5 overflow-hidden divide-y divide-white/5">
          {/* `i` is the SCREEN position — only for the React key and the stagger delay. Every
              piece of slot logic below uses `slot`, the pool index. */}
          {slots.map(({ row: p, slot }, i) => {
            const isRandomized = slot >= 0 && rand.slots.includes(slot);
            const canRandomize = slot >= 0 && (isRandomized || budgetLeft > 0);
            // `rallyAccepted` gates contact and the name link. Scoring uses the same gate: an
            // accepted rally takes a score, and recording it is what finishes the rally — there
            // is no reported-then-confirmed middle state any more.
            const rallyAccepted = acceptedRallyPartnerIds.has(p.user_id);
            const myRally = mode === 'rallies' ? rallyWith[p.user_id] : undefined;
            const rallyScorable = myRally?.status === 'accepted';
            const rallyPending = !rallyAccepted && activePartnerIds.has(p.user_id);
            const challengeAccepted = acceptedChallengePartnerIds.has(p.user_id);
            const challengeState = ladder ? stateWith(p.user_id) : 'cooldown';
            const challengeBlocked = blockReason(p) !== null;
            // "Connected" is specific to the tab you're on — an accepted Challenge doesn't make
            // someone's name clickable on the Rallies tab while their rally is still pending.
            const isConnected = mode === 'rallies' ? rallyAccepted : challengeAccepted;
            const showScore = mode === 'rallies' ? rallyScorable : challengeAccepted;
            const showContact = showScore; // contact only once accepted, same gate as Score
            // "Waiting to reply" — request sent, not yet answered. Lives in the expansion now
            // rather than as a word on the row, matching the leaderboard's compact shape.
            const isPending = mode === 'rallies' ? rallyPending : challengeState === 'pending';
            // An request THEY sent YOU, still unanswered — the row offers Accept/Decline instead
            // of Cancel. Previously this only existed in a separate list above the grid.
            const incomingReq = mode === 'rallies'
              ? received.find((r) => r.status === 'open' && r.player_1_uid === p.user_id)
              : incoming.find((c) => c.player_1_uid === p.user_id);
            const respondToIncoming = (accept: boolean) => {
              if (!incomingReq) return;
              if (mode === 'rallies') respondRally(incomingReq.id, accept);
              else respondChallenge(incomingReq.id, accept);
            };
            // Contact sits beside Score once the request is accepted.
            const contacts = (mode === 'rallies' ? rallyContactMap : contactMap)[p.user_id];
            const contactButton = showContact ? (
              <ContactOpponentButton
                name={p.name}
                phone={contacts?.phone}
                email={contacts?.email}
                whatsappContact={contacts?.whatsapp_contact}
                preferred={contacts?.preferred_mode_of_contact}
                size="sm"
              />
            ) : null;
            const cancelRequest = () => {
              if (mode === 'rallies') {
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
                name={abbreviatePlayerName(p.name)}
                nameHref={isConnected ? `/players/${p.user_id}` : undefined}
                subtitle={p.skill_level > 0 ? `Skill ${p.skill_level} · ${skillBand(p.skill_level)}` : undefined}
                // Why they're on the list.
                pills={(tagsByUid.get(p.user_id) ?? []).length > 0 ? (tagsByUid.get(p.user_id) ?? []).map((t) => (
                  <span key={t} className="shrink-0 rounded-full bg-fg/5 text-fg text-xs font-bold px-2 py-0.5">{TAG_LABEL[t]}</span>
                )) : undefined}
                open={expandedUid === p.user_id}
                onToggle={() => setExpandedUid((cur) => (cur === p.user_id ? null : p.user_id))}
                // Exactly four cells: zone (+ request status), availability, P/G Won %, Rank Move.
                // P/G Played and Matches Won were volume figures that belong on the leaderboard.
                stats={[
                  {
                    // The player's zone. Rally / Challenge and Contact live on the row itself; this
                    // cell only adds why a request is waiting, and Cancel.
                    label: 'Zone',
                    value: (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-bold text-fg">{zoneByUid[p.user_id] || 'Unassigned'}</span>
                        {incomingReq ? (
                          <span className="text-xs text-fg/70">
                            {mode === 'rallies' ? 'Wants to rally' : 'Challenged you'}
                          </span>
                        ) : isPending ? (
                          <span className="text-xs text-fg/70">Waiting to reply</span>
                        ) : null}
                        {/* Cancel stays available once accepted too, not just while pending — but
                            never for an incoming request, where Decline is the right verb. */}
                        {!incomingReq && (showContact || isPending) && (
                          <button
                            type="button"
                            onClick={cancelRequest}
                            className="text-xs font-bold text-fg hover:text-badge-loss transition-colors"
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
                    {/* Once a rally is accepted, Score takes the dice's slot — no room for both. */}
                    {/* No dice on a pinned row (slot < 0): it's there because you have a live
                        match with them, so rerolling it away is exactly what pinning prevents. */}
                    {slot >= 0 && !(mode === 'rallies' && rallyScorable) && (
                      <motion.button type="button" onClick={() => randomizeSlot(slot)} disabled={!canRandomize} whileTap={canRandomize ? tapScale.whileTap : undefined} transition={tapScale.transition} title={canRandomize ? 'Randomize this slot' : 'No randomizes left this week'} className="p-2 rounded-2xl bg-fg/5 text-fg/70 hover:text-fg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0" aria-label="Randomize slot"><Dices className="w-4 h-4" /></motion.button>
                    )}
                    {isRandomized && !(mode === 'rallies' && rallyScorable) && (
                      <motion.button type="button" onClick={() => resetSlot(slot)} whileTap={tapScale.whileTap} transition={tapScale.transition} title="Restore original player" className="p-2 rounded-2xl bg-fg/5 text-fg/70 hover:text-fg transition-colors shrink-0" aria-label="Reset slot"><X className="w-4 h-4" /></motion.button>
                    )}
                    {/* Row actions are pills, not <Button>, so they match Profile's rows and the
                        Contact/Schedule pills they sit beside. Score is the same orange pill
                        everywhere in the app. */}
                    {/* An unanswered request they sent YOU answers on the row itself. It used to
                        live only in the expanded stats cell, so the one thing that actually needs
                        a decision was the one thing you had to tap to find. */}
                    {incomingReq ? (
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => respondToIncoming(true)} title="Accept" className="p-1.5 rounded-2xl bg-green-500/15 text-badge-win hover:bg-green-500/25 transition-colors" aria-label="Accept"><Check className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => respondToIncoming(false)} title="Decline" className="p-1.5 rounded-2xl bg-red-500/15 text-badge-loss hover:bg-red-500/25 transition-colors" aria-label="Decline"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : mode === 'rallies' ? (
                      rallyScorable ? (
                        // Recording the score IS the result now — it pays on write, with no
                        // second-party confirm. The opponent may record it too; the narrower
                        // score wins and a different winner raises a dispute.
                        <div className="flex items-center gap-1.5">
                          {contactButton}
                          <button type="button" className={buttonCls('clay', 'sm')} onClick={() => openRallyScore(p)}>
                            <RacquetIcon className="w-3.5 h-3.5" />Score
                          </button>
                        </div>
                      ) : rallyPending ? null : (
                        <button type="button" className={buttonCls('clay', 'sm')} disabled={busy === p.user_id} onClick={() => sendRally({ id: p.user_id, name: p.name, league: p.league, skill_level: p.skill_level })}>
                          <RacquetIcon className="w-3.5 h-3.5" />Rally
                        </button>
                      )
                    ) : (
                      challengeAccepted ? (
                        <div className="flex items-center gap-1.5">
                          {contactButton}
                          <button type="button" className={buttonCls('clay', 'sm')} onClick={() => openChallengeScore(p)}>
                            <RacquetIcon className="w-3.5 h-3.5" />Score
                          </button>
                        </div>
                      ) : challengeState === 'pending' ? null : (
                        <button type="button" className={buttonCls('clay', 'sm')} disabled={challengeBlocked || busy === p.user_id} onClick={() => sendChallenge(p)}>
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

      {scoring.modalProps && <ScoreModal {...scoring.modalProps} />}
      </>
      )}

      {mode !== 'tournament' && isReadyForMatches(profile) && (
        <p className="mt-5 text-center text-xs font-bold uppercase tracking-widest text-fg/70">
          {budgetLeft} of {RAND_SLOTS_PER_WEEK} randomizes left this week
        </p>
      )}
      <div className="flex justify-center mt-3">
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

      {/* Organizer: record a match two members already played. Same floating + button as Events,
          Marketplace and Services, and only on the two tabs it can write to — the Tournament tab
          records its results through the draw. */}
      {isOrganizer && mode !== 'tournament' && recordStep === 'closed' && (
        <Fab
          ariaLabel="Record a played match"
          onClick={() => { setRecordKind(mode === 'rallies' ? 'rally' : 'challenge'); setRecordStep('players'); }}
        >
          <Plus className="w-6 h-6" />
        </Fab>
      )}

      {/* Portalled above the bottom nav: Layout's animated <main> traps z-index, so z-50 here sat under it. */}
      {recordStep === 'players' && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Record a played match">
          <div className="w-full max-w-sm rounded-2xl bg-tennis-surface p-5 max-h-[85dvh] overflow-y-auto overscroll-contain">
            <h2 className="text-lg font-bold text-fg mb-1">Record a played match</h2>
            <p className="text-xs text-fg/70 mb-4">
              It counts straight away. Neither player is asked to confirm it.
            </p>

            <SegmentedControl<'challenge' | 'rally'>
              options={[{ value: 'challenge', label: 'Challenge' }, { value: 'rally', label: 'Rally' }]}
              value={recordKind}
              onChange={setRecordKind}
            />

            <div className="mt-4 space-y-1.5">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-2 min-h-11">
                  <span className="text-xs font-semibold text-fg/70 w-16 shrink-0">Player {i + 1}</span>
                  {recordPair[i] ? (
                    <>
                      <span className="text-sm font-semibold text-fg truncate flex-1">{abbreviatePlayerName(recordPair[i].name)}</span>
                      <button
                        type="button"
                        onClick={() => setRecordPair(recordPair.filter((_, j) => j !== i))}
                        className="text-xs font-bold text-fg hover:text-badge-loss transition-colors"
                      >Change</button>
                    </>
                  ) : (
                    <span className="text-sm text-fg/70 flex-1">Not chosen yet</span>
                  )}
                </div>
              ))}
            </div>

            {recordPair.length < 2 && (
              <>
                <input
                  type="text"
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  placeholder="Search members"
                  aria-label="Search members"
                  className="mt-4 w-full h-11 rounded-2xl bg-fg/5 px-4 text-sm text-fg placeholder:text-fg/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                />
                <div className="mt-2 divide-y divide-fg/5">
                  {recordCandidates.map((r) => (
                    <button
                      key={r.user_id}
                      type="button"
                      onClick={() => { setRecordPair([...recordPair, r]); setRecordSearch(''); }}
                      className="w-full min-h-11 flex items-center justify-between gap-2 px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                    >
                      <span className="text-sm font-semibold text-fg truncate">{abbreviatePlayerName(r.name)}</span>
                      <span className="text-xs text-fg/70 shrink-0">{r.league || '—'}</span>
                    </button>
                  ))}
                  {recordCandidates.length === 0 && (
                    <p className="py-3 text-sm text-fg/70">Nobody matches that name.</p>
                  )}
                </div>
              </>
            )}

            {recordMsg && <p role="alert" className="mt-4 text-sm text-badge-loss">{recordMsg}</p>}

            <div className="mt-5 flex gap-2.5">
              <Button
                className="flex-1"
                disabled={recordPair.length < 2}
                onClick={() => {
                  setRecordMsg(null);
                  setRecordForm({
                    matchDocId: '',
                    winnerUserId: '',
                    sets: [{ mine: '', opponent: '' }, { mine: '', opponent: '' }, { mine: '', opponent: '' }],
                    court: '',
                  });
                  setRecordStep('score');
                }}
              >Next</Button>
              <Button variant="outline" className="flex-1" onClick={closeRecord}>Cancel</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {recordStep === 'score' && recordForm && recordPair.length === 2 && (
        <ScoreModal
          matchInfo={{
            title: recordKind === 'challenge' ? 'Record Challenge' : 'Record Rally',
            player1: { uid: recordPair[0].user_id, name: recordPair[0].name },
            player2: { uid: recordPair[1].user_id, name: recordPair[1].name },
          }}
          scoreForm={recordForm}
          onChange={(f) => { setRecordMsg(null); setRecordForm(f); }}
          onClose={closeRecord}
          onSubmit={handleRecordSubmit}
          // Labels the two sides with the real names instead of "My score" / "Opponent" — the
          // organizer is neither player.
          isCreatorSubmit
          error={recordMsg}
        />
      )}
    </div>
  );
};
