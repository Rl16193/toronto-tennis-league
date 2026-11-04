import type { Timestamp } from 'firebase/firestore';

/**
 * Shared collection types, v3 shape (DATA_DICTIONARY_v3.csv). Every doc in a collection carries
 * every field; a field that doesn't apply holds a typed empty ('' / 0 / false / [] / {}), and a
 * timestamp for something that hasn't happened yet is null. Dates are Firestore Timestamps.
 */

/** The three channels ContactOpponentButton can offer. Keys match its `Channel.key`. */
export type ContactMethod = 'email' | 'text' | 'whatsapp';

// Collection: contacts — one doc per user, id = uid. PII split out of the world-readable `users`.
export interface ContactData {
  email: string;
  // Set only by the account-merge admin script; checked at the signup email gate.
  secondary_email?: string;
  phone: string;
  /** Channels this member wants to be reached on. Empty = no preference = all are offered. */
  preferred_mode_of_contact?: ContactMethod[];
  // WhatsApp number (E.164). "Same as phone" copies the phone here on save.
  whatsapp_contact?: string;
  /** CONSENT signal: whether the app offers a Contact button, not who may read this doc. */
  contactable?: boolean;
  updated_at?: Timestamp | null;
  /** Last agreement to the Terms and Privacy Policy; null = never. See PRIVACY_EFFECTIVE. */
  consent_at?: Timestamp | null;
}

// Collection: users — publicly readable. Contact details live in `contacts`, never here.
export interface UserData {
  uid?: string;
  name: string;
  avatar?: string;
  bio?: string;
  // Up to 3 badge ids the player has chosen to show on their profile and beside their name.
  display_badges?: string[];
  created_at: Timestamp | null;
  lastActive?: Timestamp | null;
}

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'none';

// Collection: stats — scoring record, task counters (tasks merged in) and points spent (offers merged in).
export interface UserStats {
  uid?: string;
  name: string;
  skill_level: number;
  league: string;
  /** Current season: results + RR group bonus + half of last season carried in. */
  leaguePoints: number;
  /** Last season's final leaguePoints. */
  leaguePointsPrev?: number;
  matchesPlayed: number;
  wins: number;
  pointswon: number;
  totalPointsPlayed: number;
  tournamentsPlayed: number;
  rankPosition?: number;
  rankTrend?: 'up' | 'down' | 'flat';
  rankMove?: number;
  rankUpdatedAt?: Timestamp | null;
  // The member's own one-time task states.
  profilePhoto?: boolean;
  profileComplete?: boolean;
  whatsappGroup?: boolean;
  followSocial?: boolean;
  tagPost?: boolean;
  // Task counters (server-written; a tier is reached when its counter is).
  eventsJoined?: number;
  challengesPlayed?: number;
  challengesWon?: number;
  courtsVisited?: number;
  zoneComplete?: number;
  suggestions?: number;
  boardPhotos?: number;
  queueUpdates?: number;
  currentStreak?: number;
  bestStreak?: number;
  monthsActive?: number;
  active_months?: string[];
  volunteerClaimed?: number;
  volunteerApproved?: number;
  latestVolunteerStatus?: ClaimStatus;
  inviteClaimed?: number;
  inviteApproved?: number;
  latestInviteStatus?: ClaimStatus;
  hostClaimed?: number;
  hostApproved?: number;
  latestHostStatus?: ClaimStatus;
  /** RS points: tiers reached + initiation + task awards (server-recomputed). */
  rsPoints?: number;
  pointsSpent?: number;
  updated_at?: Timestamp | null;
}

// Collection: preferences — playing preferences only (roles live on providers).
export interface UserPreferences {
  uid?: string;
  preferred_courts: string[];
  custom_courts?: string[];
  favourite_players: string[];
  preferred_zone: string;
  // Global opt-out for the Resend emails; only an explicit `false` disables them.
  email_notifications?: boolean;
  availability_tags?: string[];
}

export type ProviderRole = 'stringer' | 'coach' | 'organizer';

