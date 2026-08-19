import type { SkillGroup, TournamentMatch } from '../../features/tournament/types';

export type { MatchStatus, SkillGroup, TournamentFormat, TournamentMatch } from '../../features/tournament/types';
export { BYE, DOUBLES_DIVISIONS, PLAYER_LOADING, UNASSIGNED_ZONE_ID } from '../../features/tournament/types';
export type { ZoneBucket, ZoneDrawConfig } from '../../features/tournament/types';

export type DrawTab = 'mens' | 'womens' | 'doubles';
// 'Retired Pro' is age-based (55+, chosen at join time via participant.skill_group), not derived
// from skill_level like Challengers/Masters.
// Adjacency order for skill-group merging: only neighboring bands may be merged together
// (Beginners+Challengers, or Challengers+Masters — never Beginners+Masters, never all three).
export const MATCHES_COL = 'matches';
export const SKILL_GROUP_ORDER: readonly SkillGroup[] = ['Beginners', 'Challengers', 'Masters'];
export type SkillMergePair = 'Beginners+Challengers' | 'Challengers+Masters' | 'Beginners+Challengers+Masters';

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
};

/** A schedule request in the organizer's cross-tournament queue — hence the event title. */
export type ScheduleRequest = TournamentMatch & { event_title: string };

/** An empty slot in the current draw that an unplaced player can be seated into. */
export type OpenDrawSlot = { matchId: string; slot: 'player_1' | 'player_2'; label: string };

/** A registrant seated in no match. `zone` is '' when they've selected no courts — "No zone". */
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
  /** Organizer ticked "Count As No Show" — no winner, 1 point each. RR group stage only. */
  noShow?: boolean;
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
  /**
   * Set once actioned; the doc is KEPT rather than deleted so what each player submitted stays on
   * record. Absent = still awaiting the organizer. 'superseded' means the match was already scored
   * by the time this one was reached — typically the second player's copy of the same result.
   */
  resolved?: 'confirmed' | 'rejected' | 'superseded';
  resolved_at?: string;
  resolved_by?: string;
};

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
