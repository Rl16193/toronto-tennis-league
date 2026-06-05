import { doc, writeBatch } from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import { EventParticipant, TennisEvent, UserData, UserStats } from '../../types';
import { DrawConfig, TournamentPlayer } from './types';
import {
  buildMatchFields, buildPlayerList, fallbackTemplate, filterParticipantsForDraw,
  getDrawKey, getDrawSize, normalizeTemplateMatches,
} from './utils';

export interface GenerateDrawParams {
  event: TennisEvent;
  participants: EventParticipant[];
  effectiveStatsMap: Record<string, UserStats>;
  userMap: Record<string, UserData>;
  previewDrawSize: Record<string, number>;
  previewSlotOverrides: Record<string, Record<number, TournamentPlayer | null>>;
  started: boolean;
}

/**
 * Writes a finalized draw to Firestore for the given DrawConfig.
 * All match documents are written in a single batch.
 */
export async function generateDraw(
  draw: DrawConfig,
  params: GenerateDrawParams,
  db: Firestore,
  lockedDrawsize?: number,
): Promise<void> {
  const { event, participants, effectiveStatsMap, userMap, previewDrawSize, previewSlotOverrides, started } = params;

  const drawParticipants = filterParticipantsForDraw(participants, draw, effectiveStatsMap);
  const players = buildPlayerList(drawParticipants, draw, effectiveStatsMap, userMap);
  const drawsize = lockedDrawsize ?? previewDrawSize[draw.label] ?? getDrawSize(players.length, draw.tournamentChoice);
  const slicedPlayers = players.slice(0, drawsize);

  const templateMatches = normalizeTemplateMatches(fallbackTemplate(drawsize));
  const slotMap = new Map<number, TournamentPlayer>();
  slicedPlayers.forEach((p, i) => slotMap.set(i + 1, p));

  const drawOverrides = previewSlotOverrides[draw.label] ?? {};
  Object.entries(drawOverrides).forEach(([slotStr, player]) => {
    const slotNum = Number(slotStr);
    if (player === null) slotMap.delete(slotNum);
    else slotMap.set(slotNum, player);
  });

  const batch = writeBatch(db);
  const drawKey = getDrawKey(draw.tournamentChoice, draw.division, draw.skillGroup);
  const cfg = {
    eventId: event.id,
    tournamentChoice: draw.tournamentChoice,
    division: draw.division,
    skillGroup: draw.skillGroup,
    drawsize,
    allMatches: templateMatches,
  };
  templateMatches.forEach((tm, index) => {
    batch.set(
      doc(db, 'tournament_matches', `${event.id}_${drawKey}_${tm.match_id}`),
      { ...buildMatchFields(tm, index, slotMap, cfg), bracket: null, started, created_at: new Date().toISOString() },
      { merge: true },
    );
  });
  await batch.commit();
}
