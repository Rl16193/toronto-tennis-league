import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { TournamentPlayer } from '../../../pages/tournament/types';

export type DrawDocument = { id: string; data: Record<string, unknown> };
export type ByeAdvance = { nextMatchId: string; slot: 'player_1' | 'player_2'; player: TournamentPlayer };

export const persistDrawDocuments = async (documents: DrawDocument[], advances: ByeAdvance[]) => {
  const batch = writeBatch(db);
  documents.forEach((item) => batch.set(doc(db, 'matches', item.id), item.data, { merge: true }));
  await batch.commit();
  if (!advances.length) return;
  const advanceBatch = writeBatch(db);
  advances.forEach(({ nextMatchId, slot, player }) =>
    advanceBatch.update(doc(db, 'matches', nextMatchId), {
      [`${slot}_name`]: player.name,
      [`${slot}_uid`]: player.uid,
    }),
  );
  await advanceBatch.commit();
};
