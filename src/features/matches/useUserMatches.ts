import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { TournamentMatch } from '../../pages/tournament/types';

// A user's completed matches, newest first, from their perspective (their games first).
// Shared by the History page's "My Matches", the Profile "Recent Matches" block, and the Home
// "Your Progress" chart.
// Single array-contains query on the shared `matches` collection, with category filter in JS
// so tournament, rally, and challenge rows load together without per-source queries.
// A completed match is a tournament match with status 'complete', OR a challenge/rally with
// status 'confirmed'. All three now carry the SAME result fields (winner_uid + absolute per-set
// games), so the only difference left between the branches is which status means "played".

export type UserMatch = {
  id: string;
  opponentId: string;
  opponentName: string;
  eventId: string;
  won: boolean;
  completedAt: number; // ms since epoch
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

// A match the user is in that hasn't been played/scored yet (status !== 'complete'). Also covers
// accepted rallies and accepted League Ladder challenges — neither has a real match
// doc until it's played, but both represent an "upcoming" game the same way a generated-but-
// unplayed tournament match does. `source` distinguishes them for display; `eventId` is only
// ever set for tournament matches.
export type UpcomingMatch = {
  id: string;
  opponentId: string;
  opponentName: string;
  opponentContact: string;
  eventId: string;
  source: 'tournament' | 'rally' | 'challenge';
  // Added for the Player Dash.
  category: MatchCategory;
  /** Tournament round ('RR', 'QF', …); '' for rallies and challenges. */
  round: string;
  rrGroupLabel: string;
  skillGroup: string;
  division: string;
  viewerIsP1: boolean;
  /** When a rally or challenge was accepted; '' for tournament fixtures. */
  respondedAt: string;
  /** The tournament match doc itself, for scoring from the dash. Absent for rallies and challenges. */
  tournamentMatch?: TournamentMatch;
};

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

type MatchCategory = 'singles' | 'doubles' | 'rally' | 'challenge';

/** Absolute [player_1, player_2] games for all three set slots; an unused set is 0-0. */
const absoluteSets = (d: Record<string, unknown>): [number, number][] => [
  [num(d.set_1_player_1), num(d.set_1_player_2)],
  [num(d.set_2_player_1), num(d.set_2_player_2)],
  [num(d.set_3_player_1), num(d.set_3_player_2)],
];

// Opponent slots that aren't a real, contactable person yet.
const PLACEHOLDER_NAMES = new Set(['bye', 'player loading', '']);
const isRealOpponent = (name: string) =>
  !PLACEHOLDER_NAMES.has(name.trim().toLowerCase()) && !name.toLowerCase().startsWith('winner of ');

const isTournamentMatch = (category?: string) => category === 'singles' || category === 'doubles';


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

        const list: UserMatch[] = [];
        const pending: UpcomingMatch[] = [];

        [...s1.docs, ...s2.docs].forEach((d) => {
          const raw = d.data();
          const category = raw.category as string | undefined;

          if (isTournamentMatch(category)) {
            const m = { id: d.id, ...raw } as TournamentMatch;
            const iAmP1First = m.player_1_uid === uid;
            // Upcoming = not yet completed / no score submitted, against a real opponent.
            if (m.status !== 'complete') {
              const oppName = (iAmP1First ? m.player_2_name : m.player_1_name) || '';
              if (isRealOpponent(oppName)) {
                pending.push({
                  id: m.id,
                  opponentId: (iAmP1First ? m.player_2_uid : m.player_1_uid) || '',
                  opponentName: oppName,
                  opponentContact: '',
                  eventId: m.event_id || '',
                  source: 'tournament',
                  category: category as MatchCategory,
                  round: m.round || '',
                  rrGroupLabel: m.rr_group_label || '',
                  skillGroup: m.skill_group || '',
                  division: m.division || '',
                  viewerIsP1: iAmP1First,
                  respondedAt: '',
                  tournamentMatch: m,
                });
              }
              return;
            }
            if (!m.winner_uid) return;
            const iAmP1 = m.player_1_uid === uid;
            const mySets = iAmP1
              ? [num(m.set_1_player_1), num(m.set_2_player_1), num(m.set_3_player_1)]
              : [num(m.set_1_player_2), num(m.set_2_player_2), num(m.set_3_player_2)];
            const oppSets = iAmP1
              ? [num(m.set_1_player_2), num(m.set_2_player_2), num(m.set_3_player_2)]
              : [num(m.set_1_player_1), num(m.set_2_player_1), num(m.set_3_player_1)];
            const parts = mySets
              .map((a, i) => [a, oppSets[i]] as [number, number])
              .filter(([a, b]) => a > 0 || b > 0);

            list.push({
              id: m.id,
              opponentId: (iAmP1 ? m.player_2_uid : m.player_1_uid) || '',
              opponentName: (iAmP1 ? m.player_2_name : m.player_1_name) || 'Opponent',
              eventId: m.event_id || '',
              won: m.winner_uid === uid,
              completedAt: m.completed_at ? Date.parse(m.completed_at) : 0,
              myGames: parts.reduce((s, [a]) => s + a, 0),
              oppGames: parts.reduce((s, [, b]) => s + b, 0),
              scoreLine: parts.map(([a, b]) => `${a}-${b}`).join(', '),
              category: category as MatchCategory,
              round: m.round || '',
              viewerIsP1: iAmP1,
              winnerUid: m.winner_uid,
              sets: absoluteSets(raw),
              walkover: !!m.walkover || parts.length === 0,
              tournamentMatch: m,
            });
            return;
          }

          // Challenges and rallies share one lifecycle: accepted = still to play, confirmed = a
          // played, points-paying result. Only 'accepted' used to be handled, so a CONFIRMED
          // challenge or rally appeared nowhere at all — not in upcoming, not in history.
          if (category === 'challenge' || category === 'rally') {
            const iAmP1 = raw.player_1_uid === uid;
            const opponentId = (iAmP1 ? raw.player_2_uid : raw.player_1_uid) || '';
            const opponentName = (iAmP1 ? raw.player_2_name : raw.player_1_name) || 'Opponent';

            if (raw.status === 'accepted') {
              pending.push({
                id: d.id,
                opponentId,
                opponentName,
                opponentContact: '',
                eventId: '',
                source: category === 'rally' ? 'rally' : 'challenge',
                category,
                round: '',
                rrGroupLabel: '',
                skillGroup: '',
                division: raw.division || '',
                viewerIsP1: iAmP1,
                respondedAt: raw.responded_at || '',
              });
              return;
            }

            if (raw.status !== 'confirmed' || !raw.winner_uid) return;
            // Sets are stored absolutely (player_1 first), exactly like a tournament match, so
            // this is the same viewer-relative flip the tournament branch does — no score-line
            // string to parse and no reporter's-viewpoint problem to correct for.
            const mySets = iAmP1
              ? [num(raw.set_1_player_1), num(raw.set_2_player_1), num(raw.set_3_player_1)]
              : [num(raw.set_1_player_2), num(raw.set_2_player_2), num(raw.set_3_player_2)];
            const oppSets = iAmP1
              ? [num(raw.set_1_player_2), num(raw.set_2_player_2), num(raw.set_3_player_2)]
              : [num(raw.set_1_player_1), num(raw.set_2_player_1), num(raw.set_3_player_1)];
            const pairs = mySets
              .map((a, i) => [a, oppSets[i]] as [number, number])
              .filter(([a, b]) => a > 0 || b > 0);

            list.push({
              id: d.id,
              opponentId,
              opponentName,
              eventId: raw.event_id || '',
              won: raw.winner_uid === uid,
              completedAt: Date.parse(raw.completed_at || raw.confirmed_at || raw.reported_at || '') || 0,
              myGames: pairs.reduce((s, [a]) => s + a, 0),
              oppGames: pairs.reduce((s, [, b]) => s + b, 0),
              scoreLine: pairs.map(([a, b]) => `${a}-${b}`).join(', '),
              category,
              round: '',
              viewerIsP1: iAmP1,
              winnerUid: raw.winner_uid,
              sets: absoluteSets(raw),
              walkover: pairs.length === 0,
            });
          }
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
  // walkover no matchesPlayed/wins/loses (resultDeltas, `played = !walkover`).
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
