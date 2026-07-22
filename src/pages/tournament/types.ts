export type DrawTab = 'mens' | 'womens' | 'doubles';
export type SkillGroup = 'Challengers' | 'Masters' | 'All';
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
  user_id: string;
  name: string;
  contact: string;
  preferredContact: 'email' | 'phone';
  participantId: string;
  skillLevel?: number;
  preferredCourts?: string[];
};

export type TournamentMatch = {
  id: string;
  event_id: string;
  tournament_choice: 'Singles' | 'Doubles';
  division: string;
  skill_group: SkillGroup;
  drawsize: number;
  match_id: string;
  round: string;
  position: number;
  player_1_slot: number | string;
  player_2_slot: number | string;
  player_1_name: string;
  player_1_user_id: string;
  player_1_contact: string;
  player_2_name: string;
  player_2_user_id: string;
  player_2_contact: string;
  winner_name?: string;
  winner_user_id?: string;
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
  format?: TournamentFormat;
  rr_group?: number;
  rr_round?: number;
  rr_advancement_count?: number;
  rr_group_label?: string;
  rr_label_custom?: boolean;
  walkover?: boolean;
  // Scheduling — players may edit only these fields (Firestore rules carve-out); scores stay
  // organizer-only. Absent schedule_status is treated as 'unscheduled'.
  schedule_status?: 'unscheduled' | 'scheduled';
  proposed_date?: string; // YYYY-MM-DD
  proposed_slot?: 'AM' | 'PM';
  schedule_requested?: boolean; // player asked the organizer to schedule
};

export type ScoreSubmission = {
  claimed_winner_name: string;
  claimed_winner_user_id: string;
  set_1_player_1: number;
  set_1_player_2: number;
  set_2_player_1: number;
  set_2_player_2: number;
  set_3_player_1: number;
  set_3_player_2: number;
};

export type ScoreForm = {
  matchDocId: string;
  winnerUserId: string;
  sets: Array<{ mine: string; opponent: string }>;
};

// A player-submitted score awaiting the creator's confirmation (collection: score_submissions).
export type ScoreSubmissionDoc = ScoreSubmission & {
  id: string;
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
};
