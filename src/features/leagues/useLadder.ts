import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ContactData } from '../../types';
import { MATCHES_COL, LADDER_COOLDOWN_DAYS, LADDER_ACTIVE_CHALLENGE_CAP, LadderChallenge } from './ladderService';

export type ChallengeState = 'available' | 'pending' | 'cooldown';

// Subscribes to a ladder event's challenges and loads contact details for the players the
// current user has an active challenge with (for the ContactOpponentButton).
export function useLadder(eventId: string | undefined, uid: string | undefined) {
  const [challenges, setChallenges] = useState<LadderChallenge[]>([]);
  const [challengesReady, setChallengesReady] = useState(false);
  // Phone/email/WhatsApp live in `contacts`, not `users` — see the ContactData doc comment.
  const [contactMap, setContactMap] = useState<Record<string, ContactData>>({});

  useEffect(() => {
    setChallenges([]);
    setChallengesReady(false);
    if (!eventId) return;
    return onSnapshot(query(collection(db, MATCHES_COL), where('category', '==', 'challenge'), where('event_id', '==', eventId)), (snap) => {
      setChallenges(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LadderChallenge)));
      setChallengesReady(true);
    });
  }, [eventId]);

  // Open (awaiting accept/decline) challenges only — same as Friendlies rallies, once accepted
  // a challenge drops out of this "needs a response" panel; the players list below shows a
  // Contact button for it instead.
  const myChallenges = useMemo(
    () => challenges.filter((c) => c.player_1_uid === uid && c.status === 'open'),
    [challenges, uid],
  );
  const incoming = useMemo(
    () => challenges.filter((c) => c.player_2_uid === uid && c.status === 'open'),
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
      if (c.player_1_uid === uid) ids.add(c.player_2_uid);
      else if (c.player_2_uid === uid) ids.add(c.player_1_uid);
    });
    return ids;
  }, [challenges, uid]);

  // Concurrent allowance: challenges I SENT that are still 'open' or 'accepted' (not yet reported/
  // confirmed/rejected). No time-based reset — a slot frees up only once that challenge moves past
  // accepted (scored, confirmed, rejected) or is cancelled (cancelling deletes the doc).
  const activeChallengesUsed = useMemo(
    () => challenges.filter(
      (c) => c.player_1_uid === uid && (c.status === 'open' || c.status === 'accepted'),
    ).length,
    [challenges, uid],
  );
  const activeChallengesLeft = Math.max(0, LADDER_ACTIVE_CHALLENGE_CAP - activeChallengesUsed);

  // Fetch contact info for the counterparts of my accepted challenges.
  useEffect(() => {
    const missing = [...acceptedPartnerIds].filter((id) => id && !contactMap[id]);
    if (missing.length === 0) return;
    // Per-read catch, not one around the batch: `contacts` is readable only by an opponent, and
    // the connection doc that proves it is written by a trigger a moment AFTER the challenge is
    // accepted. Without this, one denied read rejects the whole Promise.all and nobody's contact
    // resolves.
    Promise.all(
      missing.map((id) => getDoc(doc(db, 'contacts', id))
        .then((s) => [id, s.data() as ContactData | undefined] as const)
        .catch(() => [id, undefined] as const)),
    ).then((entries) => {
      const found = entries.filter((e) => !!e[1]) as [string, ContactData][];
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
          (c.player_1_uid === uid && c.player_2_uid === opponentId) ||
          (c.player_2_uid === uid && c.player_1_uid === opponentId),
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

  return { challenges, challengesReady, myChallenges, incoming, reported, contactMap, stateWith, acceptedPartnerIds, activeChallengesLeft };
}
