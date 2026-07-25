export const AGE_BRACKETS = ['Below 18', '18-25', '25-35', '35-45', '45-55', '55+'] as const;
export type AgeBracket = (typeof AGE_BRACKETS)[number];

// Collection: users
export interface UserData {
  name: string;
  email: string;
  phone: string;
  preferred_mode_of_contact: 'email' | 'phone';
  // WhatsApp-specific number (E.164, e.g. "+14165550123") — distinct from `phone` since not
  // everyone's WhatsApp uses the same country/number. Empty/absent when whatsapp_same_as_phone
  // is true, or when the player hasn't set one (falls back to `phone`).
  whatsapp_contact?: string;
  whatsapp_same_as_phone?: boolean;
  avatar?: string;
  bio?: string;
  // Profile-card extras. The league (gender) itself lives on stats.league; these two control
  // the age bracket and whether league + age are shown on the public player profile card.
  age_bracket?: AgeBracket | '';
  profile_details_visible?: boolean;
  // Up to 3 badge ids the player has chosen to show on their profile and beside their name.
  display_badges?: string[];
  created_at: string;
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
}

// Collection: preferences
export interface UserPreferences {
  // Per-day AM/PM grid, e.g. { MON: ['AM','PM'], SAT: ['PM'] }. Supersedes the two legacy
  // fields below, which are retained for back-compat until the availability backfill runs.
  availability?: Record<string, ('AM' | 'PM')[]>;
  availability_day: string[];
  availability_time: string[];
  preferred_courts: string[];
  favourite_players: string[];
  scheduling_preference: 'I will schedule matches on my own' | 'Tell me more about matchdays';
  event_creator: boolean;
  preferred_zone: string;
}

// Collection: task_progress — self-serve community tasks (Tasks tab). Each completed task is
// worth a fixed number of points; the organizer may un-mark (revoke) a falsely-claimed task.
export interface TaskProgress {
  user_id: string;
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
  climbSpots?: number;
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
export interface UserProfile {
  id: string;
  user: UserData;
  stats: UserStats;
  preferences: UserPreferences;
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
  // One-off per-event override: hides the Men's/Women's Seniors draw tabs on this event only —
  // the Seniors option (drawConfigs.ts) otherwise applies to every Singles tournament.
  hide_seniors?: boolean;
}

export interface EventParticipant {
  id: string;
  user_id: string;
  user_name?: string;
  event_id: string;
  event_name?: string;
  tournament_choice?: 'Singles' | 'Doubles';
  division?: "Men's" | "Women's" | 'Mixed Doubles';
  doubles?: string;
  partner_in_app?: 'yes' | 'no' | '';
  skill?: number;
  // 'Seniors' opts the player into the age-based Seniors (55+) draw; absent means normal
  // skill-derived routing (Challengers/Masters).
  skill_group?: 'Seniors';
  dateselected?: string[];
  createdAt: string;
}
