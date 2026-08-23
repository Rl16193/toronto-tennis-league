// Services = things members can spend points on, or just browse and book at regular price.
export type ServiceCategory = 'stringing' | 'coaching' | 'others';

export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  stringing: 'Stringing',
  coaching: 'Coaches',
  others: 'Others',
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
  active?: boolean;
  sort?: number;
}

export type RedemptionStatus =
  | 'active' // coupon issued, not yet used
  | 'used' // provider or organizer burned it
  | 'flagged' // provider raised a problem — organizer decides
  | 'cancel_requested' // player asked to undo it — organizer decides
  | 'cancelled'; // undone, points refunded

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
}

// A coupon still in play — the player can't redeem the same offer again, and the provider
// still sees it on their list.
export const OPEN_STATUSES: RedemptionStatus[] = ['active', 'flagged', 'cancel_requested'];

/** Cheapest thing in the catalog — drives the "unlock a reward" threshold across the app. */
export const MIN_REWARD_COST = 15;

// ─── Free monthly group lesson ──────────────────────────────────────────────────────────────

/** Collection: group_lessons/{YYYY-MM} — one doc per month, so spots reset on the 1st. */
export interface GroupLesson {
  month: string; // 'YYYY-MM'
  coach_id: string;
  coach_name: string;
  capacity: number;
  players: GroupLessonPlayer[];
}

export interface GroupLessonPlayer {
  uid: string;
  name: string;
  joined_at: string;
}

export const GROUP_LESSON_CAPACITY = 4;

// Mirrors GROUP_LESSON_COACH_PROVIDER_ID in functions/lib/constants.js and the seeded Archie
// provider. The free lesson must never move merely because catalog ordering changes.
export const GROUP_LESSON_PROVIDER_ID = 'archie';

/** Current month key in Toronto time — must match monthKey() in functions/rewards.js. */
export const currentMonthKey = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}`;
};
