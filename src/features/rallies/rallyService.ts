import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../contacts/useContacts';

// Rallies — rally-match requests, modelled on the ladder-challenge loop. The recipient accepts
// or declines; either player then records the score through the scoreMatch Cloud Function
// (features/matches/scoring.ts) and it counts straight away: winner +2, loser +1 leaguePoints26,
// and a match each way. A rally never costs points.
//
// Recording a score is OPTIONAL by design: a rally is a way to earn extra points, and choosing not
// to enter one is a normal outcome. An unplayed rally pays nothing and nobody is chased for it.
//

// `reported` and `disputed` are gone with the handshake — `disputed` was a dead end nothing ever
// transitioned out of. A disagreement is now `score_disputed` on a result that already counted.
export type RallyStatus = 'open' | 'accepted' | 'declined' | 'confirmed';

export interface Rally {
  id: string;
  player_1_uid: string;
  player_1_name: string;
  player_2_uid: string;
  player_2_name: string;
  status: RallyStatus;
  created_at: string;
  responded_at?: string;
  // Result fields are the SAME shape a tournament match uses — winner_uid/name plus absolute
  // per-set games — so one formatter and one history mapping serve every kind of result.
  winner_uid?: string;
  winner_name?: string;
  set_1_player_1?: number; set_1_player_2?: number;
  set_2_player_1?: number; set_2_player_2?: number;
  set_3_player_1?: number; set_3_player_2?: number;
  /** Stamped when the result lands, matching a tournament match, so history sorts on one field. */
  completed_at?: string;
  court?: string;
  /** Who recorded the result. Kept so a second submission can tell the two apart. */
  reported_by?: string;
  reported_at?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  /**
   * Both players recorded a score and named different winners. The first result stays applied and
   * showing; an organizer resolves it. Never set by the same player submitting twice.
   */
  score_disputed?: boolean;
  /** Stamped by the server when it pays the result. Never written by a client. */
  applied?: boolean;
}

export async function createRally(
  from: { id: string; name: string },
  to: { id: string; name: string },
): Promise<void> {
  await addDoc(collection(db, 'matches'), {
    category: 'rally',
    player_1_uid: from.id,
    player_1_name: from.name,
    player_2_uid: to.id,
    player_2_name: to.name,
    status: 'open',
    created_at: new Date().toISOString(),
  });
}

// Recipient responds.
export const respondRally = (id: string, accept: boolean) =>
  updateDoc(doc(db, 'matches', id), {
    status: accept ? 'accepted' : 'declined',
    responded_at: new Date().toISOString(),
  });

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
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
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

  // Rallies still in flight — used to disable duplicate Rally buttons. A finished one (declined
  // or confirmed) frees the pairing so the two can arrange another rally.
  const FINISHED: RallyStatus[] = ['declined', 'confirmed'];
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
