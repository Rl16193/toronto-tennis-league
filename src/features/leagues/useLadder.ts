import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserData } from '../../types';
import { LADDER_COL, LADDER_COOLDOWN_DAYS, LADDER_CHALLENGES_PER_WEEK, LadderChallenge } from './ladderService';

export type ChallengeState = 'available' | 'pending' | 'cooldown';

// Subscribes to a ladder event's challenges and loads contact details for the players the
// current user has an active challenge with (for the ContactOpponentButton).
export function useLadder(eventId: string | undefined, uid: string | undefined) {
  const [challenges, setChallenges] = useState<LadderChallenge[]>([]);
  const [challengesReady, setChallengesReady] = useState(false);
  const [contactMap, setContactMap] = useState<Record<string, UserData>>({});

  useEffect(() => {
    setChallenges([]);
    setChallengesReady(false);
    if (!eventId) return;
    return onSnapshot(query(collection(db, LADDER_COL), where('event_id', '==', eventId)), (snap) => {
      setChallenges(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LadderChallenge)));
      setChallengesReady(true);
    });
  }, [eventId]);

  // Open (awaiting accept/decline) challenges only — same as Friendlies rallies, once accepted
  // a challenge drops out of this "needs a response" panel; the players list below shows a
  // Contact button for it instead.
  const myChallenges = useMemo(
    () => challenges.filter((c) => c.challenger_id === uid && c.status === 'open'),
    [challenges, uid],
  );
  const incoming = useMemo(
    () => challenges.filter((c) => c.opponent_id === uid && c.status === 'open'),
    [challenges, uid],
  );
  // Reported results awaiting organizer confirmation (creator queue).
  const reported = useMemo(() => challenges.filter((c) => c.status === 'reported'), [challenges]);

  // Players I have an ACCEPTED (or further along) challenge with — these get a Contact button
  // instead of "Pending" in the players list.
  const acceptedPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    challenges.forEach((c) => {
      if (c.status !== 'accepted' && c.status !== 'reported') return;
      if (c.challenger_id === uid) ids.add(c.opponent_id);
      else if (c.opponent_id === uid) ids.add(c.challenger_id);
    });
    return ids;
  }, [challenges, uid]);

  // Weekly allowance: challenges I opened since Monday 00:00. Cancelled challenges are deleted,
  // so they refund the slot automatically; rejected/confirmed ones still count (they were used).
  const weeklyChallengesUsed = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Mon=0 … Sun=6
    monday.setHours(0, 0, 0, 0);
    return challenges.filter(
      (c) => c.challenger_id === uid && new Date(c.created_at).getTime() >= monday.getTime(),
    ).length;
  }, [challenges, uid]);
  const weeklyChallengesLeft = Math.max(0, LADDER_CHALLENGES_PER_WEEK - weeklyChallengesUsed);

  // Fetch contact info for the counterparts of my accepted challenges.
  useEffect(() => {
    const missing = [...acceptedPartnerIds].filter((id) => id && !contactMap[id]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map((id) => getDoc(doc(db, 'users', id)).then((s) => [id, s.data() as UserData | undefined] as const)),
    ).then((entries) => {
      const found = entries.filter((e) => !!e[1]) as [string, UserData][];
      if (found.length) setContactMap((prev) => ({ ...prev, ...Object.fromEntries(found) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptedPartnerIds]);

  // Challenge state vs a given opponent: an active challenge blocks; a recent confirmed one
  // enforces the cooldown; otherwise available.
  const stateWith = useMemo(() => {
    const cutoff = Date.now() - LADDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    return (opponentId: string): ChallengeState => {
      const between = challenges.filter(
        (c) =>
          (c.challenger_id === uid && c.opponent_id === opponentId) ||
          (c.opponent_id === uid && c.challenger_id === opponentId),
      );
      if (between.some((c) => c.status === 'open' || c.status === 'accepted' || c.status === 'reported')) return 'pending';
      if (
        between.some(
          (c) => c.status === 'confirmed' && c.confirmed_at && new Date(c.confirmed_at).getTime() > cutoff,
        )
      )
        return 'cooldown';
      return 'available';
    };
  }, [challenges, uid]);

  return { challenges, challengesReady, myChallenges, incoming, reported, contactMap, stateWith, acceptedPartnerIds, weeklyChallengesLeft };
}
