import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where, type Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { TournamentMatch } from '../../pages/tournament/types';
import { fetchResultsFor, isWalkover } from './results';
import { toMillis } from '../../utils/eventDates';

// A user's completed matches, newest first, from their perspective (their games first).
// Shared by the History page's "My Matches", the Player Dash and a member's public profile.
// Two equality queries on the shared `matches` collection, category handled in JS, so tournament,
// rally and challenge rows load together. A played match of any kind is status 'complete'; its
// score, walkover and completed_at come from its applied `submissions` entry (results.ts).

export type MatchCategory = 'tournament' | 'challenge' | 'rally';

export type UserMatch = {
  id: string;
  opponentId: string;
  opponentName: string;
  eventId: string;
  won: boolean;
  completedAt: number; // ms since epoch, the result's first scoring
  myGames: number;
  oppGames: number;
  scoreLine: string; // e.g. "6-4, 6-3" (user's games first)
  // Added for the Player Dash's head to head and score edits.
  category: MatchCategory;
  /** Tournament round ('RR', 'QF', …); '' for rallies and challenges. */
  round: string;
  viewerIsP1: boolean;
  winnerUid: string;
  /** Absolute [player_1, player_2] games for all three set slots; an unused set is 0-0. */
  sets: [number, number][];
  walkover: boolean;
  /** The tournament match doc itself, for corrections. Absent for rallies and challenges. */
  tournamentMatch?: TournamentMatch;
};

// A match the user is in that hasn't been played yet: an unplayed tournament fixture against a
// real opponent, or an accepted rally or challenge. `eventId` is only set for tournament matches.
export type UpcomingMatch = {
  id: string;
  opponentId: string;
  opponentName: string;
  opponentContact: string;
  eventId: string;
  source: MatchCategory;
  // Added for the Player Dash.
  category: MatchCategory;
  /** Tournament round ('RR', 'QF', …); '' for rallies and challenges. */
  round: string;
  /** The RR group name; '' otherwise. */
  rrGroupLabel: string;
  skillGroup: string;
  division: string;
  viewerIsP1: boolean;
  /** When a rally or challenge was accepted; null for tournament fixtures. */
  respondedAt: Timestamp | null;
  /** The tournament match doc itself, for scoring from the dash. Absent for rallies and challenges. */
  tournamentMatch?: TournamentMatch;
};

// Opponent slots that aren't a real, contactable person yet.
const PLACEHOLDER_NAMES = new Set(['bye', 'player loading', '']);
const isRealOpponent = (name: string) =>
  !PLACEHOLDER_NAMES.has(name.trim().toLowerCase()) && !name.toLowerCase().startsWith('winner of ');

