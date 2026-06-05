import { doc, increment, updateDoc, writeBatch } from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import { ScoreSubmission, SkillGroup, TournamentMatch } from './types';

import { getDrawKey } from './utils';

/**
 * Commits a score to Firestore in two isolated steps:
 *   1. Match result (always committed — user-visible on failure).
 *   2. Player stats increments (best-effort — failure never rolls back the score).
 *
 * Winner advancement into the next match is attempted after both writes, also best-effort.
 */
export async function updateMatchWithSubmission(
  match: TournamentMatch,
  submission: ScoreSubmission,
  matches: TournamentMatch[],
  db: Firestore,
  setMessage: (m: { type: 'success' | 'error'; text: string } | null) => void,
): Promise<void> {
  // ── Step 1: commit the match result ──────────────────────────────────────
  await updateDoc(doc(db, 'tournament_matches', match.id), {
    winner_name: submission.claimed_winner_name,
    winner_user_id: submission.claimed_winner_user_id,
    set_1_player_1: submission.set_1_player_1, set_1_player_2: submission.set_1_player_2,
    set_2_player_1: submission.set_2_player_1, set_2_player_2: submission.set_2_player_2,
    set_3_player_1: submission.set_3_player_1, set_3_player_2: submission.set_3_player_2,
    status: 'complete',
    completed_at: new Date().toISOString(),
  });

  // ── Step 2: update player stats (best-effort, separate from the result) ───
  try {
    const isLL = match.bracket === 'reserves';
    const LOSER_PTS: Record<string, number> = isLL
      ? { R32: 0.5, R16: 1, QF: 1.5, SF: 2.5, F: 5 }
      : { R32: 1, R16: 2, QF: 3, SF: 5, F: 10 };
    const loserPts = LOSER_PTS[match.round] ?? (isLL ? 0.5 : 1);
    const winnerPts = isLL ? 10 : 20;
    const isFinal = match.round === 'F';
    const matchLeague = match.tournament_choice === 'Doubles' ? 'Doubles' : match.division;
    const winnerUid = submission.claimed_winner_user_id;
    const loserUid = winnerUid === match.player_1_user_id ? match.player_2_user_id : match.player_1_user_id;
    const newP1G = (submission.set_1_player_1 ?? 0) + (submission.set_2_player_1 ?? 0) + (submission.set_3_player_1 ?? 0);
    const newP2G = (submission.set_1_player_2 ?? 0) + (submission.set_2_player_2 ?? 0) + (submission.set_3_player_2 ?? 0);
    const newTotal = newP1G + newP2G;
    const winnerIsP1 = winnerUid === match.player_1_user_id;

    const statsBatch = writeBatch(db);

    if (match.status !== 'complete') {
      if (winnerUid) {
        statsBatch.set(doc(db, 'stats', winnerUid), {
          matchesPlayed: increment(1),
          wins: increment(1),
          league: matchLeague,
          pointswon: increment(winnerIsP1 ? newP1G : newP2G),
          totalPointsPlayed: increment(newTotal),
          ...(isFinal ? { leaguePoints26: increment(winnerPts), tournamentsPlayed: increment(1) } : {}),
        }, { merge: true });
      }
      if (loserUid) {
        statsBatch.set(doc(db, 'stats', loserUid), {
          matchesPlayed: increment(1),
          loses: increment(1),
          leaguePoints26: increment(loserPts),
          tournamentsPlayed: increment(1),
          league: matchLeague,
          pointswon: increment(winnerIsP1 ? newP2G : newP1G),
          totalPointsPlayed: increment(newTotal),
        }, { merge: true });
      }
    } else {
      const oldWinnerUid = match.winner_user_id ?? '';
      const oldP1G = (match.set_1_player_1 ?? 0) + (match.set_2_player_1 ?? 0) + (match.set_3_player_1 ?? 0);
      const oldP2G = (match.set_1_player_2 ?? 0) + (match.set_2_player_2 ?? 0) + (match.set_3_player_2 ?? 0);
      const oldTotal = oldP1G + oldP2G;

      const applyPlayerDelta = (uid: string, isP1: boolean) => {
        if (!uid) return;
        const wasWinner = oldWinnerUid === uid;
        const isWinner = winnerUid === uid;
        const oldGames = isP1 ? oldP1G : oldP2G;
        const newGames = isP1 ? newP1G : newP2G;
        const delta: Record<string, unknown> = {};
        if (isWinner !== wasWinner) {
          delta.wins = increment(isWinner ? 1 : -1);
          delta.loses = increment(isWinner ? -1 : 1);
        }
        const oldPts = wasWinner ? (isFinal ? winnerPts : 0) : loserPts;
        const newPts = isWinner ? (isFinal ? winnerPts : 0) : loserPts;
        if (newPts !== oldPts) delta.leaguePoints26 = increment(newPts - oldPts);
        const oldTC = (!wasWinner ? 1 : 0) + (wasWinner && isFinal ? 1 : 0);
        const newTC = (!isWinner ? 1 : 0) + (isWinner && isFinal ? 1 : 0);
        if (newTC !== oldTC) delta.tournamentsPlayed = increment(newTC - oldTC);
        if (newGames !== oldGames) delta.pointswon = increment(newGames - oldGames);
        if (newTotal !== oldTotal) delta.totalPointsPlayed = increment(newTotal - oldTotal);
        if (Object.keys(delta).length > 0) {
          delta.league = matchLeague;
          statsBatch.set(doc(db, 'stats', uid), delta, { merge: true });
        }
      };
      applyPlayerDelta(match.player_1_user_id, true);
      applyPlayerDelta(match.player_2_user_id, false);
    }
    await statsBatch.commit();
  } catch (err) {
    console.error('Score recorded, but stats update failed:', err);
  }

  // Advance the winner into the next match as a best-effort follow-up, AFTER the
  // result is committed — so a missing/mismatched next-match document can never roll
  // back the recorded winner, scores, or stats. Resolve the next match from loaded
  // state (use its real doc id) rather than reconstructing the id from the draw key,
  // which breaks for merged/regenerated draws whose next round lives under a
  // different key.
  if (match.next_match_id) {
    // Normalize null/undefined bracket so legacy docs (missing the field) still match.
    const normBracket = (b: unknown) => b ?? null;
    const sameDraw = (m: TournamentMatch) =>
      normBracket(m.bracket) === normBracket(match.bracket) &&
      m.tournament_choice === match.tournament_choice &&
      m.division === match.division &&
      m.skill_group === match.skill_group;

    // Find the next match by match_id in loaded state; fall back to reconstructed doc id.
    const drawKey = getDrawKey(match.tournament_choice, match.division, match.skill_group as SkillGroup);
    const isReservesMatch = normBracket(match.bracket) === 'reserves';
    const prefix = isReservesMatch
      ? `${match.event_id}_reserves_${drawKey}`
      : `${match.event_id}_${drawKey}`;
    const reconstructedId = `${prefix}_${match.next_match_id}`;

    const nextMatch =
      matches.find((m) => sameDraw(m) && m.match_id === match.next_match_id) ??
      matches.find((m) => m.id === reconstructedId);

    // Slot: stored next_slot, else inferred from sibling ordering (legacy docs).
    let slot = match.next_slot as 'player_1' | 'player_2' | '' | undefined;
    if (!slot) {
      const siblings = matches
        .filter((m) => sameDraw(m) && m.next_match_id === match.next_match_id)
        .sort((a, b) => a.position - b.position);
      const idx = siblings.findIndex((m) => m.id === match.id);
      slot = idx <= 0 ? 'player_1' : 'player_2';
    }

    const targetDocId = nextMatch?.id ?? reconstructedId;
    try {
      await updateDoc(doc(db, 'tournament_matches', targetDocId), {
        [`${slot}_name`]: submission.claimed_winner_name,
        [`${slot}_user_id`]: submission.claimed_winner_user_id,
        [`${slot}_contact`]:
          submission.claimed_winner_user_id === match.player_1_user_id
            ? match.player_1_contact
            : match.player_2_contact,
      });
    } catch (err) {
      console.error('Advancement failed:', err);
      setMessage({ type: 'error', text: 'Score recorded. Could not advance winner to next round — use Edit Draw to place the player manually.' });
    }
  }
}
