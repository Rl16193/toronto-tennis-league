import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  normalizeEvent,
  normalizeEventParticipant,
  normalizeScoreSubmission,
  normalizeTournamentMatch,
} from '../../../lib/firestoreNormalization';
import type { EventParticipant, TennisEvent } from '../../../types';
import type { ScoreSubmissionDoc, TournamentMatch } from '../../../pages/tournament/types';

export const loadTournamentEvents = async (): Promise<TennisEvent[]> => {
  const snapshot = await getDocs(collection(db, 'events'));
  return snapshot.docs.map((doc) => normalizeEvent(doc.id, doc.data()));
};

export const subscribeEventParticipants = (eventId: string, onValue: (items: EventParticipant[]) => void) =>
  onSnapshot(query(collection(db, 'event_participants'), where('event_id', '==', eventId)), (snapshot) =>
    onValue(
      snapshot.docs
        .map((doc) => normalizeEventParticipant(doc.id, doc.data()))
        .filter((item): item is EventParticipant => item !== null),
    ),
  );

export const subscribeTournamentMatches = (eventId: string, onValue: (items: TournamentMatch[]) => void) =>
  onSnapshot(
    query(collection(db, 'matches'), where('event_id', '==', eventId), where('category', 'in', ['singles', 'doubles'])),
    (snapshot) =>
      onValue(
        snapshot.docs
          .map((doc) => normalizeTournamentMatch(doc.id, doc.data()))
          .filter((item): item is TournamentMatch => item !== null),
      ),
  );

export const subscribeScoreSubmissions = (
  eventId: string,
  onValue: (items: ScoreSubmissionDoc[]) => void,
  onError: () => void,
) =>
  onSnapshot(
    query(collection(db, 'matches'), where('category', '==', 'score_submission'), where('event_id', '==', eventId)),
    (snapshot) =>
      onValue(
        snapshot.docs
          .map((doc) => normalizeScoreSubmission(doc.id, doc.data()))
          .filter((item): item is ScoreSubmissionDoc => item !== null)
          .filter((item) => !item.resolved),
      ),
    onError,
  );
