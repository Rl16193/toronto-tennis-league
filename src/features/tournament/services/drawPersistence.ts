import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { TournamentPlayer } from '../../../pages/tournament/types';

export type DrawDocument = { id: string; data: Record<string, unknown> };
export type ByeAdvance = { nextMatchId: string; slot: 'player_1' | 'player_2'; player: TournamentPlayer };

export const persistDrawDocuments = async (documents: DrawDocument[], advances: ByeAdvance[]) => {
  const batch = writeBatch(db);
  const drawData = new Map(documents.map((item) => [item.id, { ...item.data }]));
  advances.forEach(({ nextMatchId, slot, player }) =>
    drawData.set(nextMatchId, {
      ...(drawData.get(nextMatchId) ?? {}),
      [`${slot}_name`]: player.name,
      [`${slot}_uid`]: player.uid,
    }),
  );
  drawData.forEach((data, id) => batch.set(doc(db, 'matches', id), data, { merge: true }));
  await batch.commit();
};
