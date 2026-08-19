import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ContactData } from '../../types';
import { normalizeContactData } from '../../lib/firestoreNormalization';

/**
 * Resolves `contacts/{uid}` for a set of members, cached for the session.
 *
 * Contact details were split out of the world-readable `users` collection, so these reads need a
 * signed-in caller. A denied or missing read simply yields no entry — callers should treat an
 * absent contact as "no Contact button", never as an error.
 */
const cache = new Map<string, ContactData>();

export function useContacts(userIds: string[]): Record<string, ContactData> {
  const [contacts, setContacts] = useState<Record<string, ContactData>>({});
  // Stable dep: the array identity changes every render, the joined id list doesn't.
  const key = [...new Set(userIds.filter(Boolean))].sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) return;

    const cached = ids.filter((id) => cache.has(id));
    if (cached.length) {
      setContacts((prev) => ({
        ...prev,
        ...Object.fromEntries(cached.map((id) => [id, cache.get(id) as ContactData])),
      }));
    }

    const missing = ids.filter((id) => !cache.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        getDoc(doc(db, 'contacts', id))
          .catch(() => getDoc(doc(db, 'public_contacts', id)))
          .then((s) => [id, s.exists() ? normalizeContactData(s.data()) : undefined] as const)
          .catch(() => [id, undefined] as const),
      ),
    ).then((entries) => {
      const found = entries.filter((e): e is [string, ContactData] => !!e[1]);
      found.forEach(([id, c]) => cache.set(id, c));
      if (cancelled || found.length === 0) return;
      setContacts((prev) => ({ ...prev, ...Object.fromEntries(found) }));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return contacts;
}
