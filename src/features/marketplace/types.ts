// Member-posted equipment listings — the Rent and Buy/Sell tabs of the Marketplace.
// Distinct from `rewards` (Services), which is a curated catalog only an admin can edit.
export type ListingKind = 'rent' | 'sell';

export type ListingCondition = 'New' | 'Like new' | 'Good' | 'Fair';
export const CONDITIONS: ListingCondition[] = ['New', 'Like new', 'Good', 'Fair'];

/** Available until the poster marks it gone. Sold/rented listings drop to the bottom, greyed. */
export type ListingStatus = 'available' | 'sold' | 'rented';

export const STATUS_LABEL: Record<ListingStatus, string> = {
  available: 'Available',
  sold: 'Sold',
  rented: 'Rented out',
};

// Collection: listings
export interface Listing {
  id: string;
  kind: ListingKind;
  title: string;
  description: string;
  condition: ListingCondition;
  price: number;
  /** Where the buyer collects it. Free text — "Enter Location" in the form. */
  pickup: string;
  /** Rent only: how long the price covers, e.g. "2 weeks". The poster sets the terms. */
  duration?: string;
  /** Storage paths; resolved to download URLs for display. Up to MAX_LISTING_PHOTOS. */
  photo_paths: string[];
  status: ListingStatus;
  uid: string;
  user_name: string;
  created_at: string;
  updated_at?: string;
}

export const MAX_LISTING_PHOTOS = 3;
export const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;

/** "$40 for 2 weeks" for rentals, plain "$40" for sales. */
export const formatListingPrice = (l: Pick<Listing, 'kind' | 'price' | 'duration'>): string => {
  const amount = `$${l.price % 1 === 0 ? l.price : l.price.toFixed(2)}`;
  return l.kind === 'rent' && l.duration?.trim() ? `${amount} for ${l.duration.trim()}` : amount;
};
