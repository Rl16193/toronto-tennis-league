import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot, documentId } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../context/AuthContext';
import { TennisEvent, EventParticipant } from '../../../types';
import { resolveStorageUrl } from '../../events/services/eventService';
import { normalizeEvent, normalizeEventParticipant } from '../../../lib/firestoreNormalization';

export type JoinedEventCard = TennisEvent & { participantId: string; dateselected?: string[] };

const FIRESTORE_IN_QUERY_LIMIT = 10;

const chunkValues = <T>(values: T[], chunkSize: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
};

export const useProfileData = () => {
  const { user } = useAuth();
  const [joinedEvents, setJoinedEvents] = useState<JoinedEventCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setJoinedEvents([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'event_participants'), where('uid', '==', user.uid));

    // This callback is async with two awaits in it, so two snapshots can be in flight at once
    // with no ordering guarantee — leave an event and join another quickly and the slower, older
    // callback used to land last and restore the event you just left. `generation` makes only the
    // newest callback allowed to write, and `cancelled` stops writes after unmount.
    let cancelled = false;
    let generation = 0;

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const mine = ++generation;
      const isStale = () => cancelled || mine !== generation;
      const participantData = snapshot.docs
        .map((doc) => normalizeEventParticipant(doc.id, doc.data()))
        .filter((participant): participant is EventParticipant => participant !== null);

      if (participantData.length === 0) {
        if (isStale()) return;
        setJoinedEvents([]);
        setLoading(false);
        return;
      }

      try {
        const eventIds = [...new Set(participantData.map((participant) => participant.event_id).filter(Boolean))];
        const eventIdChunks = chunkValues(eventIds, FIRESTORE_IN_QUERY_LIMIT);
        const eventSnapshots = await Promise.all(
          eventIdChunks.map((eventIdsChunk) =>
            getDocs(query(collection(db, 'events'), where(documentId(), 'in', eventIdsChunk))),
          ),
        );

        const eventMap = new Map<string, TennisEvent>();
        eventSnapshots.forEach((eventSnapshot) => {
          eventSnapshot.docs.forEach((eventDoc) => {
            eventMap.set(eventDoc.id, normalizeEvent(eventDoc.id, eventDoc.data()));
          });
        });

        const joined = await Promise.all(
          participantData.map(async (participant) => {
            const event = eventMap.get(participant.event_id);
            if (!event) return null;

            const image = event.image ? await resolveStorageUrl(event.image).catch(() => '') : '';

            return {
              ...event,
              image,
              participantId: participant.id,
              dateselected: participant.dateselected || [],
            } as JoinedEventCard;
          }),
        );

        if (isStale()) return;
        setJoinedEvents(joined.filter(Boolean) as JoinedEventCard[]);
      } catch (error) {
        if (isStale()) return;
        console.error('Error fetching joined events:', error);
        setJoinedEvents([]);
      } finally {
        if (!isStale()) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // `user?.uid`, not `user`: AuthContext hands out a new User object on every token refresh,
    // which tore this listener down and re-opened it roughly hourly for no reason.
  }, [user?.uid]);

  return { joinedEvents, loading };
};
