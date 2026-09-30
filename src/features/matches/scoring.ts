import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { ScoreForm, TournamentMatch } from '../../pages/tournament/types';
import { formatSetScores } from '../../pages/tournament/utils';
import { toTitleCase } from '../leagues/useStandings';

// Every score, for every match type, goes through the one `scoreMatch` Cloud Function
// (functions/scoring.js → lib/scoring.js). It checks the score, records it and pays the points;
// its refusals come back as player-readable messages. The app never writes a result itself.

export type ScorePayload = {
  winnerUid: string;
  /** Absolute [player_1, player_2] games for sets 1–3. */
  scores: [number, number][];
  walkover: boolean;
  court: string;
};

/** A challenge or rally an organizer records for two other members. */
export type PlayedMatch = {
  category: 'challenge' | 'rally';
  event_id?: string;
  division?: string;
  player_1_uid: string; player_1_name: string;
  player_2_uid: string; player_2_name: string;
};

export type RecordResponse = {
  applied?: boolean; advanced?: boolean; inDispute?: boolean;
  duplicate?: boolean; recordedOnly?: boolean; matchId: string;
};

const scoreMatch = httpsCallable<Record<string, unknown>, { result: unknown }>(functions, 'scoreMatch');
const call = async <T,>(action: string, data: Record<string, unknown>) =>
  (await scoreMatch({ action, ...data })).data.result as T;

/** Records a result on an existing match (any type), or on a new played one (`newMatch`). */
export const recordScore = (target: { matchId: string } | { newMatch: PlayedMatch }, payload?: ScorePayload) =>
  call<RecordResponse>('record', { ...target, ...payload });
/** Organizer: approve (the disputing score applies) or reject (the recorded one stands). */
export const settleDispute = (matchId: string, approve: boolean) => call<RecordResponse>('settle', { matchId, approve });
/** Organizer: one tournament match back to unplayed, undoing exactly what it paid. */
export const resetScore = (matchId: string) => call<boolean>('reset', { matchId });
/** Organizer: deletes a draw's matches and undoes everything they and their groups' bonuses paid. */
export const cancelDraw = (eventId: string, matchIds: string[]) => call<number>('cancel', { eventId, matchIds });
/** Organizer: one round-robin group's bonus on or off. Returns how many players it moved. */
export const setGroupBonus = (eventId: string, matchIds: string[], award: boolean) =>
  call<number>('bonus', { eventId, matchIds, award });

/** The modal's sets, entered from `submitterIsP1`'s side, as absolute pairs. All zeros is a walkover. */
export const resultFromForm = (form: ScoreForm, submitterIsP1: boolean): ScorePayload => {
  const parsed = form.sets.map((s) => ({ mine: Number(s.mine || 0), opponent: Number(s.opponent || 0) }));
  return {
    winnerUid: form.winnerUserId,
    scores: parsed.map((s) => (submitterIsP1 ? [s.mine, s.opponent] : [s.opponent, s.mine]) as [number, number]),
    walkover: parsed.every((s) => s.mine === 0 && s.opponent === 0),
    court: form.court.trim(),
  };
};

/** What to tell the person who submitted, when their result didn't simply apply. Null = it did. */
export const resultNotice = (r: RecordResponse): string | null => {
  if (r.inDispute) return 'Your opponent already recorded a different winner. An organizer will approve or reject your score, and the first result stands until then.';
  if (r.recordedOnly) return 'A result is already recorded. Yours was saved on record; only a closer score replaces it.';
  return null;
};

/** A disputed match as the organizer's panel shows it: the standing result and the disputing one. */
export type DisputeRow = { id: string; players: string; standing: string; disputing: string };

type DisputedMatch = Pick<TournamentMatch, 'id' | 'player_1_uid' | 'player_1_name' | 'player_2_name' | 'winner_name'> &
  Partial<Pick<TournamentMatch, 'set_1_player_1' | 'set_1_player_2' | 'set_2_player_1' | 'set_2_player_2' | 'set_3_player_1' | 'set_3_player_2'>> & {
    dispute_uid?: string;
    result_submissions?: Record<string, { winner_uid: string; sets?: Record<string, { player_1: number; player_2: number }> }>;
  };

export const disputeRow = (m: DisputedMatch): DisputeRow => {
  const sub = m.dispute_uid ? m.result_submissions?.[m.dispute_uid] : undefined;
  const nameOf = (uid?: string) => toTitleCase((uid === m.player_1_uid ? m.player_1_name : m.player_2_name) || '—');
  const subScore = sub?.sets
    ? formatSetScores(Object.fromEntries([1, 2, 3].flatMap((i) => [
      [`set_${i}_player_1`, sub.sets?.[`set_${i}`]?.player_1 ?? 0],
      [`set_${i}_player_2`, sub.sets?.[`set_${i}`]?.player_2 ?? 0],
    ])))
    : '';
  return {
    id: m.id,
    players: `${toTitleCase(m.player_1_name)} vs ${toTitleCase(m.player_2_name)}`,
    standing: `${toTitleCase(m.winner_name || '—')} won${formatSetScores(m) ? ` · ${formatSetScores(m)}` : ''}`,
    disputing: sub
      ? `${nameOf(m.dispute_uid)} says ${nameOf(sub.winner_uid)} won${subScore ? ` · ${subScore}` : ''}`
      : 'Entered before this change, so the other score was not saved. Reject it and ask the players to re-enter.',
  };
};
