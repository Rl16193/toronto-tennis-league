/**
 * Collection: contacts — one doc per user, id = uid.
 *
 * Split out of `users`, which is world-readable, so one unauthenticated getDocs returned every
 * member's phone and email. `contacts` requires a signed-in caller. Field names deliberately
 * match the old `users` shape, so consumers only changed which collection they read.
 */
/** The three channels ContactOpponentButton can offer. Keys match its `Channel.key`. */
export type ContactMethod = 'email' | 'text' | 'whatsapp';

export interface ContactData {
  email: string;
  // Set only by the account-merge admin script when two signups (different emails) turn out to
  // be the same person — never surfaced or editable in any UI. Checked at the signup email gate
  // so a third signup attempt with this address is caught instead of creating another duplicate.
  secondary_email?: string;
  phone: string;
  /**
   * Channels this member wants to be reached on. Empty/absent = no preference = all are offered.
   * Applied only in `contactChannels()`. Singular name is historical — see CLAUDE.md.
   */
  preferred_mode_of_contact?: ContactMethod[];
  // WhatsApp-specific number (E.164, e.g. "+14165550123") — distinct from `phone` since not
  // everyone's WhatsApp uses the same country/number. Empty/absent when whatsapp_same_as_phone
  // is true, or when the player hasn't set one (falls back to `phone`).
  whatsapp_contact?: string;
  whatsapp_same_as_phone?: boolean;
  /**
   * CONSENT signal, not a visibility control: set when the member ticks "Same As WhatsApp Number"
   * or types a separate one. Decides whether the app offers a Contact button, not who may read
   * this document.
   */
  contactable?: boolean;
  updated_at?: string;
}

// Collection: users — publicly readable. Contact details live in `contacts`, never here.
export interface UserData {
  name: string;
  avatar?: string;
  bio?: string;
  // The league (gender + optional Retired Pro/Juniors suffix) lives on stats.league; this
  // controls whether it's shown on the public player profile card.
  profile_details_visible?: boolean;
  // Up to 3 badge ids the player has chosen to show on their profile and beside their name.
  display_badges?: string[];
  created_at: string;
  isVerified?: boolean;
  welcomeEmailSent?: boolean;
}

// Collection: stats
export interface UserStats {
  name: string;
  skill_level: number;
  tournament_preference: 'Beginners' | 'Challengers' | 'Masters';
  matchesPlayed: number;
  wins: number;
  loses: number;
  leaguePoints26: number;
  tournamentsPlayed: number;
  league: string;
  pointswon: number;
  totalPointsPlayed: number;
  // Denormalised onto stats by functions/rankSnapshot.js (weeklyRankSnapshot) so the profile and
  // leaderboard can show a rank move without reading ranking_history. Optional: a player who has
  // never been in a snapshot has none of them.
  rankPosition?: number;
  rankTrend?: 'up' | 'down' | 'same';
  rankMove?: number;
}

// Collection: preferences
export interface UserPreferences {
  preferred_courts: string[];
  favourite_players: string[];
  scheduling_preference: 'I will schedule matches on my own' | 'Tell me more about matchdays';
  event_creator: boolean;
  preferred_zone: string;
  // The member picked their zone by hand on the profile card. Court edits then stop recomputing
  // `preferred_zone` from `preferred_courts` — silently undoing an explicit choice (and moving
  // them between draws) is exactly what the manual picker exists to prevent.
  preferred_zone_manual?: boolean;
  // Global opt-out for the Resend emails (challenge/rally received/accepted, weekly incomplete-
  // matches digest). Missing/undefined means opted in — only an explicit `false` disables them.
  email_notifications?: boolean;
  // Any number of preset windows (see AvailabilityTag in utils/availability.ts). The only
  // availability representation — the old grid and day/time lists are gone from code and data.
  availability_tags?: string[];
  // Rewards: a stringer is an ordinary account flagged here, with `stringer_id` naming the
  // rewards-catalog entry they own. Same role-flag shape as `event_creator`. It only unlocks
  // the "your shop" coupon list (mark used / flag) — never anything points-related.
  stringer?: boolean;
  stringer_id?: string;
}

