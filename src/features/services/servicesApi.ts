import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ServiceCategory } from './types';

// Every points-moving action and every booking step is a Cloud Function —
// the client can't write `offers/*`, `redemptions/*` or `bookings/*` directly
// (see firestore.rules). Each callable throws an HttpsError whose `message` is already player-readable.

const call = <T, R>(name: string) => {
  const fn = httpsCallable<T, R>(functions, name);
  return async (payload: T): Promise<R> => (await fn(payload)).data;
};

// Redeeming also opens a booking with the offer's provider.
export const redeemReward = call<{ rewardId: string }, { code: string; bookingId: string }>('redeemReward');
export const markCouponUsed = call<{ code: string }, { ok: boolean }>('markCouponUsed');
export const reviewRedemption =
  call<{ code: string; approve: boolean; note?: string }, { ok: boolean }>('reviewRedemption');

// Bookings (functions/bookings.js): book at the regular price, then each step of the job.
type BookingStep = { bookingId: string };
export const bookService = call<{ serviceId: string }, { bookingId: string }>('bookService');
export const startBooking = call<BookingStep, { ok: boolean }>('startBooking');
export const declineBooking = call<BookingStep, { ok: boolean }>('declineBooking');
export const cancelBooking = call<BookingStep, { ok: boolean }>('cancelBooking');
export const finishBooking = call<BookingStep, { ok: boolean }>('finishBooking');
export const confirmBooking = call<BookingStep & { confirmed: boolean }, { ok: boolean }>('confirmBooking');

// Coach only: seat New group lesson bookings in a group, and run that group's lesson.
export const lessonGroup = call<{
  action: 'create' | 'add' | 'remove' | 'done' | 'cancel';
  serviceId: string;
  group?: number;
  bookingIds?: string[];
}, { ok: boolean; group: number }>('lessonGroup');

/** Unwraps a callable rejection into the message the function set, or a generic fallback. */
export const serviceErrorMessage = (err: unknown): string => {
  const msg = (err as { message?: string })?.message;
  return msg && !msg.startsWith('INTERNAL') ? msg : 'Something went wrong. Try again.';
};

// ─── Catalog admin (super admin) ───────────────────────────────────────────────────────────────

// Mirror of slug() in scripts/seed-rewards.mjs — keep in sync.
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export interface NewOfferInput {
  category: ServiceCategory;
  /** An existing provider's id (from the catalog), or blank to create a new provider. */
  providerId?: string;
  providerName: string;
  area: string;
  certified?: boolean;
  offer: string;
  /** Comma-joined, e.g. "Head, Kirschbaum, MSV" — matches Reward.brands. */
  brands?: string;
  totalPrice: number;
  discount: number;
  pointsCost: number;
  /** Coaching only: the coach groups the members who book it (Provider Dash). */
  groupLesson?: boolean;
  /** Coaching only: 1 private, more for a group. 0/undefined means not stated. */
  capacity?: number;
  /** Coaching only, free text, e.g. "1 hr". */
  duration?: string;
  /** Links the provider to a member account, same as scripts/set-stringer.mjs. */
  linkUid?: string;
}

/**
 * Creates a Services offer (`tasks/{id}` with `type: 'offer'`), same doc shape as
 * scripts/seed-rewards.mjs. Optionally links the provider to a member account so they see their
 * own coupons in "Your shop". Both writes require the super-admin (firestore.rules isSuperAdmin()).
 */
export async function createOffer(input: NewOfferInput): Promise<string> {
  const providerId = input.providerId || slug(input.providerName);
  const offerId = `${providerId}-${slug(input.offer)}`.slice(0, 120);
  const discountedPrice = Math.max(0, input.totalPrice - input.discount);

  const batch = writeBatch(db);
  batch.set(doc(db, 'tasks', offerId), {
    type: 'offer',
    category: input.category,
    provider_id: providerId,
    provider_name: input.providerName,
    ...(input.linkUid ? { uid: input.linkUid } : {}),
    area: input.area,
    offer: input.offer,
    ...(input.brands ? { brands: input.brands } : {}),
    discount: input.discount,
    total_price: input.totalPrice,
    discounted_price: discountedPrice,
    points_cost: input.pointsCost,
    ...(input.certified ? { certified: true } : {}),
    ...(input.groupLesson ? { group_lesson: true } : {}),
    ...(input.capacity ? { capacity: input.capacity } : {}),
    ...(input.duration ? { duration: input.duration } : {}),
    active: true,
    sort: Date.now(),
  }, { merge: true });

  if (input.linkUid) {
    const roleFields = input.category === 'coaching'
      ? { coach: true, coach_id: providerId }
      : { stringer: true, stringer_id: providerId };
    batch.set(doc(db, 'preferences', input.linkUid), roleFields, { merge: true });
  }

  await batch.commit();
  return offerId;
}

/**
 * Edits an offer in place — same doc id, so issued coupons (redemptions.reward_id) keep pointing
 * at the right thing. `providerId` doesn't change here; that would move the offer under a
 * different provider row.
 */
export async function updateOffer(
  id: string, providerId: string, input: Omit<NewOfferInput, 'providerId'>,
): Promise<void> {
  const discountedPrice = Math.max(0, input.totalPrice - input.discount);

  const batch = writeBatch(db);
  batch.update(doc(db, 'tasks', id), {
    category: input.category,
    provider_name: input.providerName,
    ...(input.linkUid ? { uid: input.linkUid } : {}),
    area: input.area,
    offer: input.offer,
    brands: input.brands || '',
    discount: input.discount,
    total_price: input.totalPrice,
    discounted_price: discountedPrice,
    points_cost: input.pointsCost,
    certified: !!input.certified,
    // Written unconditionally, unlike create: an edit that unticks Group lesson or clears the
    // duration has to clear the stored value, not leave the old one behind.
    group_lesson: !!input.groupLesson,
    capacity: input.capacity || 0,
    duration: input.duration || '',
  });

  if (input.linkUid) {
    const roleFields = input.category === 'coaching'
      ? { coach: true, coach_id: providerId }
      : { stringer: true, stringer_id: providerId };
    batch.set(doc(db, 'preferences', input.linkUid), roleFields, { merge: true });
  }

  await batch.commit();
}

/**
 * Soft-delete: `tasks/{id}` denies hard deletes unconditionally (firestore.rules). Deactivated
 * offers drop out of the catalog (useServicesCatalog filters `active !== false`) but the doc — and
 * any redemptions.reward_id pointing at it — stay intact.
 */
export async function deactivateOffer(id: string): Promise<void> {
  await updateDoc(doc(db, 'tasks', id), { active: false });
}
