import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Anti double-farming: returns the set of opponent uids the current user already has a GENERATED
// head-to-head with in another, still-active event (a round-robin or knockout `tournament_matches`
// fixture in an event whose Final hasn't been played). Ladder challenges against these players are
// blocked so the same physical match can't be reported for points twice (once in the tournament,
// once on the ladder). The block lifts automatically once that other event finishes.
export function useCrossEventConflicts(uid: string | undefined, ladderEventId: string | undefined): Set<string> {
  const [opponents, setOpponents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) { setOpponents(new Set()); return; }
    let alive = true;

    (async () => {
      // My tournament matches (either slot). Single-field equality — no composite index needed.
      const [p1, p2] = await Promise.all([
        getDocs(query(collection(db, 'tournament_matches'), where('player_1_user_id', '==', uid))),
        getDocs(query(collection(db, 'tournament_matches'), where('player_2_user_id', '==', uid))),
      ]);

      // event_id → opponent uids I share a match with in that event.
      const perEvent = new Map<string, Set<string>>();
      const seen = new Set<string>();
      [...p1.docs, ...p2.docs].forEach((d) => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        const m = d.data();
        if (!m.event_id || m.event_id === ladderEventId) return; // different event only
        const opp = m.player_1_user_id === uid ? m.player_2_user_id : m.player_1_user_id;
        if (!opp) return; // BYE / unfilled slot
        if (!perEvent.has(m.event_id)) perEvent.set(m.event_id, new Set());
        perEvent.get(m.event_id)!.add(opp);
      });
      if (perEvent.size === 0) { if (alive) setOpponents(new Set()); return; }

      // An event is completed once its Final ('F') is played with a winner. Same query shape the
      // Tournament page already uses (event_id `in` …), so no new index; Final check is client-side.
      const eids = [...perEvent.keys()];
      const completed = new Set<string>();
      for (let i = 0; i < eids.length; i += 10) {
        const chunk = eids.slice(i, i + 10);
        const snap = await getDocs(query(collection(db, 'tournament_matches'), where('event_id', 'in', chunk)));
        snap.docs.forEach((d) => {
          const m = d.data();
          if (m.round === 'F' && m.status === 'complete' && m.winner_user_id) completed.add(m.event_id as string);
        });
      }

      // Opponents from events that are NOT yet completed = active conflicts.
      const active = new Set<string>();
      perEvent.forEach((opps, eid) => { if (!completed.has(eid)) opps.forEach((o) => active.add(o)); });
      if (alive) setOpponents(active);
    })().catch(() => { if (alive) setOpponents(new Set()); });

    return () => { alive = false; };
  }, [uid, ladderEventId]);

  return opponents;
}
