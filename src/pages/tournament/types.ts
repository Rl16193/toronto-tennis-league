import type { Timestamp } from 'firebase/firestore';
import type { Submission } from '../../features/matches/results';

export type DrawTab = 'mens' | 'womens' | 'doubles';
// Retired Pro is a division ("Men's Retired Pro"), not a skill group: its draw is skill_group 'All'.
export type SkillGroup = 'Beginners' | 'Challengers' | 'Masters' | 'All';
// Adjacency order for skill-group merging: only neighboring bands may be merged together
// (Beginners+Challengers, or Challengers+Masters — never Beginners+Masters, never all three).
export const SKILL_GROUP_ORDER: readonly SkillGroup[] = ['Beginners', 'Challengers', 'Masters'];
export type SkillMergePair = 'Beginners+Challengers' | 'Challengers+Masters' | 'Beginners+Challengers+Masters';

// Divisions a doubles event can be joined in — shared by the join sheet and the creator's
// add-player panel so the two lists can't drift apart.
export const DOUBLES_DIVISIONS = ["Men's", "Women's", 'Mixed Doubles'] as const;

// A zone "bucket" is one or more real zones (see src/utils/zones.ts's ZONE_NAMES) grouped under
// one label — a single unmerged zone has `zones: [thatZoneName]`. Mirrors TennisEvent's
// `zone_draw_config` field shape (src/types.ts).
export type ZoneBucket = { id: string; label: string; zones: string[] };
/**
 * Zones are ALWAYS on — `enabled` is legacy and ignored by `resolveZoneConfig`, which is the only
 * thing that should read this. A tournament can't turn zones off. A zone is either running on its
 * own, or MERGED into another zone: its players play in the target's draws and it produces none of
 * its own. Merging is per-source and reversible, so the target can unmerge one source at a time.
 */
export type ZoneDrawConfig = {
  enabled: boolean;
  buckets: ZoneBucket[];
  includeUnassigned: boolean;
  reallocatedAt?: string;
  /** sourceBucketId → targetBucketId. A source in here produces no draws of its own. */
  merges?: Record<string, string>;
};
// Reserved id for players with no preferred_zone set — always available as a bucket when
// includeUnassigned is true, regardless of what the creator picked for real zones.
export const UNASSIGNED_ZONE_ID = 'unassigned';
// A fixture is created 'accepted' (unplayed); scoreMatch makes it 'complete'.
export type MatchStatus = 'accepted' | 'complete';

export type TemplateMatch = {
  match_id: string;
  round: string;
  player_1: number | string;
  player_2: number | string;
  next_match_id?: string;
  next_slot?: 'player_1' | 'player_2';
};

// No contact fields here — ContactOpponentButton resolves channels from `contacts` at display time.
export type TournamentPlayer = {
  uid: string;
  name: string;
  participantId: string;
  skillLevel?: number;
  preferredCourts?: string[];
  /** Doubles: the partner's uid, so a match's participant_uids carries both of the team. */
  partnerUid?: string;
};

/** A tournament `matches` doc (v3). The result is its applied submission, merged in as `result`. */
export type TournamentMatch = {
  id: string;
  category: 'tournament';
  sub_category: 'singles' | 'doubles';
  status: MatchStatus;
  player_1_uid: string;
  player_1_name: string;
  player_2_uid: string;
  player_2_name: string;
  participant_uids: string[];
  event_id: string;
  winner_uid: string;
  responded_at?: Timestamp | null;
  created_at?: Timestamp | null;
  updated_at?: Timestamp | null;
  match_id: string;
  round: string;
  drawsize: number;
  division: string;
  skill_group: SkillGroup;
  // Zone bucket id; '' for doubles. A zone-less match reads as the default zone (effectiveZone).
  zone: string;
  format: TournamentFormat;
  // Template seed slot; 0 for a slot fed by an earlier round.
  player_1_slot: number;
  player_2_slot: number;
  next_match_id: string;
  next_slot: 'player_1' | 'player_2' | '';
  started: boolean;
  /** RR group name (the group's identity, shown verbatim); 'knockout' otherwise. */
  group_label: string;
  /** In memory only: the applied result entry (useEventResults); null while unplayed. */
  result?: Submission | null;
};

/** An empty slot in the current draw that an unplaced player can be seated into. */
export type OpenDrawSlot = { matchId: string; slot: 'player_1' | 'player_2'; label: string };

/** A registrant seated in no match. `zone` is '' when they've selected no courts — shown as "Unassigned". */
export type UnplacedEntry = {
  participantId: string;
  uid: string;
  name: string;
  eventId: string;
  eventTitle: string;
  division?: string;
  tournamentChoice?: string;
  skill?: number;
  zone: string;
};

export type ScoreForm = {
  matchDocId: string;
  winnerUserId: string;
  sets: Array<{ mine: string; opponent: string }>;
  court: string;
};

export type TournamentFormat = 'knockout' | 'rr';

export type RRStandingRow = {
  name: string;
  userId: string;
  matchWins: number;
  matchLosses: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
  rank: number;
};

export type DrawConfig = {
  tab: DrawTab;
  label: string;
  tournamentChoice: 'Singles' | 'Doubles';
  division: string;
  skillGroup: SkillGroup;
  // Set only on a merged singles skill draw (skillGroup: 'All') — which adjacent pair it merges,
  // so participant-inclusion and BYE-ordering know which two bands to pull from.
  mergedFrom?: SkillMergePair;
  // Zone bucket id (see ZoneDrawConfig) — undefined means the event has no zone dimension, so
  // this draw's key/behavior is byte-identical to how it worked before zones existed.
  zone?: string;
};
