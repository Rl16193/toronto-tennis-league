import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { Check, Dices, X } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay, tapScale } from '../lib/motion';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { SegmentedControl } from '../components/SegmentedControl';
import { RacquetIcon } from '../components/RacquetIcon';
import { ContactOpponentButton } from './tournament/ContactOpponentButton';
import { ScoreModal } from './tournament/ScoreModal';
import { ScoreForm } from './tournament/types';
import { DivTab, LeagueRow, inDivision, toTitleCase, useStandings } from '../features/leagues/useStandings';
import { Rally, cancelRally, createRally, respondRally, useRallies } from '../features/friendlies/rallyService';
import { fetchEvents } from '../features/events/services/eventService';
import { isLadderEvent } from '../utils/eventTypes';
import { TennisEvent } from '../types';
import { createChallenge, cancelChallenge, respondChallenge, reportChallenge, confirmChallenge, rejectChallenge, proposeConversion, confirmConversion, LadderChallenge, LadderDivision } from '../features/leagues/ladderService';
import { useLadder } from '../features/leagues/useLadder';
import { useCrossEventConflicts } from '../features/leagues/useCrossEventConflicts';
import { skillBand } from './tournament/utils';
import { Tournament } from './Tournament';
import { CompleteProfileModal } from '../features/profile/components/CompleteProfileModal';
import { AvailabilityModal } from '../features/profile/components/AvailabilityModal';
import { sharesCourt } from '../utils/courtOverlap';
import { NearbyPill } from '../components/NearbyPill';
import { AvailabilityPills } from '../components/AvailabilityPills';

type Mode = 'tournament' | 'friendlies' | 'challenges';

// The 3 things real matching needs — same rule used to gate Challenges/Friendlies behind the
// Complete Profile modal. Tournament mode is exempt; skill_level defaults to 2 at signup
// bootstrap (indistinguishable from a real choice), so the gate only checks league + courts —
// the modal still shows/collects skill level as part of the same flow.
const isReadyForMatches = (profile: { stats: { league: string }; preferences: { preferred_courts: string[] } } | null | undefined) =>
  !!profile && profile.stats.league !== '' && profile.preferences.preferred_courts.length > 0;

// ── Per-slot randomizer (shared by both tabs): 12 category slots, each with its own dice. A weekly
// budget of 2 slots may be put into "randomized" mode; re-rolls are then free. Originals are kept.
const RAND_SLOTS_PER_WEEK = 2;
const weekKey = () => {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
};
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

// Deterministic pseudo-random in [0,1) from a string seed — used to give the Friendlies pool a
// stable-for-the-week tiebreak among equally-active players (so the 12 shown can rotate weekly
// without jittering on every reload).
const seededRand = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967296;
};

