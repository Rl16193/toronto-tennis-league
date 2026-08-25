import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { TournamentMatch } from '../../tournament/types';
import { buildEventParticipantData, type EventParticipantWrite } from './eventParticipant';
import { normalizeTournamentMatch } from '../../../lib/firestoreNormalization';

/** Firestore boundary for event registration and the tournament-slot lookup used by the join flow. */
export const loadTournamentMatches = async (eventId: string): Promise<TournamentMatch[]> => {
  const snapshot = await getDocs(
    query(collection(db, 'matches'), where('event_id', '==', eventId), where('category', 'in', ['singles', 'doubles'])),
  );
  return snapshot.docs
    .map((matchDoc) => normalizeTournamentMatch(matchDoc.id, matchDoc.data()))
    .filter((match): match is TournamentMatch => match !== null);
};

export const createEventParticipant = async (input: EventParticipantWrite) =>
  addDoc(collection(db, 'event_participants'), buildEventParticipantData(input));
