import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchEvents } from '../events/services/eventService';
import { isLadderEvent } from '../../utils/eventTypes';
import { TennisEvent } from '../../types';
import { DivTab, inDivision } from './useStandings';
import { LadderDivision, createChallenge } from './ladderService';
import { useCrossEventConflicts } from './useCrossEventConflicts';
import { useLadder } from './useLadder';

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
) => !!profile && profile.stats.league !== '' && profile.preferences.preferred_courts.length > 0;

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
  const { stateWith, activeChallengesLeft } = useLadder(ladder?.id, user?.uid);
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
    if (conflicts.has(opponent.user_id)) return 'conflict';
    const state = stateWith(opponent.user_id);
    if (state === 'pending') return 'pending';
    if (state === 'cooldown') return 'cooldown';
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

  return { ladder, myDivision, ready, blockReason, challenge, activeChallengesLeft };
}
