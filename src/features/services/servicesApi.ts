import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

// Every points-moving action, and the group-lesson cap, is a Cloud Function — the client can't
// write `offers/*`, `redemptions/*` or `group_lessons/*` directly (see firestore.rules).
// Each callable throws an HttpsError whose `message` is already player-readable.

const call = <T, R>(name: string) => {
  const fn = httpsCallable<T, R>(functions, name);
  return async (payload: T): Promise<R> => (await fn(payload)).data;
};

export const redeemReward = call<{ rewardId: string }, { code: string }>('redeemReward');
export const markCouponUsed = call<{ code: string }, { ok: boolean }>('markCouponUsed');
export const flagCoupon = call<{ code: string; note?: string }, { ok: boolean }>('flagCoupon');
export const requestCancellation =
  call<{ code: string; reason?: string }, { ok: boolean }>('requestCancellation');
export const reviewRedemption =
  call<{ code: string; approve: boolean; note?: string }, { ok: boolean }>('reviewRedemption');

// Free monthly group lesson — the 4-spot cap is enforced in a transaction so two people
// tapping Join at once can't both take the last seat.
export const joinGroupLesson = call<Record<string, never>, { ok: boolean; spotsLeft: number }>('joinGroupLesson');
export const leaveGroupLesson = call<Record<string, never>, { ok: boolean; spotsLeft: number }>('leaveGroupLesson');

/** Unwraps a callable rejection into the message the function set, or a generic fallback. */
export const serviceErrorMessage = (err: unknown): string => {
  const msg = (err as { message?: string })?.message;
  return msg && !msg.startsWith('INTERNAL') ? msg : 'Something went wrong. Try again.';
};