// Collection: providers — id = the member's uid. Only the super admin grants roles.
export interface ProviderDoc {
  uid: string;
  name: string;
  roles: ProviderRole[];
  area?: string;
}

/** A member's public profile merged with their contact details, keyed by uid. */
export type MemberInfo = UserData & Partial<ContactData>;

export interface UserProfile {
  id: string;
  user: UserData;
  stats: UserStats;
  preferences: UserPreferences;
  contacts: ContactData;
  /** The member's roles (providers/{uid}); [] for most members. */
  roles: ProviderRole[];
}

export type EventCategory = 'singles_tournament' | 'doubles_tournament' | 'ladder' | 'social' | 'coaching_clinic';
export type EventFormat = 'rr' | 'knockout' | 'challenge' | 'meetup' | 'special' | 'one_off';

export interface ZoneDrawConfig {
  enabled?: boolean;
  buckets: { id: string; label: string; zones: string[] }[];
  includeUnassigned: boolean;
  reallocatedAt?: string;
  /** sourceBucketId → targetBucketId. A merged source produces no draws of its own. */
  merges?: Record<string, string>;
}

/** A one-group round robin's named winner: the leader, by the group table (a title, no points). */
export type GroupChampion = { uids: string[]; name: string; awarded_at: Timestamp; awarded_by: string };

export interface TennisEvent {
  id: string;
  category: EventCategory;
  /** The format: rr | knockout (tournaments), challenge (ladder), meetup | special (social), one_off (clinic). */
  sub_category: EventFormat;
  title: string;
  about?: string;
  location: string;
  image: string;
  skill_level?: string;
  organizer?: string;
  /** Everyone who manages the event, the creator first. Only the super admin changes it. */
  organizer_ids: string[];
  start_date: Timestamp | null;
  end_date: Timestamp | null;
  join_last_date?: Timestamp | null;
  time?: string;
  round_deadlines?: Record<string, string>; // round → 'YYYY-MM-DD'
  zone_draw_config?: ZoneDrawConfig | Record<string, never>;
  /** drawKey (RR knockout: `${drawKey}__knockout`) → uid → seed, frozen when the draw is generated. */
  seeds?: Record<string, Record<string, number>>;
  /** Merged draw's drawKey → the bands it holds ('Beginners+Challengers', …), saved at Generate. */
  skill_merges?: Record<string, 'Beginners+Challengers' | 'Challengers+Masters' | 'Beginners+Challengers+Masters'>;
  /** Server-written when the event's final is played: the authoritative "this event is over". */
  completed_at?: Timestamp | null;
  /** Draw key → that draw's named winner, for a round robin of one group with no knockout. Server-written. */
  champions?: Record<string, GroupChampion>;
  /** 'cancelled' hides the event everywhere (isCancelledEvent). */
  status?: 'active' | 'cancelled';
  cancelled_at?: Timestamp | null;
  /** Invitation only: no Join button, and the rules refuse a member registering themselves. */
  private?: boolean;
  created_at?: Timestamp | null;
}

export type Division = "Men's" | "Women's" | 'Mixed Doubles' | "Men's Retired Pro" | "Women's Retired Pro" | "Men's Juniors" | "Women's Juniors";

export interface EventParticipant {
  id: string;
  uid: string;
  user_name?: string;
  event_id: string;
  event_name?: string;
  /** The entry this player made. */
  category: EventCategory;
  /** Mirrors the event's format. */
  sub_category: EventFormat;
  division?: Division | '';
  skill?: number;
  /** Partner's uid (real or guest_…); '' on a doubles entry = looking for a partner (the pool). */
  partner_uid?: string;
  partner_name?: string;
  status: 'active' | 'withdrawn' | 'cancelled';
  withdrawn_reason?: 'wrong_zone' | 'unavailable' | 'other' | '';
  withdrawn_at?: Timestamp | null;
  withdrawn_by?: string;
  created_at: Timestamp | null;
}
