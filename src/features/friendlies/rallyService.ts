import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { ContactData } from '../../types';

// Rallies — friendly-match requests, modelled on the ladder-challenge loop but with no points,
// no standings impact, and no organizer step: the recipient simply accepts or declines.
// Cloud Functions notify each side on create / respond / cancel (see functions/notifications.js).
// Rallies live in the shared `matches` collection, tagged with category: 'rally'.
export const MATCHES_COL = 'matches';

export type RallyStatus = 'open' | 'accepted' | 'declined';

export interface Rally {
  id: string;
  player_1_uid: string;
  player_1_name: string;
  player_2_uid: string;
  player_2_name: string;
  status: RallyStatus;
  created_at: string;
  responded_at?: string;
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

  // Players you already have an open/accepted rally with (either direction) — used to disable
  // duplicate Rally buttons.
  const activePartnerIds = useMemo(() => {
    const ids = new Set<string>();
    [...sent, ...received].forEach((r) => {
      if (r.status === 'declined') return;
      ids.add(r.player_1_uid);
      ids.add(r.player_2_uid);
    });
    return ids;
  }, [sent, received]);

  // Players you have an ACCEPTED rally with — these get a Contact button instead of "Pending"
  // in the players list.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptedPartnerIds]);

  return { sent, received, loading, activePartnerIds, acceptedPartnerIds, contactMap };
}
