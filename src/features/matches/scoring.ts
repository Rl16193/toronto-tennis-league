import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { ScoreForm } from '../../pages/tournament/types';
import { type Submission, scoreLine } from './results';
import { toTitleCase } from '../../pages/tournament/utils';

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
/** Organizer: one scored match (tournament, challenge or rally) back to unplayed ('accepted'), undoing exactly what it paid. */
export const resetScore = (matchId: string) => call<boolean>('reset', { matchId });
/** Organizer: deletes a draw's matches and undoes everything they and their groups' bonuses paid. */
export const cancelDraw = (eventId: string, matchIds: string[]) => call<number>('cancel', { eventId, matchIds });
/** Organizer: one round-robin group's bonus on or off. Returns how many players it moved. */
export const setGroupBonus = (eventId: string, matchIds: string[], award: boolean) =>
  call<number>('bonus', { eventId, matchIds, award });
/** Organizer: name a one-group round robin's leader as its winner (a title, no points); null takes it back. */
export const setGroupChampion = (eventId: string, matchIds: string[], winnerUid: string | null) =>
  call<boolean>('champion', { eventId, matchIds, winnerUid });

/** Organizer: queues the WhatsApp (SMS fallback) reminder to both players for the next 8:00am (`remindMatch`). Returns how many players. */
export const remindMatch = async (matchId: string) =>
  (await httpsCallable<{ matchId: string }, { sent: number }>(functions, 'remindMatch')({ matchId })).data.sent;

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

/**
 * `disputing` is the match's `submissions` entry with status 'disputed'; `standing` is its applied
 * result (results.ts). The row id is the match id, which is what settleDispute takes.
 */
export const disputeRow = (
  m: { id: string; player_1_uid: string; player_1_name: string; player_2_name: string },
  standing: Submission | undefined,
  disputing: Submission,
): DisputeRow => {
  const nameOf = (uid?: string) => toTitleCase((uid === m.player_1_uid ? m.player_1_name : m.player_2_name) || '—');
  const standingScore = scoreLine(standing);
  const disputingScore = scoreLine(disputing);
  return {
    id: m.id,
    players: `${toTitleCase(m.player_1_name)} vs ${toTitleCase(m.player_2_name)}`,
    standing: standing ? `${toTitleCase(standing.winner_name || '—')} won${standingScore ? ` · ${standingScore}` : ''}` : '—',
    disputing: `${toTitleCase(disputing.user_name || nameOf(disputing.uid))} says ${nameOf(disputing.winner_uid)} won${disputingScore ? ` · ${disputingScore}` : ''}`,
  };
};
