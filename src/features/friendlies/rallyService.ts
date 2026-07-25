import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

// Rallies — friendly-match requests, modelled on the ladder-challenge loop but with no points,
// no standings impact, and no organizer step: the recipient simply accepts or declines.
// Cloud Functions notify each side on create / respond / cancel (see functions/notifications.js).
export const RALLY_COL = 'rallies';

export type RallyStatus = 'open' | 'accepted' | 'declined';

export interface Rally {
  id: string;
  from_id: string;
  from_name: string;
  to_id: string;
  to_name: string;
  status: RallyStatus;
  created_at: string;
  responded_at?: string;
}

export async function createRally(
  from: { id: string; name: string },
  to: { id: string; name: string },
): Promise<void> {
  await addDoc(collection(db, RALLY_COL), {
    from_id: from.id,
    from_name: from.name,
    to_id: to.id,
    to_name: to.name,
    status: 'open',
    created_at: new Date().toISOString(),
  });
}

// Recipient responds.
export const respondRally = (id: string, accept: boolean) =>
  updateDoc(doc(db, RALLY_COL, id), {
    status: accept ? 'accepted' : 'declined',
    responded_at: new Date().toISOString(),
  });

// Sender may retract an open rally (deleting notifies the recipient server-side).
export const cancelRally = (id: string) => deleteDoc(doc(db, RALLY_COL, id));

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
    const un1 = onSnapshot(query(collection(db, RALLY_COL), where('from_id', '==', user.uid)), (s) => {
      setSent(toRows(s));
      setLoading(false);
    });
    const un2 = onSnapshot(query(collection(db, RALLY_COL), where('to_id', '==', user.uid)), (s) => {
      setReceived(toRows(s));
      setLoading(false);
    });
    return () => { un1(); un2(); };
  }, [user?.uid]);

  // Players you already have an open/accepted rally with (either direction) — used to disable
  // duplicate Rally buttons.
  const activePartnerIds = useMemo(() => {
    const ids = new Set<string>();
    [...sent, ...received].forEach((r) => {
      if (r.status === 'declined') return;
      ids.add(r.from_id);
      ids.add(r.to_id);
    });
    return ids;
  }, [sent, received]);

  return { sent, received, loading, activePartnerIds };
}
