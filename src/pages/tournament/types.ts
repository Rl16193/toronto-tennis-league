export type DrawTab = 'mens' | 'womens' | 'doubles';
export type SkillGroup = 'Challengers' | 'Masters' | 'All';
export type MatchStatus = 'pending' | 'complete' | 'flagged';
export type SubmissionStatus = 'pending' | 'accepted' | 'flagged';

export type TemplateMatch = {
  match_id: string;
  round: string;
  player_1: number | string;
  player_2: number | string;
  next_match_id?: string;
  next_slot?: 'player_1' | 'player_2';
};

export type TournamentTemplate = {
  id: string;
  size?: number;
  drawsize?: number;
  draw_size?: number;
  matches?: TemplateMatch[];
};

export type TournamentPlayer = {
  user_id: string;
  name: string;
  contact: string;
  preferredContact: 'email' | 'phone';
  participantId: string;
};

export type TournamentMatch = {
  id: string;
  event_id: string;
  template_id: string;
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
  next_slot?: 'player_1' | 'player_2';
  status: MatchStatus;
  bracket?: string | null;
  started: boolean;
  created_at?: string;
  completed_at?: string;
};

export type ScoreSubmission = {
  id: string;
  match_doc_id: string;
  match_id: string;
  event_id: string;
  submitted_by: string;
  submitted_by_name: string;
  claimed_winner_name: string;
  claimed_winner_user_id: string;
  set_1_player_1: number;
  set_1_player_2: number;
  set_2_player_1: number;
  set_2_player_2: number;
  set_3_player_1: number;
  set_3_player_2: number;
  points_won_by_submitter: number;
  opponent_points_won: number;
  total_points_played: number;
  status: SubmissionStatus;
  created_at: string;
};

export type ScoreForm = {
  matchDocId: string;
  winnerUserId: string;
  sets: Array<{ mine: string; opponent: string }>;
};

export type DrawConfig = {
  tab: DrawTab;
  label: string;
  tournamentChoice: 'Singles' | 'Doubles';
  division: string;
  skillGroup: SkillGroup;
};