// One "Matches" hub with Friendlies (non-competitive) and Challenges (competitive) tabs. Both
// tabs fill up to 12 slots with the SAME 3-tier waterfall (see `buildTieredPool` below):
//   Tier 1 — shares a preferred court with the viewer ("Nearby"), most active first.
//   Tier 2 — same skill band as the viewer (regardless of court), most active first.
//   Tier 3 — fallback fill: Friendlies sorts by activity; Challenges sorts by rank-proximity
//     (closest to the viewer's own rank first), preserving the old "6 above/6 below" feel as the
//     last-resort tiebreak instead of the only rule.
// The one real difference is the BASE POOL: Challenges stays locked to the viewer's own league
// (no cross-league challenges — points only make sense within one division); Friendlies is
// cross-league (Mens/Womens/Seniors/Doubles all pooled) since a casual hit doesn't care about
// league. The exact 12 can rotate week to week (see the randomizer below).
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
  const { sent, received, loading: ralliesLoading, activePartnerIds, acceptedPartnerIds: acceptedRallyPartnerIds, contactMap: rallyContactMap } = useRallies();
  const [busy, setBusy] = useState<string | null>(null);
  const [rand, setRand] = useState<RandState>({ slots: [], overrides: {} });
  const [courtsByUid, setCourtsByUid] = useState<Record<string, string[]>>({});

  // The single active league ladder (one per league).
  const [ladder, setLadder] = useState<TennisEvent | null>(null);
  const { challenges, myChallenges, incoming, contactMap, stateWith, acceptedPartnerIds: acceptedChallengePartnerIds, weeklyChallengesLeft } = useLadder(ladder?.id, user?.uid);
  const [challengeScoreForm, setChallengeScoreForm] = useState<ScoreForm | null>(null);
  const [challengeScoreOpponent, setChallengeScoreOpponent] = useState<{ uid: string; name: string } | null>(null);
  // Scoring an accepted Friendly is also how it gets converted to a Challenge — separate modal
  // state from the challenge one above since it creates a new challenge instead of updating one.
  const [friendlyScoreForm, setFriendlyScoreForm] = useState<ScoreForm | null>(null);
  const [friendlyScoreOpponent, setFriendlyScoreOpponent] = useState<{ uid: string; name: string } | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Anti double-farming: block challenging someone already faced in another still-active event.
  const conflicts = useCrossEventConflicts(user?.uid, ladder?.id);

  useEffect(() => { document.title = 'Matches — Racquets & Strings'; }, []);
  useEffect(() => { if (user?.uid) setRand(loadRandState(user.uid, mode)); }, [user?.uid, mode]);
  useEffect(() => {
    fetchEvents().then((all) => setLadder(all.filter((e) => isLadderEvent(e))[0] ?? null)).catch(() => {});
  }, []);
  // Everyone's preferred courts + availability tags — public preferences, read once for the
  // Friendlies court-overlap check and for showing each row's own availability pills.
  useEffect(() => {
    getDocs(collection(db, 'preferences')).then((snap) => {
      const courts: Record<string, string[]> = {};
      const availability: Record<string, string[]> = {};
      snap.docs.forEach((d) => {
        courts[d.id] = (d.data().preferred_courts as string[]) || [];
        availability[d.id] = (d.data().availability_tags as string[]) || [];
      });
      setCourtsByUid(courts);
      setAvailabilityByUid(availability);
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

  const myBand = skillBand(profile?.stats?.skill_level ?? 0);
  const myCourts = useMemo(() => new Set(profile?.preferences.preferred_courts ?? []), [profile?.preferences.preferred_courts]);
  const week = weekKey();
  const byActivity = (a: LeagueRow, b: LeagueRow) =>
    (b.matchesPlayed - a.matchesPlayed) || (seededRand(week + a.user_id) - seededRand(week + b.user_id));
  const sameBand = (r: LeagueRow) => skillBand(r.skill_level) === myBand;
  const isNearby = (r: LeagueRow) => sharesCourt(courtsByUid[r.user_id], myCourts);
  // Players within this many rank spots of the viewer count as "near rank" for Challenges — same
  // band the old "6 above/6 below" window drew from, just no longer capped at 6+6.
  const RANK_BAND = 35;
  const nearRank = (r: LeagueRow) => {
    if (myRankIdx < 0) return true; // unranked viewer — can't measure distance, don't exclude
    const idx = rankIndexByUid.get(r.user_id);
    return idx !== undefined && Math.abs(idx - myRankIdx) <= RANK_BAND;
  };
  const byRankProximity = (a: LeagueRow, b: LeagueRow) => {
    if (myRankIdx < 0) return byActivity(a, b);
    const ai = rankIndexByUid.get(a.user_id) ?? Infinity;
    const bi = rankIndexByUid.get(b.user_id) ?? Infinity;
    return Math.abs(ai - myRankIdx) - Math.abs(bi - myRankIdx) || byActivity(a, b);
  };

  // Generic tiered waterfall: fills from each tier in order (skipping anyone already placed by
  // an earlier tier), then dumps whoever's left, sorted by `fallbackSort`.
  const buildTieredPool = (
    pool: LeagueRow[],
    tiers: { filter: (r: LeagueRow) => boolean; sort: (a: LeagueRow, b: LeagueRow) => number }[],
    fallbackSort: (a: LeagueRow, b: LeagueRow) => number,
  ): LeagueRow[] => {
    const used = new Set<string>();
    const result: LeagueRow[] = [];
    for (const tier of tiers) {
      const matched = pool.filter((r) => !used.has(r.user_id) && tier.filter(r)).sort(tier.sort);
      matched.forEach((r) => used.add(r.user_id));
      result.push(...matched);
    }
    result.push(...pool.filter((r) => !used.has(r.user_id)).sort(fallbackSort));
    return result;
  };

  // Friendlies: Nearby first, then skill band, then most active.
  const friendliesExtended = useMemo(
    () => buildTieredPool(
      allLeaguesPool,
      [{ filter: isNearby, sort: byActivity }, { filter: sameBand, sort: byActivity }],
      byActivity,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allLeaguesPool, courtsByUid, myBand, myCourts, week],
  );
  const friendliesPool = useMemo(() => friendliesExtended.slice(0, 12), [friendliesExtended]);

  // Challenges: rank proximity first (always fills near-rank players before anything else), then
  // Nearby among whoever's left, then skill band as a last-resort fallback.
  const challengesExtended = useMemo(
    () => (user ? buildTieredPool(
      divisionRanked.filter((r) => r.user_id !== user.uid),
      [
        { filter: nearRank, sort: byRankProximity },
        { filter: isNearby, sort: byActivity },
        { filter: sameBand, sort: byActivity },
      ],
      byRankProximity,
    ) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [divisionRanked, user, courtsByUid, myBand, myCourts, myRankIdx],
  );
  const challengesPool = useMemo(() => challengesExtended.slice(0, 12), [challengesExtended]);

  const people = mode === 'challenges' ? challengesPool : friendliesPool;
  // Re-roll source: each tab keeps drawing from its own full tiered candidate list (not just the
  // initial top 12), so a re-roll still respects that tab's pool and tiering.
  const rerollSource = mode === 'challenges' ? challengesExtended : friendliesExtended;

  const rowById = useMemo(() => new Map(rows.map((r) => [r.user_id, r])), [rows]);
  const slots = useMemo(
    () => people.map((base, i) => (rand.overrides[i] && rowById.get(rand.overrides[i])) || base),
    [people, rand.overrides, rowById],
  );
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
  const openFriendlyScore = (opponent: { user_id: string; name: string }) => {
    setFriendlyScoreOpponent({ uid: opponent.user_id, name: opponent.name });
    setFriendlyScoreForm({
      matchDocId: '',
      winnerUserId: '',
      sets: [{ mine: '', opponent: '' }, { mine: '', opponent: '' }, { mine: '', opponent: '' }],
      court: '',
    });
  };

  const buildScoreLine = (sets: ScoreForm['sets']) =>
    sets
      .map((s) => ({ mine: Number(s.mine || 0), opponent: Number(s.opponent || 0) }))
      .filter((s) => s.mine > 0 || s.opponent > 0)
      .map((s) => `${s.mine}-${s.opponent}`)
      .join(', ');

  const handleFriendlyScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendlyScoreForm || !friendlyScoreOpponent || !friendlyScoreForm.winnerUserId || !ladder || !myDivision) return;
    const winnerName = friendlyScoreForm.winnerUserId === user.uid ? myName : friendlyScoreOpponent.name;
    await proposeConversion({
      eventId: ladder.id,
      division: myDivision as LadderDivision,
      source: 'friendly',
      sourceId: friendlyScoreOpponent.uid, // no single rally doc id to key off — the pairing is enough
      proposer: { id: user.uid, name: myName },
      other: { id: friendlyScoreOpponent.uid, name: friendlyScoreOpponent.name },
      winner: { id: friendlyScoreForm.winnerUserId, name: winnerName },
      scoreLine: buildScoreLine(friendlyScoreForm.sets),
      court: friendlyScoreForm.court.trim() || undefined,
    });
    setFriendlyScoreForm(null);
    setFriendlyScoreOpponent(null);
  };

  // The other player's side of a proposed conversion (Friendly or Tournament match → Challenge):
  // confirm the same reported score. Lands in 'reported', same as any challenge, awaiting the
  // organizer's normal confirm.
  const confirmConversionRequest = async (c: LadderChallenge) => {
    if (!c.claimed_winner_id || !c.claimed_winner_name) return;
    setConfirmingId(c.id);
    try {
      await confirmConversion(
        c.id,
        { id: user.uid, name: myName },
        { id: c.claimed_winner_id, name: c.claimed_winner_name },
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
      ((c.challenger_id === user.uid && c.opponent_id === opponent.user_id) ||
        (c.opponent_id === user.uid && c.challenger_id === opponent.user_id)));
    if (!ch) return;
    setChallengeScoreOpponent({ uid: opponent.user_id, name: opponent.name });
    setChallengeScoreForm({
      matchDocId: ch.id,
      winnerUserId: '',
      sets: [{ mine: '', opponent: '' }, { mine: '', opponent: '' }, { mine: '', opponent: '' }],
      court: '',
    });
  };

  const handleChallengeScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeScoreForm || !challengeScoreOpponent || !challengeScoreForm.winnerUserId) return;
    const parsedSets = challengeScoreForm.sets.map((s) => ({ mine: Number(s.mine || 0), opponent: Number(s.opponent || 0) }));
    if (parsedSets.some((s) => !Number.isInteger(s.mine) || !Number.isInteger(s.opponent) || s.mine < 0 || s.opponent < 0)) return;
    const scoreLine = parsedSets.filter((s) => s.mine > 0 || s.opponent > 0).map((s) => `${s.mine}-${s.opponent}`).join(', ');
    const winnerName = challengeScoreForm.winnerUserId === user.uid ? myName : challengeScoreOpponent.name;
    await reportChallenge(
      challengeScoreForm.matchDocId,
      { id: challengeScoreForm.winnerUserId, name: winnerName },
      scoreLine,
      user.uid,
      challengeScoreForm.court.trim() || undefined,
    );
    setChallengeScoreForm(null);
    setChallengeScoreOpponent(null);
  };

  // Only OPEN rallies show here — once accepted, the request row disappears from this panel and
  // a Contact button takes its place inline in the players list below.
  const openReceived = received.filter((r) => r.status === 'open');
  const openSent = sent.filter((r) => r.status === 'open');
  const reportedChallenges = challenges.filter((c) => c.status === 'reported');

  const RallyRow: React.FC<{ r: Rally; incoming?: boolean }> = ({ r, incoming: inc }) => (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg truncate">{inc ? toTitleCase(r.from_name) : toTitleCase(r.to_name)}</p>
        <p className="text-[11px] text-fg/40">{inc ? 'Wants to rally with you' : 'Waiting for their reply'}</p>
      </div>
      {inc ? (
        <div className="flex gap-1.5 shrink-0">
          <motion.button type="button" onClick={() => respondRally(r.id, true)} whileTap={tapScale.whileTap} transition={tapScale.transition} className="p-2.5 rounded-xl bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors" aria-label="Accept rally"><Check className="w-4 h-4" /></motion.button>
          <motion.button type="button" onClick={() => respondRally(r.id, false)} whileTap={tapScale.whileTap} transition={tapScale.transition} className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors" aria-label="Decline rally"><X className="w-4 h-4" /></motion.button>
        </div>
      ) : (
        <button type="button" onClick={() => cancelRally(r.id)} className="shrink-0 text-xs font-bold text-fg/40 hover:text-red-400 transition-colors">Cancel</button>
      )}
    </div>
  );

  return (
    <div className="max-w-xl mx-auto px-4 pb-20 pt-4">
      <div className="flex items-center gap-2 mb-4">
        <RacquetIcon className="w-6 h-6 text-clay" />
        <h1 className="text-2xl font-display font-bold text-fg">Matches</h1>
      </div>

      <SegmentedControl<Mode>
        options={[
          { value: 'tournament', label: 'Tournament' },
          { value: 'challenges', label: 'Challenges' },
          { value: 'friendlies', label: 'Friendlies' },
        ]}
        value={mode}
        onChange={setMode}
        className="mb-5"
      />

      <Button
        size="sm"
        variant="white"
        className="mb-4"
        onClick={() => setShowAvailabilityModal(true)}
      >
        {(profile?.preferences.availability_tags?.length ?? 0) > 0 ? 'Edit Availability' : 'Add Availability'}
      </Button>

      {mode === 'tournament' ? (
        <Tournament />
      ) : !isReadyForMatches(profile) ? (
        <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 py-12 px-6 text-center">
          <p className="text-sm text-fg/60 mb-4">
            Set your preferred courts, skill level, and league so we can match you with players.
          </p>
          <Button onClick={() => setShowCompleteProfile(true)}>Complete Profile</Button>
        </div>
      ) : (
      <>
      {/* Active / incoming items for the current mode */}
      {mode === 'friendlies'
        ? !ralliesLoading && (openReceived.length > 0 || openSent.length > 0) && (
          <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 overflow-hidden divide-y divide-white/5 mb-5">
            {openReceived.map((r) => <RallyRow key={r.id} r={r} incoming />)}
            {openSent.map((r) => <RallyRow key={r.id} r={r} />)}
          </div>
        )
        : (incoming.length > 0 || myChallenges.length > 0) && (
          <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 overflow-hidden divide-y divide-white/5 mb-5">
            {/* Only OPEN challenges show here — same as Friendlies rallies, once accepted the
                request row disappears and a Contact button takes its place in the players list. */}
            {incoming.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg truncate">{toTitleCase(c.challenger_name)}</p>
                  {c.source ? (
                    <p className="text-[11px] text-fg/40">
                      Wants your {c.source === 'friendly' ? 'Friendly' : 'Tournament match'} to count as a Challenge
                      {c.score_line ? ` · ${c.score_line}` : ''} · Winner: {toTitleCase(c.claimed_winner_name || '—')}
                    </p>
                  ) : (
                    <p className="text-[11px] text-fg/40">Challenged you</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {c.source ? (
                    <>
                      <button type="button" disabled={confirmingId === c.id} onClick={() => confirmConversionRequest(c)} className="p-2.5 rounded-xl bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50" aria-label="Confirm conversion"><Check className="w-4 h-4" /></button>
                      <button type="button" onClick={() => respondChallenge(c.id, false)} className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors" aria-label="Decline"><X className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => respondChallenge(c.id, true)} className="p-2.5 rounded-xl bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors" aria-label="Accept challenge"><Check className="w-4 h-4" /></button>
                      <button type="button" onClick={() => respondChallenge(c.id, false)} className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors" aria-label="Decline challenge"><X className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {myChallenges.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg truncate">{toTitleCase(c.opponent_name)}</p>
                  <p className="text-[11px] text-fg/40">Waiting for their reply</p>
                </div>
                <button type="button" onClick={() => cancelChallenge(c.id)} className="shrink-0 text-xs font-bold text-fg/40 hover:text-red-400 transition-colors">Cancel</button>
              </div>
            ))}
          </div>
        )}

      {mode === 'challenges' && !ladder && (
        <div className="rounded-2xl border border-fg/10 bg-fg/5 px-4 py-3 mb-4 text-sm text-fg/60">
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
                <p className="text-sm font-semibold text-fg truncate">{toTitleCase(c.challenger_name)} vs {toTitleCase(c.opponent_name)}</p>
                <p className="text-[11px] text-fg/40">
                  Winner: {toTitleCase(c.claimed_winner_name || '—')}{c.score_line ? ` · ${c.score_line}` : ''}{c.court ? ` · ${c.court}` : ''}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" onClick={() => confirmChallenge(c)} className="p-2.5 rounded-xl bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors" aria-label="Confirm result"><Check className="w-4 h-4" /></button>
                <button type="button" onClick={() => rejectChallenge(c.id)} className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors" aria-label="Reject result"><X className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] font-bold uppercase tracking-widest text-fg/40 mb-2">
        {budgetLeft} of {RAND_SLOTS_PER_WEEK} randomizes left this week
      </p>
      {mode === 'friendlies' && (
        <p className="text-[11px] text-fg/40 mb-2">Submit the Match Score to convert a Friendly to a Challenge.</p>
      )}

      {peopleLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}</div>
      ) : slots.length === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 py-12 text-center"><p className="text-sm text-fg/40">No players found.</p></div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 overflow-hidden divide-y divide-white/5">
          {slots.map((p, i) => {
            const isRandomized = rand.slots.includes(i);
            const canRandomize = isRandomized || budgetLeft > 0;
            const rallyAccepted = acceptedRallyPartnerIds.has(p.user_id);
            const rallyPending = !rallyAccepted && activePartnerIds.has(p.user_id);
            const challengeAccepted = acceptedChallengePartnerIds.has(p.user_id);
            const challengeState = ladder ? stateWith(p.user_id) : 'cooldown';
            const challengeBlocked = !ladder || !myDivision || challengeState !== 'available'
              || weeklyChallengesLeft === 0 || conflicts.has(p.user_id);
            // "Connected" is specific to the tab you're on — an accepted Challenge doesn't make
            // someone's name clickable on the Friendlies tab while their rally is still pending.
            const isConnected = mode === 'friendlies' ? rallyAccepted : challengeAccepted;
            const showScore = mode === 'friendlies' ? rallyAccepted : challengeAccepted;
            const showContact = showScore; // contact only once accepted, same gate as Score
            return (
              <motion.div
                key={`${i}-${p.user_id}`}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
                className="flex items-start justify-between gap-3 px-4 py-3.5"
              >
                {/* Left: name / skill+tier(+rank)+nearby / availability */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isConnected ? (
                      <Link to={`/players/${p.user_id}`} className="text-sm font-semibold text-fg truncate hover:text-clay transition-colors">
                        {toTitleCase(p.name)}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-fg truncate">{toTitleCase(p.name)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.skill_level > 0 && (
                      <span className="text-[11px] text-fg/70">
                        Skill {p.skill_level} · {skillBand(p.skill_level)}
                        {mode === 'challenges' && ` · #${(rankIndexByUid.get(p.user_id) ?? -1) + 1}`}
                      </span>
                    )}
                    <NearbyPill show={isNearby(p)} />
                  </div>
                  <AvailabilityPills tags={availabilityByUid[p.user_id]} />
                </div>

                {/* Right: schedule/score/challenge/rally/randomize / contact */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {/* Once a friendly is accepted, Score takes the dice's slot — no room for both. */}
                    {!(mode === 'friendlies' && rallyAccepted) && (
                      <motion.button type="button" onClick={() => randomizeSlot(i)} disabled={!canRandomize} whileTap={canRandomize ? tapScale.whileTap : undefined} transition={tapScale.transition} title={canRandomize ? 'Randomize this slot' : 'No randomizes left this week'} className="p-2 rounded-xl bg-fg/5 text-fg/60 hover:text-fg transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0" aria-label="Randomize slot"><Dices className="w-4 h-4" /></motion.button>
                    )}
                    {isRandomized && !(mode === 'friendlies' && rallyAccepted) && (
                      <motion.button type="button" onClick={() => resetSlot(i)} whileTap={tapScale.whileTap} transition={tapScale.transition} title="Restore original player" className="p-2 rounded-xl bg-fg/5 text-fg/40 hover:text-fg transition-colors shrink-0" aria-label="Reset slot"><X className="w-4 h-4" /></motion.button>
                    )}
                    {mode === 'friendlies' ? (
                      rallyAccepted ? (
                        <Button size="sm" variant="white" onClick={() => openFriendlyScore(p)}>
                          <RacquetIcon className="w-3.5 h-3.5 mr-1.5" />Score
                        </Button>
                      ) : rallyPending ? (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-fg/30">Pending</span>
                      ) : (
                        <Button size="sm" variant="white" onClick={() => sendRally({ id: p.user_id, name: p.name })} isLoading={busy === p.user_id}>
                          <RacquetIcon className="w-3.5 h-3.5 mr-1.5" />Rally
                        </Button>
                      )
                    ) : (
                      challengeAccepted ? (
                        <Button size="sm" variant="white" onClick={() => openChallengeScore(p)}>
                          <RacquetIcon className="w-3.5 h-3.5 mr-1.5" />Score
                        </Button>
                      ) : challengeState === 'pending' ? (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-fg/30">Pending</span>
                      ) : (
                        <Button size="sm" variant="clay" onClick={() => sendChallenge(p)} isLoading={busy === p.user_id} disabled={challengeBlocked}>
                          <RacquetIcon className="w-3.5 h-3.5 mr-1.5" />Challenge
                        </Button>
                      )
                    )}
                  </div>
                  {showContact && (
                    <ContactOpponentButton
                      name={p.name}
                      phone={(mode === 'friendlies' ? rallyContactMap : contactMap)[p.user_id]?.phone}
                      email={(mode === 'friendlies' ? rallyContactMap : contactMap)[p.user_id]?.email}
                      whatsappContact={(mode === 'friendlies' ? rallyContactMap : contactMap)[p.user_id]?.whatsapp_contact}
                      whatsappSameAsPhone={(mode === 'friendlies' ? rallyContactMap : contactMap)[p.user_id]?.whatsapp_same_as_phone}
                      size="sm"
                    />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {challengeScoreForm && challengeScoreOpponent && (
        <ScoreModal
          matchInfo={{
            title: 'Challenge',
            player1: { uid: user.uid, name: myName },
            player2: challengeScoreOpponent,
          }}
          scoreForm={challengeScoreForm}
          onChange={setChallengeScoreForm}
          onClose={() => { setChallengeScoreForm(null); setChallengeScoreOpponent(null); }}
          onSubmit={handleChallengeScoreSubmit}
        />
      )}

      {friendlyScoreForm && friendlyScoreOpponent && (
        <ScoreModal
          matchInfo={{
            title: 'Friendly → Challenge',
            player1: { uid: user.uid, name: myName },
            player2: friendlyScoreOpponent,
          }}
          scoreForm={friendlyScoreForm}
          onChange={setFriendlyScoreForm}
          onClose={() => { setFriendlyScoreForm(null); setFriendlyScoreOpponent(null); }}
          onSubmit={handleFriendlyScoreSubmit}
        />
      )}
      </>
      )}

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
