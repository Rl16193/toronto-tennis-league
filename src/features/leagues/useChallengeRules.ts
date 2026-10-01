import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchEvents } from '../events/services/eventService';
import { isLadderEvent } from '../../utils/eventTypes';
import { TennisEvent } from '../../types';
import { DivTab, inDivision } from './useStandings';
import { LADDER_COOLDOWN_DAYS, LadderDivision, createChallenge } from './ladderService';
import { useLadder } from './useLadder';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { fetchResultsFor } from '../matches/results';
import { toMillis } from '../../utils/eventDates';

/**
 * The one place that decides whether you may challenge someone. Previously this logic lived
 * inline in Matches.tsx; the Leaderboard needs the identical rules, so it moved here rather
 * than being duplicated.
 *
 * Note on "hasn't set their skill": there is no such state to detect. Every account is
 * bootstrapped with `skill_level: 2`, so a player who never touched it is indistinguishable
 * from one who deliberately picked 2.0. The readiness gate is therefore league + preferred
 * courts, the same pair `isReadyForMatches` has always used on the Matches page.
 */
export const isReadyForMatches = (
  profile: { stats: { league: string }; preferences: { preferred_courts: string[] } } | null | undefined,
) => !!profile && profile.stats.league !== '' && (profile.preferences.preferred_courts?.length ?? 0) > 0;

export type ChallengeBlockReason =
  | null                 // go ahead
  | 'self'               // that's you
  | 'not-ready'          // no league and/or no preferred courts set
  | 'no-ladder'          // no active ladder event right now
  | 'other-division'     // they play in a different league
  | 'unsupported'        // doubles / Retired Pro — the ladder has no such division
  | 'pending'            // a challenge between you two is already open
  | 'cooldown'           // played them too recently
  | 'active-limit'       // already have 3 sent challenges open/accepted
  | 'conflict';          // already drawn against them in another live event

export const CHALLENGE_BLOCK_LABEL: Record<Exclude<ChallengeBlockReason, null>, string> = {
  self: 'This is you',
  'not-ready': 'Set your league and preferred courts to challenge',
  'no-ladder': 'No active ladder right now',
  'other-division': 'Different league',
  unsupported: 'Challenges run in singles only',
  pending: 'Challenge already open',
  cooldown: 'Played recently',
  'active-limit': 'You can only have 3 open or accepted challenges at once. Finish or wait on one to send another.',
  conflict: 'Already drawn against them',
};

/** The active league ladder event, if there is one. */
export function useActiveLadder() {
  const [ladder, setLadder] = useState<TennisEvent | null>(null);
  useEffect(() => {
    fetchEvents()
      .then((all) => setLadder(all.filter((e) => isLadderEvent(e))[0] ?? null))
      .catch(() => { /* no ladder — challenging is simply unavailable */ });
  }, []);
  return ladder;
}

export function useChallengeRules() {
  const { user, profile } = useAuth();
  const ladder = useActiveLadder();
  const ladderState = useLadder(ladder?.id, user?.uid);
  const { stateWith, activeChallengesLeft } = ladderState;
  const conflicts = useCrossEventConflicts(user?.uid, ladder?.id);

  const myDivision: DivTab | null = useMemo(() => {
    const league = profile?.stats?.league || '';
    if (inDivision(league, 'mens')) return 'mens';
    if (inDivision(league, 'womens')) return 'womens';
    return null;
  }, [profile?.stats?.league]);

  const ready = isReadyForMatches(profile);

  /**
   * Why this player can't be challenged, or null if they can.
   * `supported` is false for surfaces the ladder has no division for (doubles, Retired Pro).
   */
  const blockReason = (
    opponent: { user_id: string; league: string },
    opts: { supported?: boolean } = {},
  ): ChallengeBlockReason => {
    if (!user || opponent.user_id === user.uid) return 'self';
    if (opts.supported === false) return 'unsupported';
    if (!ready || !myDivision) return 'not-ready';
    if (!ladder) return 'no-ladder';
    if (!inDivision(opponent.league, myDivision)) return 'other-division';
    if (conflicts.unplayed.has(opponent.user_id)) return 'conflict';
    const state = stateWith(opponent.user_id);
    if (state === 'pending') return 'pending';
    // A tournament match you have already played counts towards the rematch cooldown, the same
    // way a played ladder challenge does.
    if (state === 'cooldown' || conflicts.recentlyPlayed.has(opponent.user_id)) return 'cooldown';
    if (activeChallengesLeft === 0) return 'active-limit';
    return null;
  };

  const challenge = async (opponent: { user_id: string; name: string }) => {
    if (!user || !ladder || !myDivision) return;
    await createChallenge({
      eventId: ladder.id,
      division: myDivision as LadderDivision,
      challenger: { id: user.uid, name: profile?.user.name || '' },
      opponent: { id: opponent.user_id, name: opponent.name },
    });
  };

  // `ladderState` is the ladder listener itself, so a page needing the challenge lists mounts it once.
  return { ladder, myDivision, ready, blockReason, challenge, activeChallengesLeft, ladderState };
}

