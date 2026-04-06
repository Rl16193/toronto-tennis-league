// Collection: users
export interface UserData {
  name: string;
  email: string;
  phone: string;
  preferred_mode_of_contact: 'email' | 'phone';
  avatar?: string;
  created_at: string;
}

// Collection: stats
export interface UserStats {
  skill_level: number;
  tournament_preference: 'Beginners' | 'Challengers' | 'Masters';
  matches_played: number;
  matches_won: number;
  points_won_percentage: number;
}

// Collection: preferences
export interface UserPreferences {
  availability_day: string[];
  availability_time: string[];
  preferred_courts: string[];
  custom_courts: string[];
  favourite_players: string[];
  scheduling_preference: 'I will schedule matches on my own' | 'Tell me more about matchdays';
  event_creator: boolean;
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
  date?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  start_date?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  end_date?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  startDate?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  endDate?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  recurring_weekly?: boolean;
  recurring?: boolean | string;
  day?: string | string[];
  time?: string;
  skill_level?: string;
  image: string;
  about?: string;
  description?: string;
  organizer?: string;
}

export interface EventParticipant {
  id: string;
  user_id: string;
  user_name?: string;
  event_id: string;
  event_name?: string;
  tournament_choice?: 'Singles' | 'Doubles';
  doubles?: string;
  partner_in_app?: 'yes' | 'no' | '';
  skill?: number;
  createdAt: string;
}
