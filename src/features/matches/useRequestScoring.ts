import { useState } from 'react';
import type { ComponentProps, FormEvent } from 'react';
import type { ScoreModal } from './ScoreModal';
import type { ScoreForm } from '../../pages/tournament/types';
import { recordScore, resultFromForm, resultNotice } from './scoring';

export type ScoreKind = 'challenge' | 'rally' | 'tournament';

export type ScoreTarget = {
  kind: ScoreKind;
  /** The rally, challenge or tournament match doc being scored. */
  docId: string;
  opponent: { uid: string; name: string };
  viewerIsP1: boolean;
  /** Present when correcting a recorded score: the winner stays, only the games change. */
  edit?: { winnerUid: string; sets: [number, number][] };
  title?: string;
  /** An organizer recording for both players, from player 1's side; may enter a walkover or reset. */
  organizer?: { player1: { uid: string; name: string }; onReset?: () => Promise<void> };
  court?: string;
};

export type ScoreModalProps = ComponentProps<typeof ScoreModal>;

export const blankScoreForm = (matchDocId: string): ScoreForm => ({
  matchDocId,
  winnerUserId: '',
  sets: [{ mine: '', opponent: '' }, { mine: '', opponent: '' }, { mine: '', opponent: '' }],
  court: '',
});

const SUBMIT_NOTE: Record<ScoreKind, string> = {
  tournament: 'It counts as soon as you submit. If your opponent records a different winner, an organizer approves or rejects theirs.',
  challenge: 'It counts as soon as you submit. If your opponent records a different winner, an organizer approves or rejects theirs.',
  rally: 'It counts as soon as you submit. The winner gets 2 points and the loser 1. Level sets are a draw: 1 point each.',
};
const EDIT_NOTE = "Correct the games. The winner stays as recorded, so the points don't change. Only the player who entered the score can widen it; a closer score always replaces it.";

/**
 * One score sheet for rallies, challenges and tournament matches, submitted or corrected. Shared by
 * the Matches page, the Player Dash and the Tournament page. Every kind goes through the same
 * scoreMatch call. `onSaved` gets the server's notice (a dispute, a kept score) or null.
 */
export function useRequestScoring(me: { uid: string; name: string } | null, onSaved?: (notice: string | null) => void) {
  const [target, setTarget] = useState<ScoreTarget | null>(null);
  const [form, setForm] = useState<ScoreForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setTarget(null); setForm(null); setError(null); };

  const open = (t: ScoreTarget) => {
    const next = { ...blankScoreForm(t.docId), court: t.court ?? '' };
    if (t.edit) {
      const recorded = t.edit.sets;
      next.winnerUserId = t.edit.winnerUid;
      next.sets = [0, 1, 2].map((i) => {
        const [p1, p2] = recorded[i] ?? [0, 0];
        const mine = t.viewerIsP1 ? p1 : p2;
        const opp = t.viewerIsP1 ? p2 : p1;
        return { mine: mine ? String(mine) : '', opponent: opp ? String(opp) : '' };
      });
    }
    setError(null);
    setTarget(t);
    setForm(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!me || !target || !form) return;
    try {
      const res = await recordScore({ matchId: target.docId }, resultFromForm(form, target.viewerIsP1));
      const notice = resultNotice(res);
      if (notice) { setError(notice); onSaved?.(notice); return; }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your score. Please try again.');
      return;
    }
    close();
    onSaved?.(null);
  };

  const defaultTitle = (kind: ScoreKind) =>
    kind === 'challenge' ? 'Challenge' : kind === 'rally' ? 'Record Match' : 'Tournament Match';

  const modalProps: ScoreModalProps | null = me && target && form ? {
    matchInfo: {
      title: target.title ?? defaultTitle(target.kind),
      player1: target.organizer?.player1 ?? { uid: me.uid, name: me.name },
      player2: target.opponent,
    },
    scoreForm: form,
    onChange: (f: ScoreForm) => { setError(null); setForm(f); },
    onClose: close,
    onSubmit: submit,
    error,
    note: target.organizer ? undefined : target.edit ? EDIT_NOTE : SUBMIT_NOTE[target.kind],
    isCreatorSubmit: !!target.organizer,
    onReset: target.organizer?.onReset,
    lockedWinnerUid: target.edit?.winnerUid,
    drawAllowed: target.kind === 'rally',
  } : null;

  return { open, close, target, modalProps };
}
