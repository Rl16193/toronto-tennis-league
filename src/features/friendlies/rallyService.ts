import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { ContactData } from '../../types';
import { setFieldsFrom } from '../tournament/domain/scoring';

// Rallies — friendly-match requests, modelled on the ladder-challenge loop. The recipient accepts
// or declines; either player then reports the score, and a SECOND party (the other player, or an
// admin) confirms it. Points are paid on that confirm by functions/friendlyPoints.js — winner +2,
// loser +1 leaguePoints26, and a match each way. A friendly never costs points.
// Rallies live in the shared `matches` collection, tagged with category: 'rally'.
export const MATCHES_COL = 'matches';

export type RallyStatus = 'open' | 'accepted' | 'declined' | 'reported' | 'confirmed' | 'disputed';

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
  /** Stamped on confirm, matching a tournament match, so history sorts on one field. */
  completed_at?: string;
  court?: string;
  reported_by?: string;
  reported_at?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  /** Stamped by friendlyPoints.js in the payout transaction. Never written by a client. */
  applied?: boolean;
}

export async function createRally(
  from: { id: string; name: string },
  to: { id: string; name: string },
): Promise<void> {
  await addDoc(collection(db, MATCHES_COL), {
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
  updateDoc(doc(db, MATCHES_COL, id), {
    status: accept ? 'accepted' : 'declined',
    responded_at: new Date().toISOString(),
  });

// Sender may retract an open rally (deleting notifies the recipient server-side).
export const cancelRally = (id: string) => deleteDoc(doc(db, MATCHES_COL, id));

// Either player reports the score of an accepted rally. Pays nothing on its own — it waits for a
// second party to confirm.
// `sets` are ordered [player_1 games, player_2 games] — absolute, never the reporter's viewpoint.
export const reportRally = (
  id: string,
  winner: { id: string; name: string },
  sets: [number, number][],
  reportedBy: string,
  court?: string,
) =>
  updateDoc(doc(db, MATCHES_COL, id), {
    status: 'reported',
    winner_uid: winner.id,
    winner_name: winner.name,
    ...setFieldsFrom(sets),
    ...(court ? { court } : {}),
    reported_by: reportedBy,
    reported_at: new Date().toISOString(),
  });

// The second party (other player or admin) confirms or disputes. Confirming is what triggers the
// payout; firestore.rules blocks the reporter from confirming their own report.
export const resolveRally = (id: string, confirmedBy: string, confirm: boolean) =>
  updateDoc(doc(db, MATCHES_COL, id), {
    status: confirm ? 'confirmed' : 'disputed',
    confirmed_by: confirmedBy,
    confirmed_at: new Date().toISOString(),
    // Only a confirm is a played result; a dispute isn't one, so it gets no completion stamp.
    ...(confirm ? { completed_at: new Date().toISOString() } : {}),
  });

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
      query(collection(db, MATCHES_COL), where('category', '==', 'rally'), where('player_1_uid', '==', user.uid)),
      (s) => { setSent(toRows(s)); setLoading(false); },
    );
    const un2 = onSnapshot(
      query(collection(db, MATCHES_COL), where('category', '==', 'rally'), where('player_2_uid', '==', user.uid)),
      (s) => { setReceived(toRows(s)); setLoading(false); },
    );
    return () => { un1(); un2(); };
  }, [user?.uid]);

  // Rallies still in flight — used to disable duplicate Rally buttons. A finished one (declined,
  // confirmed, disputed) frees the pairing so the two can arrange another friendly.
  const FINISHED: RallyStatus[] = ['declined', 'confirmed', 'disputed'];
  const activePartnerIds = useMemo(() => {
    const ids = new Set<string>();
    [...sent, ...received].forEach((r) => {
      if (FINISHED.includes(r.status)) return;
      ids.add(r.player_1_uid);
      ids.add(r.player_2_uid);
    });
    return ids;
  }, [sent, received]);

  // Players whose rally is accepted or awaiting confirmation — these get a Contact button instead
  // of "Pending" in the players list.
  const acceptedPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    [...sent, ...received].forEach((r) => {
      if (r.status !== 'accepted' && r.status !== 'reported') return;
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
  const [contactMap, setContactMap] = useState<
    Record<string, ContactData>
  >({});

  useEffect(() => {
    if (!acceptedPartnerIds.size) return;
    const load = async () => {
      // Per-read catch: `contacts` is opponent-only now, and the connection doc that proves it
      // lands a moment after the rally is accepted — a denial must not reject the whole batch.
      const found = await Promise.all(
        [...acceptedPartnerIds].map(async (id) => {
          try {
            const c = await getDoc(doc(db, 'contacts', id));
            return c.exists() ? ([id, c.data()] as const) : null;
          } catch { return null; }
        }),
      );
      // Filter before fromEntries — a null entry in the list throws.
      const entries = found.filter((e): e is readonly [string, ContactData] => !!e);
      if (entries.length) setContactMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    };
    load();
  }, [acceptedPartnerIds]);

  return { sent, received, loading, activePartnerIds, acceptedPartnerIds, rallyWith, contactMap };
}
