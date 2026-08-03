import { EventParticipant, UserData, UserStats } from '../../types';
import { parseValidDate, type FirestoreDateLike } from '../../utils/eventDates';
import { DrawConfig, SkillGroup, TemplateMatch, TournamentMatch, TournamentPlayer } from './types';

// Format a scheduled match date+slot as e.g. "Jul 4th, 6pm". Shared by the bracket and
// round-robin opponent panels and the schedule controls so they read identically.
export const formatScheduledDate = (d?: string, slot?: string) => {
  if (!d) return slot ?? '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return slot ?? d;
  const day = dt.getDate();
  const sfx = ['th', 'st', 'nd', 'rd'][((day % 100) - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][day % 100] ?? 'th';
  const month = dt.toLocaleDateString(undefined, { month: 'short' });
  return `${month} ${day}${sfx}${slot ? `, ${slot}` : ''}`;
};

// Any doc shape carrying the six set-score fields — a TournamentMatch or a ScoreSubmission(Doc).
type ScoredSets = {
  set_1_player_1?: number; set_1_player_2?: number;
  set_2_player_1?: number; set_2_player_2?: number;
  set_3_player_1?: number; set_3_player_2?: number;
};

export const formatSetScores = (m: ScoredSets): string => {
  const pairs: [number, number][] = [
    [m.set_1_player_1 ?? 0, m.set_1_player_2 ?? 0],
    [m.set_2_player_1 ?? 0, m.set_2_player_2 ?? 0],
    [m.set_3_player_1 ?? 0, m.set_3_player_2 ?? 0],
  ];
  return pairs.filter(([a, b]) => a > 0 || b > 0).map(([a, b]) => `${a}-${b}`).join('  ');
};

export const PLAYER_LOADING = 'Player Loading';
export const BYE = 'BYE';

export type MatchDisplayFlags = {
  isPreview: boolean;
  isPreviewFirstRound: boolean;
  isEditable: boolean;
  scoreText: string;
  hasBye: boolean;
  hasRealPlayers: boolean;
  hasPlayableSlots: boolean;
  showDot: boolean;
  showCreatorSubmit: boolean;
  showPlayerSubmit: boolean;
  alreadySubmitted: boolean;
};

// Derived per-match display state shared by the desktop bracket grid (BracketView) and the
// mobile round accordion (BracketAccordion) — keeps preview/editable/submit-button logic
// identical between the two layouts.
export const getMatchDisplayFlags = (
  match: TournamentMatch,
  opts: {
    editMode?: boolean;
    hasEditHandler: boolean;
    isCreator?: boolean;
    hasSubmitHandler: boolean;
    submittableMatchIds?: Set<string>;
    pendingMatchIds?: Set<string>;
  },
): MatchDisplayFlags => {
  const { editMode, hasEditHandler, isCreator, hasSubmitHandler, submittableMatchIds, pendingMatchIds } = opts;

  const isPreview = match.id.startsWith('preview_') || match.id.startsWith('ll_preview_');
  const isPreviewFirstRound = isPreview &&
    typeof match.player_1_slot === 'number' && typeof match.player_2_slot === 'number';
  const isEditable = !!editMode && hasEditHandler && (!isPreview || isPreviewFirstRound);

  const scoreText = !isPreview && match.status === 'complete' ? formatSetScores(match) : '';
  const hasBye = match.player_1_name === BYE || match.player_2_name === BYE;
  const hasRealPlayers = !isPreview && !hasBye && !!match.player_1_user_id && !!match.player_2_user_id;
  // For the creator, also allow submitting when a slot is PLAYER_LOADING (winner pending).
  const hasPlayableSlots = !isPreview && !hasBye && (
    (!!match.player_1_user_id || match.player_1_name === PLAYER_LOADING) &&
    (!!match.player_2_user_id || match.player_2_name === PLAYER_LOADING)
  );
  const showDot = !isPreview && hasRealPlayers;
  // Creator submit button (also shown for complete matches so creator can overwrite).
  const showCreatorSubmit = !!isCreator && hasSubmitHandler && hasPlayableSlots && !editMode;
  // Player submit: current user is in this match (or doubles teammate), not yet complete.
  const showPlayerSubmit = !isCreator && hasSubmitHandler && hasRealPlayers && !editMode &&
    !!submittableMatchIds?.has(match.id) && match.status !== 'complete';
  const alreadySubmitted = !!pendingMatchIds?.has(match.id);

  return {
    isPreview, isPreviewFirstRound, isEditable, scoreText, hasBye, hasRealPlayers,
    hasPlayableSlots, showDot, showCreatorSubmit, showPlayerSubmit, alreadySubmitted,
  };
};

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

// Kept as a thin alias over the canonical parser so the two Firestore-date shapes are handled
// in one place (src/utils/eventDates.ts). Callers pass raw event fields, hence the `unknown`.
export const parseDateValue = (value: unknown) => parseValidDate(value as FirestoreDateLike);

export const getEventDate = (event: { startDate?: unknown; start_date?: unknown; date?: unknown; endDate?: unknown; end_date?: unknown }) =>
  parseDateValue(event.startDate || event.start_date || event.date || event.endDate || event.end_date);

export const isTournamentStarted = (event: { startDate?: unknown; start_date?: unknown; date?: unknown; endDate?: unknown; end_date?: unknown } | null) => {
  const start = event ? getEventDate(event) : null;
  return !!start && start.getTime() <= Date.now();
};

export const getDrawKey = (tournamentChoice: string, division: string, skillGroup: SkillGroup) =>
  `${tournamentChoice}_${division}_${skillGroup}`.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

// Skill band used to sub-group players within a draw (the TOURNAMENT_OPTIONS tiers):
// Beginners 2–2.5, Challengers 3–3.5, Masters 4–5.
export const skillBand = (skill: number): 'Beginners' | 'Challengers' | 'Masters' =>
  skill < 3 ? 'Beginners' : skill < 4 ? 'Challengers' : 'Masters';

// Derive the display state of a match's scheduling for a given viewer.
export type ScheduleState = {
  status: 'unscheduled' | 'scheduled';
  date?: string;
  slot?: 'AM' | 'PM';
  requested: boolean;
};
export const getScheduleState = (m: TournamentMatch): ScheduleState => ({
  status: m.schedule_status ?? 'unscheduled',
  date: m.proposed_date,
  slot: m.proposed_slot,
  requested: !!m.schedule_requested,
});

export const getDrawSize = (count: number, _tournamentChoice: 'Singles' | 'Doubles') => {
  if (count <= 8) return 8;
  if (count <= 16) return 16;
  return 32;
};

export const fallbackTemplate = (drawsize: number): TemplateMatch[] => {
  const seedOrder: Record<number, Array<[number, number]>> = {
    2: [[1, 2]],
    4: [[1, 4], [3, 2]],
    8: [[1, 8], [4, 5], [3, 6], [2, 7]],
    16: [[1, 16], [8, 9], [4, 13], [5, 12], [3, 14], [6, 11], [7, 10], [2, 15]],
    32: Array.from({ length: 16 }, (_, i) => [i + 1, 32 - i] as [number, number]),
  };

  const firstRound = seedOrder[drawsize] || seedOrder[8];
  const rounds =
    drawsize === 2 ? ['F'] :
    drawsize === 4 ? ['SF', 'F'] :
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

const getContactValue = (userData?: UserData | null) => {
  if (!userData) return '';
  return userData.preferred_mode_of_contact === 'phone' ? userData.phone : userData.email;
};


// Normalise a name string for fuzzy partner matching (case, whitespace, punctuation)
const normalizeForMatch = (name?: string) =>
  (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * For doubles draws: collapses mutual partner pairs into a single representative
 * entry and normalises the `doubles` field to the partner's actual registered name.
 * Participants whose partner has not registered (external partners) are kept as-is.
 */
export const deduplicateDoublesTeams = (participants: EventParticipant[]): EventParticipant[] => {
  const processed = new Set<string>();
  const result: EventParticipant[] = [];

  for (const p of participants) {
    if (processed.has(p.id)) continue;

    const myNorm = normalizeForMatch(p.user_name);
    const partnerNorm = normalizeForMatch(p.doubles);

    // Find the matching partner registration (both must name each other)
    const partner = partnerNorm
      ? participants.find(
          (o) =>
            !processed.has(o.id) &&
            o.id !== p.id &&
            normalizeForMatch(o.user_name) === partnerNorm &&
            normalizeForMatch(o.doubles) === myNorm,
        )
      : undefined;

    // Use the partner's actual registered name so the bracket shows the real spelling
    result.push(
      partner
        ? { ...p, doubles: formatPlayerName(partner.user_name) || p.doubles }
        : p,
    );
    processed.add(p.id);
    if (partner) processed.add(partner.id);
  }

  return result;
};

export const filterParticipantsForDraw = (
  participants: EventParticipant[],
  draw: DrawConfig,
  statsMap: Record<string, UserStats> = {},
): EventParticipant[] => {
  const filtered = participants.filter((p) => {
    if (p.tournament_choice !== draw.tournamentChoice) return false;
    if (draw.tournamentChoice === 'Doubles' && draw.division === 'All') return true;
    if (p.division !== draw.division) return false;
    if (draw.tournamentChoice === 'Doubles') return true;
    if (draw.skillGroup === 'All') return true;
    // Retired Pro is opt-in at join time (age 55+), not skill-derived: a Retired Pro participant
    // belongs ONLY to the Retired Pro draw, and never falls into Challengers/Masters.
    if (p.skill_group === 'Retired Pro') return draw.skillGroup === 'Retired Pro';
    if (draw.skillGroup === 'Retired Pro') return false;
    const effectiveSkill = statsMap[p.user_id]?.skill_level ?? Number(p.skill || 0);
    return (effectiveSkill >= 4 ? 'Masters' : 'Challengers') === draw.skillGroup;
  });
  return draw.tournamentChoice === 'Doubles' ? deduplicateDoublesTeams(filtered) : filtered;
};

// True for merged/consolidated draws that need BYE-placement ordering.
export const isSpecialDraw = (draw: DrawConfig): boolean =>
  (draw.tournamentChoice === 'Singles' && draw.skillGroup === 'All') ||
  (draw.tournamentChoice === 'Doubles' && draw.division === 'All');

// Orders participants by skill/division so early slots face empty high slots → first-round BYEs.
export const sortParticipantsForDraw = (
  participants: EventParticipant[],
  draw: DrawConfig,
  statsMap: Record<string, UserStats> = {},
): EventParticipant[] => {
  if (draw.tournamentChoice === 'Singles' && draw.skillGroup === 'All') {
    const masters = participants.filter((p) => (statsMap[p.user_id]?.skill_level ?? Number(p.skill || 0)) >= 4);
    const challengers = participants.filter((p) => (statsMap[p.user_id]?.skill_level ?? Number(p.skill || 0)) < 4);
    return [...masters, ...challengers];
  }
  if (draw.tournamentChoice === 'Doubles' && draw.division === 'All') {
    const byeFirst = participants.filter((p) => p.division === "Women's" || p.division === 'Mixed Doubles');
    const mens = participants.filter((p) => p.division === "Men's");
    return [...byeFirst, ...mens];
  }
  return participants;
};

export const mapParticipantsToPlayers = (participants: EventParticipant[], userMap: Record<string, UserData>): TournamentPlayer[] =>
  participants.map((p) => {
    const userData = userMap[p.user_id];
    const baseName = getParticipantDisplayName(p, userData) || 'Player';
    const partnerName = p.doubles ? formatPlayerName(p.doubles) : null;
    const name = partnerName ? `${baseName} / ${partnerName}` : baseName;
    return {
      user_id: p.user_id,
      name,
      contact: getContactValue(userData),
      preferredContact: userData?.preferred_mode_of_contact || 'email',
      participantId: p.id,
    };
  });

export const deleteKey = <T extends Record<string, unknown>>(obj: T, key: string): T => {
  const next = { ...obj };
  delete next[key];
  return next;
};

export const buildMatchFields = (
  tm: TemplateMatch,
  index: number,
  slotMap: Map<number, TournamentPlayer>,
  cfg: {
    eventId: string;
    tournamentChoice: 'Singles' | 'Doubles';
    division: string;
    skillGroup: SkillGroup;
    drawsize: number;
    allMatches: TemplateMatch[];
  },
) => {
  const p1 = typeof tm.player_1 === 'number' ? (slotMap.get(tm.player_1) ?? null) : null;
  const p2 = typeof tm.player_2 === 'number' ? (slotMap.get(tm.player_2) ?? null) : null;
  return {
    event_id: cfg.eventId,
    tournament_choice: cfg.tournamentChoice,
    division: cfg.division,
    skill_group: cfg.skillGroup,
    drawsize: cfg.drawsize,
    match_id: tm.match_id,
    round: tm.round,
    position: index + 1,
    player_1_slot: tm.player_1,
    player_2_slot: tm.player_2,
    player_1_name: p1?.name || (typeof tm.player_1 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_1, cfg.allMatches)),
    player_1_user_id: p1?.user_id || '',
    player_1_contact: p1?.contact || '',
    player_2_name: p2?.name || (typeof tm.player_2 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_2, cfg.allMatches)),
    player_2_user_id: p2?.user_id || '',
    player_2_contact: p2?.contact || '',
    next_match_id: tm.next_match_id || '',
    next_slot: (tm.next_slot ?? '') as 'player_1' | 'player_2' | '',
    status: 'pending' as const,
  };
};

// Returns the full sorted player list for a draw (no size limit — callers slice as needed).
export const buildPlayerList = (
  drawParticipants: EventParticipant[],
  draw: DrawConfig,
  statsMap: Record<string, UserStats>,
  userMap: Record<string, UserData>,
): TournamentPlayer[] => {
  if (isSpecialDraw(draw)) {
    return mapParticipantsToPlayers(sortParticipantsForDraw(drawParticipants, draw, statsMap), userMap)
      .filter((p) => p.name);
  }
  return mapParticipantsToPlayers(drawParticipants, userMap)
    .filter((p) => p.name)
    .sort((a, b) => a.name.localeCompare(b.name));
};
