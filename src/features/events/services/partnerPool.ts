import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { ContactData } from '../../../types';

// Doubles partner pool (ported from Racquets-And-Strings). A doubles player who joins without a
// partner is listed at partner_pool/{eventId}/members/{uid}. Players in the pool see each other's
// contact cards (written server-side by onPartnerPoolJoin) and pair up by themselves.

export type PoolCategory = 'mens' | 'womens' | 'mixed';
export type PoolMember = { uid: string; name: string; category: PoolCategory; skill: number; created_at: string };

export const poolCategoryForDivision = (division = ''): PoolCategory => {
  const d = division.toLowerCase();
  if (d.includes('women')) return 'womens';
  if (d.includes('mixed')) return 'mixed';
  return 'mens';
};

export const joinPool = (eventId: string, m: Omit<PoolMember, 'created_at'>) =>
  setDoc(doc(db, 'partner_pool', eventId, 'members', m.uid), {
    uid: m.uid,
    name: m.name.trim() || 'Player',
    category: m.category,
    skill: Number.isFinite(m.skill) ? m.skill : 0,
    created_at: new Date().toISOString(),
  });

export const leavePool = (eventId: string, uid: string) =>
  deleteDoc(doc(db, 'partner_pool', eventId, 'members', uid));

/** Live pool members for an event, optionally one category. A read error shows an empty pool. */
export function usePool(eventId: string | undefined, category?: PoolCategory) {
  const [members, setMembers] = useState<PoolMember[]>([]);
  useEffect(() => {
    if (!eventId) { setMembers([]); return; }
    const col = collection(db, 'partner_pool', eventId, 'members');
    return onSnapshot(
      category ? query(col, where('category', '==', category)) : col,
      (snap) => setMembers(snap.docs
        .map((d) => d.data() as PoolMember)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))),
      () => setMembers([]),
    );
  }, [eventId, category]);
  return members;
}

/** Contact cards of pool members. Denied (not in the pool) looks exactly like none. */
export function usePoolContacts(eventId: string | undefined, inPool: boolean) {
  const [contacts, setContacts] = useState<Record<string, ContactData>>({});
  useEffect(() => {
    if (!eventId || !inPool) { setContacts({}); return; }
    return onSnapshot(
      collection(db, 'partner_pool', eventId, 'contacts'),
      (snap) => setContacts(Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as ContactData]))),
      () => setContacts({}),
    );
  }, [eventId, inPool]);
  return contacts;
}
