export type User = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  phone: string;
  avatar: string;
  skillLevel: number;
  preferredCourts: string[];
  motto: string;
  stats: {
    wins: number;
    losses: number;
    winRate: number;
  };
  playingHistory: string[];
  favouritePlayers: string[];
};

export type Event = {
  id: string;
  title: string;
  location: string;
  date: string;
  type: 'Tournament' | 'Casual Meetup' | 'Clinic';
  image: string;
};

export type Match = {
  id: string;
  player1: string;
  player2: string;
  score: string;
  winner: string;
};

export type TournamentBracket = {
  id: string;
  round: string;
  matches: Match[];
};
