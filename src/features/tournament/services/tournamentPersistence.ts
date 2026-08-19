import { doc, writeBatch, type DocumentData, type SetOptions, type UpdateData } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

/** Central Firestore write boundary for draw, participant-placement, and RR draft persistence. */
export const createTournamentWriteBatch = () => {
  const batch = writeBatch(db);
  return {
    deleteMatch: (id: string) => batch.delete(doc(db, 'matches', id)),
    setMatch: (id: string, data: DocumentData, options?: SetOptions) =>
      options ? batch.set(doc(db, 'matches', id), data, options) : batch.set(doc(db, 'matches', id), data),
    updateMatch: (id: string, data: UpdateData<DocumentData>) => batch.update(doc(db, 'matches', id), data),
    deleteParticipant: (id: string) => batch.delete(doc(db, 'event_participants', id)),
    updateParticipant: (id: string, data: UpdateData<DocumentData>) =>
      batch.update(doc(db, 'event_participants', id), data),
    setRRDraft: (eventId: string, drawKey: string, data: DocumentData, options?: SetOptions) =>
      options
        ? batch.set(doc(db, 'events', eventId, 'rr_drafts', drawKey), data, options)
        : batch.set(doc(db, 'events', eventId, 'rr_drafts', drawKey), data),
    commit: () => batch.commit(),
  };
};
