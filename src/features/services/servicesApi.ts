import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

// Every points-moving action and booking transition is a Cloud Function — the client can't write
// `offers/*`, `redemptions/*`, `services/*` or `bookings/*` directly (see firestore.rules).
// Each callable throws an HttpsError whose `message` is already player-readable.

const call = <T, R>(name: string) => {
  const fn = httpsCallable<T, R>(functions, name);
  return async (payload: T): Promise<R> => (await fn(payload)).data;
};

export const redeemReward = call<{ rewardId: string }, { code: string }>('redeemReward');
export const markCouponUsed = call<{ code: string }, { ok: boolean }>('markCouponUsed');
export const flagCoupon = call<{ code: string; note?: string }, { ok: boolean }>('flagCoupon');
export const requestCancellation = call<{ code: string; reason?: string }, { ok: boolean }>('requestCancellation');
export const reviewRedemption = call<{ code: string; approve: boolean; note?: string }, { ok: boolean }>(
  'reviewRedemption',
);

export const bookService = call<
  { service_id: string; provider_id: string; note?: string },
  { ok: boolean; booking: import('./types').Booking }
>('book');
export const racquetDropped = call<{ booking_id: string }, { ok: boolean }>('racquetDropped');
export const requestBookingCompletion = call<{ booking_id: string }, { ok: boolean }>('requestCompletion');
export const confirmBookingCompletion = call<
  { booking_id: string; confirmed: boolean },
  { ok: boolean; status: string }
>('confirmCompletion');
export const cancelLeadBooking = call<{ booking_id: string }, { ok: boolean }>('cancelLead');

/** Unwraps a callable rejection into the message the function set, or a generic fallback. */
export const serviceErrorMessage = (err: unknown): string => {
  const msg = (err as { message?: string })?.message;
  return msg && !msg.startsWith('INTERNAL') ? msg : 'Something went wrong. Try again.';
};
