import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { TournamentMatch } from '../../../pages/tournament/types';
import { buildEventParticipantData, type EventParticipantWrite } from './eventParticipant';

/** Firestore boundary for event registration and the tournament-slot lookup used by the join flow. */
export const loadTournamentMatches = async (eventId: string): Promise<TournamentMatch[]> => {
  const snapshot = await getDocs(
    query(collection(db, 'matches'), where('event_id', '==', eventId), where('category', 'in', ['singles', 'doubles'])),
  );
  return snapshot.docs.map((matchDoc) => ({ id: matchDoc.id, ...matchDoc.data() }) as TournamentMatch);
};

export const createEventParticipant = async (input: EventParticipantWrite) =>
  addDoc(collection(db, 'event_participants'), buildEventParticipantData(input));

/** Best-effort slot seating remains a separate operation because Rules make it organizer-only. */
export const assignPlayerToMatchSlot = async (
  matchId: string,
  slot: 'player_1' | 'player_2',
  player: { uid: string; name: string },
) =>
  updateDoc(doc(db, 'matches', matchId), {
    [`${slot}_name`]: player.name,
    [`${slot}_uid`]: player.uid,
  });
