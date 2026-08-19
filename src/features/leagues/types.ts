export type LeagueRow = {
  user_id: string;
  name: string;
  skill_level: number;
  tournamentsPlayed: number;
  matchesPlayed: number;
  wins: number;
  loses: number;
  leaguePoints26: number;
  league: string;
  pointswon: number;
  totalPointsPlayed: number;
  rankTrend: 'up' | 'down' | 'flat';
  rankMove: number;
};
