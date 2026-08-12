import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Anti double-farming: returns the set of opponent uids the current user already has a GENERATED
// head-to-head with in another, still-active event (a round-robin or knockout `matches`
// fixture in an event whose Final hasn't been played). Ladder challenges against these players are
// blocked so the same physical match can't be reported for points twice (once in the tournament,
// once on the ladder). The block lifts automatically once that other event finishes.
export function useCrossEventConflicts(uid: string | undefined, ladderEventId: string | undefined): Set<string> {
  const [opponents, setOpponents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) { setOpponents(new Set()); return; }
    let alive = true;

    (async () => {
      // My tournament matches (either slot). Two separate equality queries on the shared
      // matches collection, merged client-side and filtered by category.
      const [s1, s2] = await Promise.all([
        getDocs(query(collection(db, 'matches'), where('player_1_uid', '==', uid))),
        getDocs(query(collection(db, 'matches'), where('player_2_uid', '==', uid))),
      ]);
      const snap = { docs: [...s1.docs, ...s2.docs].filter((d) => {
        const cat = d.data().category;
        return cat === 'singles' || cat === 'doubles';
      }) };

      // event_id → opponent uids I share a match with in that event.
      const perEvent = new Map<string, Set<string>>();
      snap.docs.forEach((d) => {
        const m = d.data();
        if (!m.event_id || m.event_id === ladderEventId) return; // different event only
        const opp = m.player_1_uid === uid ? m.player_2_uid : m.player_1_uid;
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
        const finalSnap = await getDocs(query(collection(db, 'matches'), where('event_id', 'in', chunk), where('round', '==', 'F'), where('status', '==', 'complete')));
        finalSnap.docs.forEach((d) => {
          const m = d.data();
          if (m.winner_uid) completed.add(m.event_id as string);
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