export function useUserMatches(uid?: string): {
  matches: UserMatch[]; upcoming: UpcomingMatch[]; loading: boolean; reload: () => void;
} {
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumped by reload(): a one-time fetch otherwise never sees a score filed or a match cancelled.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    // Clear BOTH lists on sign-out — leaving `upcoming` populated kept the previous user's
    // opponent names and contact strings on screen until the next remount.
    if (!uid) { setMatches([]); setUpcoming([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [s1, s2] = await Promise.all([
          getDocs(query(collection(db, 'matches'), where('player_1_uid', '==', uid))),
          getDocs(query(collection(db, 'matches'), where('player_2_uid', '==', uid))),
        ]);
        const docs = [...s1.docs, ...s2.docs].filter((d) => ['tournament', 'challenge', 'rally'].includes(d.data().category));
        const results = await fetchResultsFor(docs.filter((d) => d.data().status === 'complete').map((d) => d.id));

        const list: UserMatch[] = [];
        const pending: UpcomingMatch[] = [];

        docs.forEach((d) => {
          const raw = d.data();
          const category = raw.category as MatchCategory;
          const tournament = category === 'tournament';
          const iAmP1 = raw.player_1_uid === uid;
          const opponentId: string = (iAmP1 ? raw.player_2_uid : raw.player_1_uid) || '';
          const opponentName: string = (iAmP1 ? raw.player_2_name : raw.player_1_name) || '';
          const tournamentMatch = tournament ? ({ id: d.id, ...raw } as TournamentMatch) : undefined;

          if (raw.status !== 'complete') {
            // A tournament fixture waits for a real opponent; a rally or challenge for acceptance.
            if (tournament ? !isRealOpponent(opponentName) : raw.status !== 'accepted') return;
            pending.push({
              id: d.id,
              opponentId,
              opponentName: opponentName || 'Opponent',
              opponentContact: '',
              eventId: tournament ? raw.event_id || '' : '',
              source: category,
              category,
              round: raw.round || '',
              rrGroupLabel: tournament && raw.format === 'rr' ? raw.group_label || '' : '',
              skillGroup: raw.skill_group || '',
              division: raw.division || '',
              viewerIsP1: iAmP1,
              respondedAt: tournament ? null : raw.responded_at ?? null,
              tournamentMatch,
            });
            return;
          }

          const result = results.get(d.id);
          if (!raw.winner_uid || !result) return;
          // Sets are stored absolutely (player_1 first), so flip them to the viewer's side.
          const sets: [number, number][] = [
            [result.set_1_player_1 ?? 0, result.set_1_player_2 ?? 0],
            [result.set_2_player_1 ?? 0, result.set_2_player_2 ?? 0],
            [result.set_3_player_1 ?? 0, result.set_3_player_2 ?? 0],
          ];
          const pairs = sets
            .map(([a, b]) => (iAmP1 ? [a, b] : [b, a]) as [number, number])
            .filter(([a, b]) => a > 0 || b > 0);

          list.push({
            id: d.id,
            opponentId,
            opponentName: opponentName || 'Opponent',
            eventId: raw.event_id || '',
            won: raw.winner_uid === uid,
            completedAt: toMillis(result.completed_at),
            myGames: pairs.reduce((s, [a]) => s + a, 0),
            oppGames: pairs.reduce((s, [, b]) => s + b, 0),
            scoreLine: pairs.map(([a, b]) => `${a}-${b}`).join(', '),
            category,
            round: raw.round || '',
            viewerIsP1: iAmP1,
            winnerUid: raw.winner_uid,
            sets,
            walkover: isWalkover(result) || pairs.length === 0,
            tournamentMatch,
          });
        });

        list.sort((a, b) => b.completedAt - a.completedAt);
        if (!cancelled) { setMatches(list); setUpcoming(pending); setLoading(false); }
      } catch (err) {
        console.error('Failed to load user matches:', err);
        if (!cancelled) { setMatches([]); setUpcoming([]); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [uid, reloadKey]);

  return { matches, upcoming, loading, reload };
}

/**
 * A player's current streak ("3W") and points/games won %, from their played matches (newest
 * first, as useUserMatches returns them) and their stats doc. The Player Dash and a member's
 * public profile both show these, so they come from here and can't disagree.
 */
export const playerRecord = (
  all: Pick<UserMatch, 'won' | 'myGames' | 'oppGames' | 'walkover'>[],
  stats?: { pointswon?: number; totalPointsPlayed?: number } | null,
) => {
  // A walkover is nobody's win or loss — no match was played. Filtered HERE rather than at the
  // call sites so a new caller can't reintroduce it. `stats` already agrees: scoring.js pays a
  // walkover no matchesPlayed/wins (resultDeltas, `played = !walkover`).
  const matches = all.filter((m) => !m.walkover);
  let streak: string | null = null;
  if (matches.length) {
    const first = matches[0].won;
    let n = 0;
    for (const m of matches) { if (m.won !== first) break; n += 1; }
    streak = `${n}${first ? 'W' : 'L'}`;
  }
  // The stored points pair, with a games fallback for members whose points were never populated.
  const played = stats?.totalPointsPlayed ?? 0;
  const mine = matches.reduce((n, m) => n + m.myGames, 0);
  const theirs = matches.reduce((n, m) => n + m.oppGames, 0);
  const pgWon = played > 0
    ? Math.round(((stats?.pointswon ?? 0) / played) * 100)
    : mine + theirs > 0 ? Math.round((mine / (mine + theirs)) * 100) : null;
  return { streak, pgWon };
};
