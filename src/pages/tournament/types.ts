export type DrawTab = 'mens' | 'womens' | 'doubles';
// 'Retired Pro' is age-based (55+, chosen at join time via participant.skill_group), not derived
// from skill_level like Challengers/Masters.
export type SkillGroup = 'Beginners' | 'Challengers' | 'Masters' | 'Retired Pro' | 'All';
// Adjacency order for skill-group merging: only neighboring bands may be merged together
// (Beginners+Challengers, or Challengers+Masters — never Beginners+Masters, never all three).
export const MATCHES_COL = 'matches';
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
export type MatchStatus = 'pending' | 'complete';

export type TemplateMatch = {
  match_id: string;
  round: string;
  player_1: number | string;
  player_2: number | string;
  next_match_id?: string;
  next_slot?: 'player_1' | 'player_2';
};

export type TournamentPlayer = {
  uid: string;
  name: string;
  contact: string;
  preferredContact: 'email' | 'phone';
  participantId: string;
  skillLevel?: number;
  preferredCourts?: string[];
};

export type TournamentMatch = {
  id: string;
  category?: 'singles' | 'doubles' | 'rally' | 'challenge' | 'score_submission';
  event_id: string;
  tournament_choice: 'Singles' | 'Doubles';
  division: string;
  skill_group: SkillGroup;
  // Zone bucket id this match belongs to (see ZoneDrawConfig) — absent for events that never
  // enabled zone draws, or for draws with no zone dimension (doubles).
  zone?: string;
  drawsize: number;
  match_id: string;
  round: string;
  position: number;
  player_1_slot: number | string;
  player_2_slot: number | string;
  player_1_name: string;
  player_1_uid: string;
  player_2_name: string;
  player_2_uid: string;
  winner_name?: string;
  winner_uid?: string;
  set_1_player_1?: number;
  set_1_player_2?: number;
  set_2_player_1?: number;
  set_2_player_2?: number;
  set_3_player_1?: number;
  set_3_player_2?: number;
  next_match_id?: string;
  next_slot?: 'player_1' | 'player_2' | '';
  status: MatchStatus;
  bracket?: string | null;
  started: boolean;
  created_at?: string;
  completed_at?: string;
  score_edited_at?: string;
  format?: TournamentFormat;
  rr_group?: number;
  rr_round?: number;
  rr_advancement_count?: number;
  rr_group_label?: string;
  rr_label_custom?: boolean;
  // Idempotency stamp written on every match of a group in the same batch that pays the group's
  // +5 completion bonus. Its presence is the only proof the bonus was actually paid (the bonus
  // is a separate, best-effort commit) — reversal must check it.
  rr_group_bonus_v2?: boolean;
  walkover?: boolean;
  court?: string;
  // Scheduling — players may edit only these fields (Firestore rules carve-out); scores stay
  // organizer-only. Absent schedule_status is treated as 'unscheduled'.
  schedule_status?: 'unscheduled' | 'scheduled';
  proposed_date?: string; // YYYY-MM-DD
  proposed_slot?: 'AM' | 'PM';
  schedule_requested?: boolean; // player asked the organizer to schedule
};

export type ScoreSubmission = {
  claimed_winner_name: string;
  claimed_winner_uid: string;
  set_1_player_1: number;
  set_1_player_2: number;
  set_2_player_1: number;
  set_2_player_2: number;
  set_3_player_1: number;
  set_3_player_2: number;
  court?: string;
};

export type ScoreForm = {
  matchDocId: string;
  winnerUserId: string;
  sets: Array<{ mine: string; opponent: string }>;
  court: string;
};

// A player-submitted score awaiting the creator's confirmation (stored in the shared matches collection).
export type ScoreSubmissionDoc = ScoreSubmission & {
  id: string;
  category: 'score_submission';
  event_id: string;
  match_id: string;
  match_round: string;
  draw_label: string;
  player_1_name: string;
  player_2_name: string;
  submitted_by: string;
  submitted_by_name: string;
  is_walkover: boolean;
  created_at: string;
};

export type TournamentFormat = 'bracket' | 'rr';

export type RRConfig = {
  advancementCount: 1 | 2;
};

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
