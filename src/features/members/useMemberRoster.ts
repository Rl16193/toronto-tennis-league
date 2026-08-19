import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export type Member = { id: string; name: string };

/**
 * Every member's uid + display name, for name autosearch.
 *
 * Reads only the public `users` collection — no contact details, which live in `contacts` behind
 * a sign-in (see ContactData in types.ts).
 *
 * Cached at module scope and de-duplicated across concurrent callers: this is a full-collection
 * read, and it used to fire again every single time the ambassador claim modal opened. Several
 * search inputs on one screen now share a single fetch.
 */
let cache: Member[] | null = null;
let inFlight: Promise<Member[]> | null = null;

const loadRoster = (): Promise<Member[]> => {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  inFlight = getDocs(collection(db, 'users'))
    .then((snap) => {
      cache = snap.docs
        .map((d) => ({ id: d.id, name: (d.data().name as string) || 'Player' }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return cache;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

/** `excludeId` drops one member from the list — usually the signed-in user. */
export function useMemberRoster(excludeId?: string): Member[] {
  const [members, setMembers] = useState<Member[]>(() => cache ?? []);

  useEffect(() => {
    let cancelled = false;
    loadRoster()
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        /* search degrades to free text */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return excludeId ? members.filter((m) => m.id !== excludeId) : members;
}
