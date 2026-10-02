import { Timestamp, addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../contacts/useContacts';
import { toMillis } from '../../utils/eventDates';
import { pairDivision, pairSkillGroup } from '../../utils/skillLevels';
import type { RequestPlayer } from '../leagues/ladderService';

// Rallies — rally-match requests, modelled on the ladder-challenge loop. The recipient accepts
// or declines; either player then records the score through the scoreMatch Cloud Function
// (features/matches/scoring.ts) and it counts straight away: winner +2, loser +1 leaguePoints,
// and a match each way. A rally never costs points.
//
// Recording a score is OPTIONAL by design: a rally is a way to earn extra points, and choosing not
// to enter one is a normal outcome. An unplayed rally pays nothing and nobody is chased for it.

// A scored rally is `complete`; its result is its applied `submissions` entry (results.ts).
// `played` is an accepted rally auto-closed after 30 days with no score: no result, no history.
export type RallyStatus = 'open' | 'accepted' | 'declined' | 'complete' | 'played';

export interface Rally {
  id: string;
  player_1_uid: string;
  player_1_name: string;
  player_2_uid: string;
  player_2_name: string;
  status: RallyStatus;
  /** '' until played; the score itself is on the result entry. */
  winner_uid: string;
  created_at: Timestamp | null;
  responded_at: Timestamp | null;
  updated_at: Timestamp | null;
}

export async function createRally(
  from: RequestPlayer,
  to: RequestPlayer,
): Promise<void> {
  const now = Timestamp.now();
  // The full matches shape; a rally belongs to no event and tournament-only fields hold typed empties.
  await addDoc(collection(db, 'matches'), {
    category: 'rally',
    sub_category: 'singles',
    status: 'open',
    player_1_uid: from.id,
    player_1_name: from.name,
    player_2_uid: to.id,
    player_2_name: to.name,
    participant_uids: [from.id, to.id],
    event_id: '',
    winner_uid: '',
    responded_at: null,
    created_at: now,
    updated_at: now,
    match_id: '', round: '', drawsize: 0, division: pairDivision(from.league, to.league),
    skill_group: pairSkillGroup(from.skill_level, to.skill_level), zone: '', format: '',
    player_1_slot: 0, player_2_slot: 0, next_match_id: '', next_slot: '', started: false,
    group_label: 'rally',
  });
}

// Recipient responds.
export const respondRally = (id: string, accept: boolean) => {
  const now = Timestamp.now();
  return updateDoc(doc(db, 'matches', id), { status: accept ? 'accepted' : 'declined', responded_at: now, updated_at: now });
};

// Calls off a rally with no score yet: the sender while it's open, either player once it's accepted
// (firestore.rules). Nothing is paid before a result, so there is nothing to reverse.
export const cancelRally = (id: string) => deleteDoc(doc(db, 'matches', id));

// Live view of the signed-in player's rallies, both directions.
export function useRallies() {
  const { user } = useAuth();
  const [sent, setSent] = useState<Rally[]>([]);
  const [received, setReceived] = useState<Rally[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setSent([]); setReceived([]); setLoading(false); return; }
    setLoading(true);
    const toRows = (snap: { docs: { id: string; data: () => unknown }[] }) =>
      snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Rally, 'id'>) }))
        .sort((a, b) => toMillis(b.created_at) - toMillis(a.created_at));
    const un1 = onSnapshot(
      query(collection(db, 'matches'), where('category', '==', 'rally'), where('player_1_uid', '==', user.uid)),
      (s) => { setSent(toRows(s)); setLoading(false); },
    );
    const un2 = onSnapshot(
      query(collection(db, 'matches'), where('category', '==', 'rally'), where('player_2_uid', '==', user.uid)),
      (s) => { setReceived(toRows(s)); setLoading(false); },
    );
    return () => { un1(); un2(); };
  }, [user?.uid]);

  // Rallies still in flight — used to disable duplicate Rally buttons. A finished one (declined,
  // complete or played) frees the pairing so the two can arrange another rally.
  const FINISHED: RallyStatus[] = ['declined', 'complete', 'played'];
  const activePartnerIds = useMemo(() => {
    const ids = new Set<string>();
    [...sent, ...received].forEach((r) => {
      if (FINISHED.includes(r.status)) return;
      ids.add(r.player_1_uid);
      ids.add(r.player_2_uid);
    });
    return ids;
  }, [sent, received]);

  // Players whose rally is accepted and still to be played — these get a Contact button instead
  // of "Pending" in the players list.
  const acceptedPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    [...sent, ...received].forEach((r) => {
      if (r.status !== 'accepted') return;
      ids.add(r.player_1_uid);
      ids.add(r.player_2_uid);
    });
    ids.delete(user?.uid ?? '');
    return ids;
  }, [sent, received, user?.uid]);

  /** The in-flight rally with one player, if any — the doc a score is reported against. */
  const rallyWith = useMemo(() => {
    const map: Record<string, Rally> = {};
    [...sent, ...received].forEach((r) => {
      if (FINISHED.includes(r.status)) return;
      const other = r.player_1_uid === user?.uid ? r.player_2_uid : r.player_1_uid;
      map[other] = r;
    });
    return map;
  }, [sent, received, user?.uid]);

  // Contact info for accepted-rally partners (for the ContactOpponentButton).
  const contactMap = useContacts([...acceptedPartnerIds]);

  return { sent, received, loading, activePartnerIds, acceptedPartnerIds, rallyWith, contactMap };
}