// Collection: tasks — self-serve community tasks (Tasks tab). Each completed task is
// worth a fixed number of points; the organizer may un-mark (revoke) a falsely-claimed task.
export interface TaskProgress {
  uid: string;
  name: string;
  profileComplete?: boolean;
  followSocial?: boolean;
  tagPost?: boolean;
  waitingBoard?: boolean;
  courtVisit?: boolean;
  playMatch?: boolean;
  courtSuggestion?: boolean;
  whatsappGroup?: boolean;
  profilePhoto?: boolean;
  joinEvent?: boolean;
  ladderMatch?: boolean;
  queuePhoto?: boolean;
  // Sticky "Community Member Initiation" award flag — written once when every unlocked task is
  // done (worth SETUP_POINTS); cleared only by an organizer revoke.
  setupComplete?: boolean;
  // Milestone tiers from the task catalogue are stored as `true` under their tier id
  // (play5, chal10, streak5, …) — see taskCatalog.ts. Stored counters for the things the app
  // can't derive from other collections live alongside them.
  suggestions?: number;
  courtsVisited?: number;
  zoneComplete?: number;
  boardPhotos?: number;
  queueUpdates?: number;
  volunteerEvents?: number;
  invites?: number;
  meetups?: number;
  visitedAllCourts?: boolean;
  // Group / community bonus points (Matchday, zone sweeps, etc.) — a running total awarded by
  // Cloud Functions (see functions/groupAwards.js); bonusAwards lists the award ids already paid.
  bonusPoints?: number;
  bonusAwards?: string[];
  updatedAt?: string;
  [tierId: string]: unknown;
}

// Combined for convenience in app
/**
 * A member's public profile merged with their contact details, keyed by uid.
 *
 * `users` is public and `contacts` needs a sign-in, but most screens want a name AND a way to
 * reach someone at once. Merge here rather than threading two parallel maps through every
 * component. Contact fields are optional — a signed-out viewer simply has none.
 */
export type MemberInfo = UserData & Partial<ContactData>;

export interface UserProfile {
  id: string;
  user: UserData;
  stats: UserStats;
  preferences: UserPreferences;
  // Own contact details. Falls back to an empty record for legacy accounts whose contacts doc
  // hasn't been backfilled yet — a missing contacts doc must never lock a member out.
  contacts: ContactData;
}

export interface TennisEvent {
  id: string;
  title: string;
  type: string;
  location: string;
  creator_id?: string;
  date?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  start_date?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  end_date?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  startDate?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  endDate?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  join_last_date?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  recurring_weekly?: boolean;
  recurring?: boolean | string;
  day?: string | string[];
  time?: string;
  skill_level?: string;
  image: string;
  about?: string;
  description?: string;
  organizer?: string;
  round_deadlines?: Record<string, string>; // round → 'YYYY-MM-DD'
  tournament_format?: 'knockout' | 'rr';
  tournament_choice?: 'Singles' | 'Doubles';
  // One-off per-event override: hides the Men's/Women's Retired Pro draw tabs on this event only —
  // the Retired Pro option (drawConfigs.ts) otherwise applies to every Singles tournament.
  hide_seniors?: boolean;
  // Same one-off per-event override, for the Men's/Women's Beginners draw tabs.
  hide_beginners?: boolean;
  // Splits Singles draws by zone (see src/utils/zones.ts's ZONE_NAMES), skill nesting inside each
  // zone. Zones are ALWAYS on now — `enabled` is legacy and ignored by `resolveZoneConfig`, and an
  // absent config just means "the standard seven zones, nothing merged".
  zone_draw_config?: {
    enabled: boolean;
    buckets: { id: string; label: string; zones: string[] }[];
    includeUnassigned: boolean;
    reallocatedAt?: string;
    /** sourceBucketId → targetBucketId. A merged source produces no draws of its own. */
    merges?: Record<string, string>;
  };
}

export interface EventParticipant {
  id: string;
  uid: string;
  user_name?: string;
  event_id: string;
  event_name?: string;
  tournament_choice?: 'Singles' | 'Doubles';
  division?: "Men's" | "Women's" | 'Mixed Doubles';
  doubles?: string;
  partner_in_app?: 'yes' | 'no' | '';
  partner_uid?: string;
  skill?: number;
  // 'Retired Pro' opts the player into the age-based Retired Pro (55+) draw; absent means normal
  // skill-derived routing (Challengers/Masters).
  skill_group?: 'Retired Pro';
  dateselected?: string[];
  created_at: string;
  // Player asked to move zone; `new_zone` is the zone they picked. Per-event on purpose: the
  // notify trigger routes to the organizer via this row's event_id.
  req_zone_change?: boolean;
  new_zone?: string;
  // Soft delete. The organizer removed this player from the draw, but the row stays so we can
  // still see who backed out. Absent/false means active. Removed players are skipped when
  // building draws; their already-played matches and earned stats are untouched.
  removal?: boolean;
  removal_at?: string;
  // Organizer pinned this player to a specific zone bucket, overriding the one derived from their
  // preferred courts. Set when honouring a zone-change request, or to balance a full bracket.
  // Because it's stored here rather than derived, changing preferred courts later can't move them.
  zone_override?: string;
  // Audit trail stamped when this player's zone was merged; routing itself comes from the event's
  // zone config, so late joiners merge automatically. Cleared on unmerge. Separate from
  // `new_zone` (what the PLAYER requested) — a merge must not overwrite a pending request.
  merged_zone?: boolean;
  merged_into?: string;
}
