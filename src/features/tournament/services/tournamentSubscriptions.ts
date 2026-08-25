import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  normalizeEvent,
  normalizeEventParticipant,
  normalizeRoundRobinDraft,
  normalizeTournamentMatch,
  type RoundRobinDraft,
} from '../../../lib/firestoreNormalization';
import type { EventParticipant, TennisEvent } from '../../../types';
import type { TournamentMatch } from '../../../pages/tournament/types';

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

export const subscribeRoundRobinDraft = (
  eventId: string,
  drawKey: string,
  onValue: (draft: RoundRobinDraft | null) => void,
) =>
  onSnapshot(
    doc(db, 'events', eventId, 'rr_drafts', drawKey),
    (snapshot) => onValue(snapshot.exists() ? normalizeRoundRobinDraft(snapshot.data()) : null),
    () => onValue(null),
  );
