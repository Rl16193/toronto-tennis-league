import type { Timestamp } from 'firebase/firestore';

// Services = things members can spend points on, or just browse and book at regular price.
export type ServiceCategory = 'stringing' | 'coaching' | 'others';

export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  stringing: 'Stringing',
  coaching: 'Coaches',
  others: 'Others',
};

/**
 * Banner shown at the top of each category on the Services page.
 *
 * Bundled in `public/services/` rather than Firebase Storage, deliberately: there are three of
 * them, they belong to the category and not to any provider, and they change about never. A file
 * in `public/` needs no upload, no download URL, no security rule, and no extra round-trip before
 * it can paint.
 *
 * EMPTY is a supported state — the category simply renders without a banner. To switch one on,
 * drop the file in `public/services/` and name it here.
 */
export const CATEGORY_IMAGE: Record<ServiceCategory, string> = {
  // Capitalisation matters — hosting serves these paths case-sensitively, so a lowercase
  // '/services/stringing.jpg' would 404 against the file actually on disk.
  stringing: '/services/Stringing.jpg',
  coaching: '/services/Coaching.jpg',
  others: '',
};

// ─── Provider ranking and location ──────────────────────────────────────────────────────────────

/**
 * Providers pinned to the top of their category, in this order. Everyone else follows in catalog
 * order. Matched against the slug their offer ids start with (`fortyforty-…`), since a provider's
 * id is now their uid.
 *
 * This is the DEFAULT order only. Once a member searches an address the list sorts purely by
 * distance and the pins lose their place.
 */
export const PINNED_PROVIDERS = ['fortyforty', 'karan'];

/**
 * Approximate centres of the neighbourhoods providers give as their `area`.
 *
 * These are NOT street addresses. A provider carries no address and no coordinates today, so
 * "nearest" can only be answered at neighbourhood resolution — which is the precision the stored
 * data actually has. The UI shows the area name beside a rounded distance so nobody reads the
 * figure as door-to-door. When real addresses exist, geocode each once, store the result on the
 * provider, and prefer it over this table.
 */
export const AREA_COORDS: Record<string, { lat: number; lng: number }> = {
  downtown: { lat: 43.6532, lng: -79.3832 },
  'downtown toronto': { lat: 43.6532, lng: -79.3832 },
  midtown: { lat: 43.7064, lng: -79.3986 },
  'midtown toronto': { lat: 43.7064, lng: -79.3986 },
  'dufferin - west end': { lat: 43.66, lng: -79.435 },
  'west end': { lat: 43.66, lng: -79.435 },
  'north york': { lat: 43.7615, lng: -79.4111 },
  scarborough: { lat: 43.7764, lng: -79.2318 },
  etobicoke: { lat: 43.6205, lng: -79.5132 },
  'east york': { lat: 43.69, lng: -79.33 },
};

/**
 * `area` is free text typed by whoever seeded the provider, so this matches loosely and returns
 * null rather than guessing. A provider we can't place sorts to the END of a distance search — an
 * invented position would rank them against members who are nowhere near them.
 */
export const areaCoords = (area?: string): { lat: number; lng: number } | null => {
  const key = (area ?? '').trim().toLowerCase();
  return key ? AREA_COORDS[key] ?? null : null;
};

// Collection: services — the Services catalog. Bare slug ids, stable because bookings store them
// in service_id. Organizers write it (the offer form); nothing else does.
export type ServiceSubCategory = 'stringing' | 'private' | 'group' | 'others';

export interface Reward {
  id: string;
  category: ServiceCategory;
  /** Coaching: private | group (a group lesson). Otherwise the category. */
  sub_category: ServiceSubCategory;
  /** The provider's uid (their providers doc id and member account). */
  provider_id: string;
  /** Business name shown on the card. */
  provider_name: string;
  area: string;
  offer: string;
  /** Free text, e.g. "Head, Kirschbaum, MSV" — rendered as chips. Blank for coaching. */
  brands: string;
  discount: number;
  total_price: number;
  discounted_price: number;
  points_cost: number;
  /** Shown as a credential badge on the provider row. */
  certified: boolean;
  /** Group lesson only: the one open redeemed booking. Redeem is blocked for others while set. */
  redeem_booking_id: string;
  /** Coaching only. 1 for a private lesson, more for a group: a guide, never a limit. Shown as a pill. */
  capacity: number;
  /** Coaching only, free text, e.g. "1 hr" or "30 min". Shown as a pill. */
  duration: string;
  active: boolean;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

/** A group lesson: members book it, the coach groups them on the Provider Dash (lessonGroup). */
export const isGroupLesson = (x: { sub_category?: string }) => x.sub_category === 'group';

// ─── Bookings ───────────────────────────────────────────────────────────────────────────────

export type BookingStatus = 'lead' | 'in_progress' | 'completed' | 'cancelled';
export type BookingRefund = 'pending' | 'approved' | 'declined' | 'none';

// Collection: bookings — one job with a provider, opened by Book (regular price) or Redeem
// (points; the coupon is `redemption_code`). Written only by functions/bookings.js and rewards.js;
// the lifecycle is functions/lib/bookingState.js.
export interface Booking {
  id: string;
  category: 'stringing' | 'coaching';
  sub_category: ServiceSubCategory;
  service_id: string;
  /** The provider's uid; their contacts are contacts/{provider_id}. */
  provider_id: string;
  uid: string;
  user_name: string;
  payment: 'price' | 'points';
  price: number;
  points: number;
  redemption_code: string;
  status: BookingStatus;
  /** The coach's group (1, 2, …) while in progress; 0 while New. */
  lesson_group: number;
  started_at: Timestamp | null;
  /** Marked ready / done, waiting for the member to confirm. */
  completion_requested_at: Timestamp | null;
  completed_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  cancelled_by: 'member' | 'provider' | '';
  cancel_reason: string;
  /** A cancelled booking paid by points: where the organizer's refund review stands. */
  refund: BookingRefund;
  reviewed_by: string;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

/** A booking with the labels read from its service (the booking itself stores neither). */
export type BookingRow = Booking & { offer: string; providerName: string };

export const OPEN_BOOKING_STATUSES: BookingStatus[] = ['lead', 'in_progress'];

export type BookingStage = 'new' | 'in_progress' | 'confirming' | 'completed' | 'cancelled';

/** The step a booking is at, as both dashes show it. */
export const bookingStage = (b: Pick<Booking, 'status' | 'completion_requested_at'>): BookingStage => {
  if (b.status === 'lead') return 'new';
  if (b.status === 'in_progress') return b.completion_requested_at ? 'confirming' : 'in_progress';
  return b.status;
};

/** The provider's buttons and step names, per category. */
export const BOOKING_WORDS = {
  stringing: { start: 'Racquet received', started: 'Received', finish: 'Mark ready' },
  coaching: { start: 'Confirm lesson', started: 'Confirmed', finish: 'Mark done' },
} as const;

/** Cheapest thing in the catalog — drives the "unlock a reward" threshold across the app. */
export const MIN_REWARD_COST = 15;

// Default roster size for a coaching offer marked as a group lesson.
export const GROUP_LESSON_CAPACITY = 4;

