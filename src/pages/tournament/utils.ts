import { EventParticipant, UserData } from '../../types';
import { DrawConfig, ScoreSubmission, SkillGroup, TemplateMatch, TournamentPlayer } from './types';

export const PLAYER_LOADING = 'Player Loading';
export const BYE = 'BYE';

export const formatPlayerName = (value?: string) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (trimmed === PLAYER_LOADING || trimmed === BYE) return trimmed;
  if (trimmed.toLowerCase().startsWith('winner of ')) return trimmed;
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const isEmailLike = (value?: string) => !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const getParticipantDisplayName = (participant: EventParticipant, userData?: UserData) => {
  if (userData?.name && (!participant.user_name || isEmailLike(participant.user_name))) {
    return formatPlayerName(userData.name);
  }
  if (participant.user_name) {
    return isEmailLike(participant.user_name) ? participant.user_name : formatPlayerName(participant.user_name);
  }
  return formatPlayerName(userData?.name || participant.doubles || participant.user_id || 'Player');
};

export const parseDateValue = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'object' && value !== null && typeof (value as { seconds?: unknown }).seconds === 'number') {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getEventDate = (event: { startDate?: unknown; start_date?: unknown; date?: unknown; endDate?: unknown; end_date?: unknown }) =>
  parseDateValue(event.startDate || event.start_date || event.date || event.endDate || event.end_date);

export const isTournamentStarted = (event: { startDate?: unknown; start_date?: unknown; date?: unknown; endDate?: unknown; end_date?: unknown } | null) => {
  const start = event ? getEventDate(event) : null;
  return !!start && start.getTime() <= Date.now();
};

export const getDrawKey = (tournamentChoice: string, division: string, skillGroup: SkillGroup) =>
  `${tournamentChoice}_${division}_${skillGroup}`.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

export const getDrawSize = (count: number, tournamentChoice: 'Singles' | 'Doubles') => {
  if (tournamentChoice === 'Doubles') return 16;
  if (count <= 8) return 8;
  if (count <= 16) return 16;
  return 32;
};

export const fallbackTemplate = (drawsize: number): TemplateMatch[] => {
  const seedOrder: Record<number, Array<[number, number]>> = {
    8: [[1, 8], [4, 5], [3, 6], [2, 7]],
    16: [[1, 16], [8, 9], [4, 13], [5, 12], [3, 14], [6, 11], [7, 10], [2, 15]],
    32: Array.from({ length: 16 }, (_, i) => [i + 1, 32 - i] as [number, number]),
  };

  const firstRound = seedOrder[drawsize] || seedOrder[8];
  const rounds =
    drawsize === 8 ? ['QF', 'SF', 'F'] :
    drawsize === 16 ? ['R16', 'QF', 'SF', 'F'] :
    ['R32', 'R16', 'QF', 'SF', 'F'];

  const matches: TemplateMatch[] = [];
  let matchNumber = 1;
  let previousRoundIds: string[] = [];

  firstRound.forEach(([p1, p2]) => {
    const matchId = `m${matchNumber++}`;
    previousRoundIds.push(matchId);
    matches.push({ match_id: matchId, round: rounds[0], player_1: p1, player_2: p2 });
  });

  for (let roundIndex = 1; roundIndex < rounds.length; roundIndex += 1) {
    const currentRoundIds: string[] = [];
    for (let i = 0; i < previousRoundIds.length; i += 2) {
      const matchId = `m${matchNumber++}`;
      currentRoundIds.push(matchId);
      matches.push({
        match_id: matchId,
        round: rounds[roundIndex],
        player_1: `winner ${previousRoundIds[i]}`,
        player_2: `winner ${previousRoundIds[i + 1]}`,
      });
      const src1 = matches.find((m) => m.match_id === previousRoundIds[i]);
      const src2 = matches.find((m) => m.match_id === previousRoundIds[i + 1]);
      if (src1) { src1.next_match_id = matchId; src1.next_slot = 'player_1'; }
      if (src2) { src2.next_match_id = matchId; src2.next_slot = 'player_2'; }
    }
    previousRoundIds = currentRoundIds;
  }

  return matches;
};

export const normalizeTemplateMatches = (matches: TemplateMatch[]): TemplateMatch[] => {
  const nextSlotCounts = new Map<string, number>();
  return matches.map((match) => {
    if (!match.next_match_id || match.next_slot) return match;
    const count = nextSlotCounts.get(match.next_match_id) || 0;
    nextSlotCounts.set(match.next_match_id, count + 1);
    return { ...match, next_slot: count === 0 ? ('player_1' as const) : ('player_2' as const) };
  });
};

export const getWinnerPlaceholder = (slot: number | string, matches: TemplateMatch[]) => {
  if (typeof slot !== 'string') return '';
  const sourceMatchId = slot.toLowerCase().match(/winner\s+(.+)/)?.[1]?.trim();
  if (!sourceMatchId) return '';
  const sourceMatch = matches.find((m) => m.match_id.toLowerCase() === sourceMatchId);
  if (!sourceMatch) return `Winner of ${sourceMatchId.toUpperCase()}`;
  const sameRound = matches.filter((m) => m.round === sourceMatch.round);
  const pos = sameRound.findIndex((m) => m.match_id === sourceMatch.match_id) + 1;
  return `Winner of ${sourceMatch.round}${pos}`;
};

export const getContactValue = (userData?: UserData | null) => {
  if (!userData) return '';
  return userData.preferred_mode_of_contact === 'phone' ? userData.phone : userData.email;
};

export const scoresMatch = (a: ScoreSubmission, b: ScoreSubmission) =>
  a.claimed_winner_user_id === b.claimed_winner_user_id &&
  a.total_points_played === b.total_points_played &&
  a.points_won_by_submitter === b.opponent_points_won &&
  a.opponent_points_won === b.points_won_by_submitter &&
  a.set_1_player_1 === b.set_1_player_1 &&
  a.set_1_player_2 === b.set_1_player_2 &&
  a.set_2_player_1 === b.set_2_player_1 &&
  a.set_2_player_2 === b.set_2_player_2 &&
  a.set_3_player_1 === b.set_3_player_1 &&
  a.set_3_player_2 === b.set_3_player_2;

export const filterParticipantsForDraw = (participants: EventParticipant[], draw: DrawConfig): EventParticipant[] =>
  participants.filter((p) => {
    if (p.tournament_choice !== draw.tournamentChoice || p.division !== draw.division) return false;
    if (draw.tournamentChoice === 'Doubles') return true;
    return (Number(p.skill || 0) >= 4 ? 'Masters' : 'Challengers') === draw.skillGroup;
  });

export const mapParticipantsToPlayers = (participants: EventParticipant[], userMap: Record<string, UserData>): TournamentPlayer[] =>
  participants.map((p) => {
    const userData = userMap[p.user_id];
    return {
      user_id: p.user_id,
      name: getParticipantDisplayName(p, userData) || 'Player',
      contact: getContactValue(userData),
      preferredContact: userData?.preferred_mode_of_contact || 'email',
      participantId: p.id,
    };
  });
