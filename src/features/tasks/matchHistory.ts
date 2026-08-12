import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Completed tournament matches a player was in, with real set scores — walkovers and score-less
// completions don't count. Shared by useTasks.ts (builds task-progress stats from these) and
// claimService.ts (just checks whether any exist, for the Ambassador claim gate).
export async function fetchCompletedTournamentMatches(uid: string) {
  const [p1, p2] = await Promise.all([
    getDocs(query(collection(db, 'matches'), where('player_1_uid', '==', uid), where('status', '==', 'complete'))),
    getDocs(query(collection(db, 'matches'), where('player_2_uid', '==', uid), where('status', '==', 'complete'))),
  ]);
  const seen = new Set<string>();
  return [...p1.docs, ...p2.docs].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    const m = d.data();
    // A walkover is recorded as sets of 0-0 — still non-null, so the blank check alone doesn't
    // catch it. Both conditions are needed: a real score, and not a walkover.
    if (m.walkover === true) return false;
    if (m.set_1_player_1 == null || m.set_1_player_2 == null) return false; // no real score
    return true;
  });
}
