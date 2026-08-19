import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ServiceCategory } from './types';

// Mirror of slug() in scripts/seed-rewards.mjs — keep in sync.
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export interface NewOfferInput {
  category: ServiceCategory;
  /** An existing provider's id (from the catalog), or blank to create a new provider. */
  providerId?: string;
  providerName: string;
  area: string;
  phone?: string;
  email?: string;
  certified?: boolean;
  offer: string;
  /** Comma-joined, e.g. "Head, Kirschbaum, MSV" — matches Reward.brands. */
  brands?: string;
  totalPrice: number;
  discount: number;
  pointsCost: number;
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
  batch.set(
    doc(db, 'tasks', offerId),
    {
      type: 'offer',
      category: input.category,
      provider_id: providerId,
      provider_name: input.providerName,
      ...(input.linkUid ? { uid: input.linkUid } : {}),
      ...(input.phone ? { contact_phone: input.phone } : {}),
      ...(input.email ? { contact_email: input.email } : {}),
      area: input.area,
      offer: input.offer,
      ...(input.brands ? { brands: input.brands } : {}),
      discount: input.discount,
      total_price: input.totalPrice,
      discounted_price: discountedPrice,
      points_cost: input.pointsCost,
      ...(input.certified ? { certified: true } : {}),
      active: true,
      sort: Date.now(),
    },
    { merge: true },
  );

  if (input.linkUid) {
    const roleFields =
      input.category === 'coaching'
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
  id: string,
  providerId: string,
  input: Omit<NewOfferInput, 'providerId'>,
): Promise<void> {
  const discountedPrice = Math.max(0, input.totalPrice - input.discount);

  const batch = writeBatch(db);
  batch.update(doc(db, 'tasks', id), {
    category: input.category,
    provider_name: input.providerName,
    ...(input.linkUid ? { uid: input.linkUid } : {}),
    ...(input.phone ? { contact_phone: input.phone } : {}),
    ...(input.email ? { contact_email: input.email } : {}),
    area: input.area,
    offer: input.offer,
    brands: input.brands || '',
    discount: input.discount,
    total_price: input.totalPrice,
    discounted_price: discountedPrice,
    points_cost: input.pointsCost,
    certified: !!input.certified,
  });

  if (input.linkUid) {
    const roleFields =
      input.category === 'coaching'
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
