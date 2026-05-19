export type JoinFormState = {
  tournamentChoice: 'Singles' | 'Doubles';
  division: '' | "Men's" | "Women's" | 'Mixed Doubles';
  partnerName: string;
  partnerInApp: 'yes' | 'no' | '';
  combinedSkill: string;
  dateselected: string[];
};

export type JoinedRegistration = {
  eventId: string;
  tournamentChoice: '' | 'Singles' | 'Doubles';
};

export type SlotResult = {
  status: 'available' | 'fallback' | 'full';
  match?: import('../../pages/tournament/types').TournamentMatch;
  slot?: 'player_1' | 'player_2';
  skillOverride: number;
  intendedGroup?: string;
  actualGroup?: string;
};

export const INITIAL_JOIN_FORM: JoinFormState = {
  tournamentChoice: 'Singles',
  division: '',
  partnerName: '',
  partnerInApp: '',
  combinedSkill: '',
  dateselected: [],
};
