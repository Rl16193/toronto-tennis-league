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

const unavailable = (): never => {
  throw new Error('Offer administration requires a server-authoritative callable and is not available yet.');
};

/**
 * Offer administration is deliberately dormant. Catalog entries and provider-role changes are
 * privileged writes, so the earlier direct-Firestore implementation could never pass the checked-in
 * Rules safely. Keep these typed boundaries for the existing form while the approved callable remains
 * backlog work; callers fail closed and perform no write.
 */
export async function createOffer(_input: NewOfferInput): Promise<string> {
  return unavailable();
}

export async function updateOffer(
  _id: string,
  _providerId: string,
  _input: Omit<NewOfferInput, 'providerId'>,
): Promise<void> {
  unavailable();
}

export async function deactivateOffer(_id: string): Promise<void> {
  unavailable();
}
