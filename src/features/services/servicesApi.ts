import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { Timestamp, arrayUnion, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ServiceCategory } from './types';

// Every points-moving action and every booking step is a Cloud Function — the client can't write
// `bookings/*` or points on `stats` directly (see firestore.rules). Each callable throws an HttpsError whose `message` is already player-readable.

const call = <T, R>(name: string) => {
  const fn = httpsCallable<T, R>(functions, name);
  return async (payload: T): Promise<R> => (await fn(payload)).data;
};

// Redeeming also opens a booking with the offer's provider.
export const redeemReward = call<{ rewardId: string }, { code: string; bookingId: string }>('redeemReward');
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
  /** The provider: a member's uid, picked in the Provider field. */
  providerUid: string;
  /** What members see: the business name, or the member's own name. */
  providerName: string;
  /** The business name alone ('' = trades under their own name), stored on providers/{uid}. */
  businessName: string;
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
}

/** Every catalog field the form owns (redeem_booking_id and created_at are left to their writers). */
const serviceFields = (input: NewOfferInput) => ({
  category: input.category,
  sub_category: input.category === 'coaching' ? (input.groupLesson ? 'group' : 'private') : input.category,
  provider_id: input.providerUid,
  provider_name: input.providerName,
  area: input.area,
  offer: input.offer,
  brands: input.brands || '',
  discount: input.discount,
  total_price: input.totalPrice,
  discounted_price: Math.max(0, input.totalPrice - input.discount),
  points_cost: input.pointsCost,
  certified: !!input.certified,
  capacity: input.capacity || 0,
  duration: input.duration || '',
  updated_at: Timestamp.now(),
});

/**
 * "Flag the account": the provider's roles live on providers/{uid}, which only the super admin
 * may write. Merged, so a coach who also strings keeps both roles.
 */
const flagProvider = async (batch: ReturnType<typeof writeBatch>, input: NewOfferInput) => {
  const ref = doc(db, 'providers', input.providerUid);
  const exists = (await getDoc(ref)).exists();
  const now = Timestamp.now();
  batch.set(ref, {
    uid: input.providerUid,
    name: input.businessName,
    roles: arrayUnion(input.category === 'coaching' ? 'coach' : 'stringer'),
    area: input.area,
    ...(exists ? {} : { created_at: now }),
    updated_at: now,
  }, { merge: true });
};

/** Creates a Services offer (`services/{slug}`, the full catalog shape) and flags the provider. */
export async function createOffer(input: NewOfferInput): Promise<string> {
  const offerId = `${slug(input.providerName)}-${slug(input.offer)}`.slice(0, 120);
  const batch = writeBatch(db);
  batch.set(doc(db, 'services', offerId), {
    ...serviceFields(input),
    redeem_booking_id: '',
    active: true,
    created_at: Timestamp.now(),
  });
  await flagProvider(batch, input);
  await batch.commit();
  return offerId;
}

/** Edits an offer in place — same doc id, so bookings (service_id) keep pointing at it. */
export async function updateOffer(id: string, input: NewOfferInput): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'services', id), serviceFields(input));
  await flagProvider(batch, input);
  await batch.commit();
}

/**
 * Soft-delete: services are never hard-deleted (firestore.rules). A deactivated offer drops out of
 * the catalog, but the doc — and every booking's service_id pointing at it — stays intact.
 */
export async function deactivateOffer(id: string): Promise<void> {
  await updateDoc(doc(db, 'services', id), { active: false, updated_at: Timestamp.now() });
}