// ─── Cross-event conflicts ─────────────────────────────────────────────────────────────────────

/**
 * Anti double-farming, for tournament fixtures the two of you have **not played yet**.
 *
 * The risk this guards against is one physical match being reported for points twice — once as the
 * tournament fixture, once as a ladder challenge. That is only possible while the fixture is still
 * unplayed, so only unplayed fixtures block (`unplayed`). Once the fixture has a result — a
 * recorded score or a walkover — there is nothing left to double-report, and the pair fall back to
 * the ordinary rematch cooldown, counted from that match rather than from a ladder challenge
 * (`recentlyPlayed`). An unplayed fixture in an event whose Final has been played blocks nothing
 * either; that event is over.
 */
type CrossEventConflicts = {
  /** A tournament fixture against these is still to be played — challenging them is blocked. */
  unplayed: Set<string>;
  /** Played one within LADDER_COOLDOWN_DAYS — same cooldown a ladder challenge would give. */
  recentlyPlayed: Set<string>;
};

const NO_CONFLICTS: CrossEventConflicts = { unplayed: new Set(), recentlyPlayed: new Set() };

export function useCrossEventConflicts(uid: string | undefined, ladderEventId: string | undefined): CrossEventConflicts {
  const [opponents, setOpponents] = useState<CrossEventConflicts>(NO_CONFLICTS);

  useEffect(() => {
    if (!uid) { setOpponents(NO_CONFLICTS); return; }
    let alive = true;

    (async () => {
      // My tournament matches (either slot). Two separate equality queries on the shared
      // matches collection, merged client-side and filtered by category.
      const [s1, s2] = await Promise.all([
        getDocs(query(collection(db, 'matches'), where('player_1_uid', '==', uid))),
        getDocs(query(collection(db, 'matches'), where('player_2_uid', '==', uid))),
      ]);
      const snap = { docs: [...s1.docs, ...s2.docs].filter((d) => d.data().category === 'tournament') };
      // When each played fixture was first scored lives on its result entry.
      const results = await fetchResultsFor(snap.docs.filter((d) => d.data().status === 'complete').map((d) => d.id));

      // Unplayed fixtures, event_id → opponent uids. Played ones go to `playedAt` instead: a
      // walkover counts as played (it has a winner and pays points), so the test is a complete
      // match with a winner, not `isPlayedResult`.
      const perEvent = new Map<string, Set<string>>();
      const playedAt = new Map<string, number>();
      snap.docs.forEach((d) => {
        const m = d.data();
        if (!m.event_id || m.event_id === ladderEventId) return; // different event only
        const opp = m.player_1_uid === uid ? m.player_2_uid : m.player_1_uid;
        if (!opp) return; // BYE / unfilled slot
        if (m.status === 'complete' && m.winner_uid) {
          const when = toMillis(results.get(d.id)?.completed_at);
          playedAt.set(opp, Math.max(playedAt.get(opp) ?? 0, when));
          return;
        }
        if (!perEvent.has(m.event_id)) perEvent.set(m.event_id, new Set());
        perEvent.get(m.event_id)!.add(opp);
      });

      // Someone with both a played and an unplayed fixture against me still has one to come.
      const cutoff = Date.now() - LADDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      const recentlyPlayed = new Set(
        [...playedAt.entries()].filter(([, when]) => when > cutoff).map(([opp]) => opp),
      );
      if (perEvent.size === 0) { if (alive) setOpponents({ unplayed: new Set(), recentlyPlayed }); return; }

      // An event is completed once its Final ('F') is played with a winner. Same query shape the
      // Tournament page already uses (event_id `in` …), so no new index; Final check is client-side.
      const eids = [...perEvent.keys()];
      const completed = new Set<string>();
      for (let i = 0; i < eids.length; i += 10) {
        const chunk = eids.slice(i, i + 10);
        const finalSnap = await getDocs(query(collection(db, 'matches'), where('event_id', 'in', chunk), where('round', '==', 'F'), where('status', '==', 'complete')));
        finalSnap.docs.forEach((d) => {
          const m = d.data();
          if (m.winner_uid) completed.add(m.event_id as string);
        });
      }

      // Unplayed fixtures in events that are NOT yet completed = active conflicts.
      const active = new Set<string>();
      perEvent.forEach((opps, eid) => { if (!completed.has(eid)) opps.forEach((o) => active.add(o)); });
      if (alive) setOpponents({ unplayed: active, recentlyPlayed });
    })().catch(() => { if (alive) setOpponents(NO_CONFLICTS); });

    return () => { alive = false; };
  }, [uid, ladderEventId]);

  return opponents;
}
