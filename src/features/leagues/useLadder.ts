import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useContacts } from '../contacts/useContacts';
import { LADDER_COOLDOWN_DAYS, LADDER_ACTIVE_CHALLENGE_CAP, LadderChallenge } from './ladderService';

export type ChallengeState = 'available' | 'pending' | 'cooldown';

// Subscribes to a ladder event's challenges and loads contact details for the players the
// current user has an active challenge with (for the ContactOpponentButton).
export function useLadder(eventId: string | undefined, uid: string | undefined) {
  const [challenges, setChallenges] = useState<LadderChallenge[]>([]);
  // Phone/email/WhatsApp live in `contacts`, not `users` — see the ContactData doc comment.

  useEffect(() => {
    setChallenges([]);
    if (!eventId) return;
    return onSnapshot(query(collection(db, 'matches'), where('category', '==', 'challenge'), where('event_id', '==', eventId)), (snap) => {
      setChallenges(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LadderChallenge)));
    });
  }, [eventId]);

  // Open (awaiting accept/decline) challenges only — same as Rallies rallies, once accepted
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
  // Results the two players disagree about (creator queue). A challenge counts the moment either
  // player records it, so there is no confirmation queue any more — the only thing an organizer
  // has to settle is a genuine disagreement about who won.

  // Players I have an ACCEPTED challenge with — these get a Contact button instead of "Pending"
  // in the players list.
  const acceptedPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    challenges.forEach((c) => {
      if (c.status !== 'accepted') return;
      if (c.player_1_uid === uid) ids.add(c.player_2_uid);
      else if (c.player_2_uid === uid) ids.add(c.player_1_uid);
    });
    return ids;
  }, [challenges, uid]);

  // Concurrent allowance: challenges I SENT that are still 'open' or 'accepted'. No time-based
  // reset — a slot frees up only once that challenge is recorded or declined, or is cancelled
  // (cancelling deletes the doc outright).
  const activeChallengesUsed = useMemo(
    () => challenges.filter(
      (c) => c.player_1_uid === uid && (c.status === 'open' || c.status === 'accepted'),
    ).length,
    [challenges, uid],
  );
  const activeChallengesLeft = Math.max(0, LADDER_ACTIVE_CHALLENGE_CAP - activeChallengesUsed);

  // Contact details for the counterparts of my accepted challenges (a denied read is normal).
  const contactMap = useContacts([...acceptedPartnerIds]);

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
      if (between.some((c) => c.status === 'open' || c.status === 'accepted')) return 'pending';
      if (
        between.some(
          (c) => c.status === 'confirmed' && c.confirmed_at && new Date(c.confirmed_at).getTime() > cutoff,
        )
      )
        return 'cooldown';
      return 'available';
    };
  }, [challenges, uid]);

  return { challenges, myChallenges, incoming, contactMap, stateWith, acceptedPartnerIds, activeChallengesLeft };
}
