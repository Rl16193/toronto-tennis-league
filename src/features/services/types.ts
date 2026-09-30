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
 * order.
 *
 * Ranking belongs to the provider, not to an offer: an offer row repeats provider_id,
 * provider_name and area, so a rank kept there would be stored several times per provider and
 * drift the moment one row is edited. `Reward.sort` orders offers WITHIN a provider and should
 * keep doing only that.
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

// Collection: tasks, where type === 'offer' — the Services offer catalog.
// Seeded by scripts/seed-rewards.mjs. Offer doc ids must stay stable because issued
// coupons store them in redemptions.reward_id.
export interface Reward {
  id: string;
  category: ServiceCategory;
  /** Groups offers under one provider. Matches preferences.stringer_id / coach_id. */
  provider_id: string;
  provider_name: string;
  /**
   * The provider's own account, so their profile photo can be shown beside their name. Optional:
   * a provider who isn't a member (or hasn't been linked yet) simply falls back to an initial.
   * Without it the only way to resolve provider_id → uid is a full scan of `preferences`.
   */
  uid?: string;
  contact_phone?: string;
  contact_email?: string;
  area: string;
  offer: string;
  /** Free text, e.g. "Head, Kirschbaum, MSV" — rendered as chips. Blank for coaching. */
  brands?: string;
  discount: number;
  total_price: number;
  discounted_price: number;
  points_cost: number;
  /** Coaching only — shown as a credential badge on the provider row. */
  certified?: boolean;
  /**
   * Coaching only. Members book a group lesson like any offer; only the coach sees who booked, and
   * puts the ones they choose into groups on the Provider Dash (functions/bookings.js lessonGroup).
   */
  group_lesson?: boolean;
  /** Group lesson only: the one open redeemed booking. Redeem is blocked for others while set. */
  redeem_booking_id?: string;
  /** Coaching only. 1 for a private lesson, more for a group: a guide, never a limit. Shown as a pill. */
  capacity?: number;
  /** Coaching only, free text, e.g. "1 hr" or "30 min". Shown as a pill. */
  duration?: string;
  active?: boolean;
  sort?: number;
}

export type RedemptionStatus =
  | 'active'            // coupon issued, not yet used
  | 'used'              // provider or organizer burned it
  | 'flagged'           // provider raised a problem — organizer decides
  | 'cancel_requested'  // player asked to undo it — organizer decides
  | 'cancelled'         // undone, points refunded
  | 'refund_declined';  // its booking was cancelled and an organizer kept the points

// Collection: redemptions — doc id IS the coupon code, which is what makes codes unique.
// Written only by the Cloud Functions in functions/rewards.js; read-only to everyone else.
export interface Redemption {
  code: string;
  reward_id: string;
  /** Legacy field name on existing docs; holds the provider id for both categories. */
  stringer_id: string;
  stringer_name: string;
  offer: string;
  discounted_price: number | null;
  points_cost: number;
  uid: string;
  user_name: string;
  status: RedemptionStatus;
  created_at: string;
  used_at?: string;
  used_by?: string;
  flagged_at?: string;
  flag_note?: string;
  cancel_requested_at?: string;
  cancel_reason?: string;
  cancelled_at?: string;
  reviewer_note?: string;
  /** The booking this coupon opened. The coupon moves with it (functions/bookings.js). */
  booking_id?: string;
}

// ─── Bookings ───────────────────────────────────────────────────────────────────────────────

export type BookingStatus = 'lead' | 'in_progress' | 'completed' | 'cancelled';
export type BookingRefund = 'pending' | 'approved' | 'declined';

// Collection: bookings — one job with a provider, opened by Book (regular price) or Redeem
// (points). Written only by functions/bookings.js and rewards.js; the lifecycle is
// functions/lib/bookingState.js.
export interface Booking {
  id: string;
  service_id: string;
  offer: string;
  category: 'stringing' | 'coaching';
  provider_id: string;
  provider_name: string;
  /** The provider's member accounts, stamped at creation. Older bookings don't carry it. */
  provider_uids?: string[];
  /** Booked from a group lesson offer. */
  group_lesson?: boolean;
  /** The coach's group (1, 2, …) while in progress; absent while New. */
  lesson_group?: number;
  uid: string;
  user_name: string;
  price: number;
  points: number;
  redemption_code?: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  /** Stringing only: marked ready, waiting for the member to confirm. */
  completion_requested_at?: string;
  reminded_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancelled_by?: 'member' | 'provider';
  /** Only on a cancelled redeemed booking: where the organizer's refund review stands. */
  refund?: BookingRefund;
  refund_reviewed_at?: string;
}

export const OPEN_BOOKING_STATUSES: BookingStatus[] = ['lead', 'in_progress'];

export type BookingStage = 'new' | 'in_progress' | 'confirming' | 'completed' | 'cancelled';

/** The step a booking is at, as both dashes show it. */
export const bookingStage = (b: Booking): BookingStage => {
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

