import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { ServiceCategory } from './types';

export interface NewOfferInput {
  category: ServiceCategory;
  providerId?: string;
  providerName: string;
  area: string;
  phone?: string;
  email?: string;
  certified?: boolean;
  offer: string;
  brands?: string;
  totalPrice: number;
  discount: number;
  pointsCost: number;
  linkUid?: string;
}

const upsertService = httpsCallable(functions, 'upsertService');
const deactivateService = httpsCallable(functions, 'deactivateService');
const servicePayload = (input: NewOfferInput) => ({
  category: input.category,
  provider_id: input.providerId,
  provider_name: input.providerName,
  area: input.area,
  phone: input.phone,
  email: input.email,
  certified: input.certified,
  offer: input.offer,
  brands: input.brands,
  total_price: input.totalPrice,
  discount: input.discount,
  points_cost: input.pointsCost,
});

/** Catalog writes cross the owner-gated callable; provider identity is bootstrapped separately. */
export async function createOffer(input: NewOfferInput): Promise<string> {
  const result = await upsertService(servicePayload(input));
  return (result.data as { id: string }).id;
}

export async function updateOffer(
  id: string,
  providerId: string,
  input: Omit<NewOfferInput, 'providerId'>,
): Promise<void> {
  await upsertService({ id, ...servicePayload({ ...input, providerId } as NewOfferInput) });
}

export async function deactivateOffer(id: string): Promise<void> {
  await deactivateService({ id });
}
