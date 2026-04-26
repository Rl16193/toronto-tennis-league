import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot, documentId } from 'firebase/firestore';
import { db, storage } from '../../../services/firebase';
import { useAuth } from '../../../context/AuthContext';
import { TennisEvent, EventParticipant } from '../../../types';
import { getDownloadURL, ref } from 'firebase/storage';

type JoinedEventCard = TennisEvent & { participantId: string };

const FIRESTORE_IN_QUERY_LIMIT = 10;

const chunkValues = <T,>(values: T[], chunkSize: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
};

const resolveStorageUrl = async (imagePath: string) => {
  if (!imagePath) return '';
  if (imagePath.startsWith('gs://')) {
    return getDownloadURL(ref(storage, imagePath));
  }

  return imagePath;
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

    const q = query(collection(db, 'event_participants'), where('user_id', '==', user.uid));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const participantData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventParticipant));

      if (participantData.length === 0) {
        setJoinedEvents([]);
        setLoading(false);
        return;
      }

      try {
        const eventIds = [...new Set(participantData.map((participant) => participant.event_id).filter(Boolean))];
        const eventIdChunks = chunkValues(eventIds, FIRESTORE_IN_QUERY_LIMIT);
        const eventSnapshots = await Promise.all(
          eventIdChunks.map((eventIdsChunk) =>
            getDocs(query(collection(db, 'events'), where(documentId(), 'in', eventIdsChunk)))
          )
        );

        const eventMap = new Map<string, TennisEvent>();
        eventSnapshots.forEach((eventSnapshot) => {
          eventSnapshot.docs.forEach((eventDoc) => {
            eventMap.set(eventDoc.id, { id: eventDoc.id, ...eventDoc.data() } as TennisEvent);
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
          })
        );

        setJoinedEvents(joined.filter(Boolean) as JoinedEventCard[]);
      } catch (error) {
        console.error("Error fetching joined events:", error);
        setJoinedEvents([]);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user]);

  return { joinedEvents, loading };
};