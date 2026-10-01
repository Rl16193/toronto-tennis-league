import { Timestamp } from 'firebase/firestore';
import { abbreviatePlayerName, toTitleCase } from '../../features/leagues/useStandings';
import { skillBand } from '../../utils/skillLevels';
import { EventParticipant, MemberInfo, UserData, UserStats } from '../../types';
import { parseValidDate, type FirestoreDateLike } from '../../utils/eventDates';
import { EMAIL_REGEX } from '../../utils/emailRegex';
import { DrawConfig, SkillGroup, SkillMergePair, SKILL_GROUP_ORDER, TemplateMatch, TournamentMatch, TournamentPlayer, UNASSIGNED_ZONE_ID, ZoneBucket, ZoneDrawConfig } from './types';
import { ZONE_NAMES } from '../../utils/zones';

/** 'Singles' | 'Doubles' of a registration — the draw key's first segment. */
export const choiceOf = (p: Pick<EventParticipant, 'category'>): 'Singles' | 'Doubles' =>
  (p.category === 'doubles_tournament' ? 'Doubles' : 'Singles');

/** 'Singles' | 'Doubles' of a match. */
export const choiceOfMatch = (m: Pick<TournamentMatch, 'sub_category'>): 'Singles' | 'Doubles' =>
  (m.sub_category === 'doubles' ? 'Doubles' : 'Singles');

// MIRRORS registrationId in functions/lib/participantSeat.js and the event_participants id rule.
const DOUBLES_ID: Record<string, string> = { "men's": 'mensdoubles', "women's": 'womensdoubles', 'mixed doubles': 'mixeddoubles' };
/** `{eventId}_{uid}`; doubles `{eventId}_{uid}_{mensdoubles|womensdoubles|mixeddoubles}`. */
export const registrationId = (eventId: string, uid: string, category: string, division?: string) =>
  `${eventId}_${uid}${category === 'doubles_tournament' ? `_${DOUBLES_ID[(division || '').toLowerCase()] || 'doubles'}` : ''}`;

/** A doubles partner who is not on the app. */
export const guestUid = () => `guest_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// MIRRORS drawKeyOf / awardIdForGroup in functions/lib/scoring.js: change together, or the Group
// Bonus switch reads a different award doc from the one the server writes.
/** `{eventId}_{drawKey}_{matchId}` → drawKey. */
export const drawKeyOfDoc = (m: Pick<TournamentMatch, 'id' | 'event_id' | 'match_id'>) => {
  const e = m.event_id || '';
  const mid = m.match_id || '';
  return m.id.startsWith(`${e}_`) && m.id.endsWith(`_${mid}`) ? m.id.slice(e.length + 1, -mid.length - 1) : '';
};
export const groupBonusAwardId = (m: Pick<TournamentMatch, 'id' | 'event_id' | 'match_id' | 'group_label'>) =>
  `rr_group_bonus_${m.event_id}_${drawKeyOfDoc(m)}_${String(m.group_label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

// Any doc shape carrying the six set-score fields.
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

/**
 * Absolute player_1/player_2 set fields from ordered [p1, p2] pairs — the one score shape every
 * result uses, tournament or not. Unused sets are written 0 so a re-score leaves no stale set.
 */
export const setFieldsFrom = (pairs: [number, number][]) => ({
  set_1_player_1: pairs[0]?.[0] ?? 0, set_1_player_2: pairs[0]?.[1] ?? 0,
  set_2_player_1: pairs[1]?.[0] ?? 0, set_2_player_2: pairs[1]?.[1] ?? 0,
  set_3_player_1: pairs[2]?.[0] ?? 0, set_3_player_2: pairs[2]?.[1] ?? 0,
});

/** How long after a result lands the player who entered it may still fix its games. */
export const SCORE_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A match drawn client-side before the draw is generated (not a Firestore doc). */
export const isPreviewMatch = (m: Pick<TournamentMatch, 'id'>) => m.id.startsWith('preview_');

export const PLAYER_LOADING = 'Player Loading';
// The picker value for "add a Player Loading placeholder" (never a real uid).
export const PLAYER_LOADING_SENTINEL = '__player_loading__';
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
};

// Derived per-match display state for MatchCard, which both bracket layouts (BracketView and
// BracketAccordion) render — keeps preview/editable/submit-button logic identical between them.
export const getMatchDisplayFlags = (
  match: TournamentMatch,
  opts: {
    editMode?: boolean;
    hasEditHandler: boolean;
    isCreator?: boolean;
    hasSubmitHandler: boolean;
    submittableMatchIds?: Set<string>;
  },
): MatchDisplayFlags => {
  const { editMode, hasEditHandler, isCreator, hasSubmitHandler, submittableMatchIds } = opts;

  const isPreview = isPreviewMatch(match);
  const isPreviewFirstRound = isPreview && match.player_1_slot > 0 && match.player_2_slot > 0;
  const isEditable = !!editMode && hasEditHandler && (!isPreview || isPreviewFirstRound);

  const scoreText = !isPreview && match.status === 'complete' ? formatSetScores(match.result ?? {}) : '';
  const hasBye = match.player_1_name === BYE || match.player_2_name === BYE;
  const hasRealPlayers = !isPreview && !hasBye && !!match.player_1_uid && !!match.player_2_uid;
  // For the creator, also allow submitting when a slot is PLAYER_LOADING (winner pending).
  const hasPlayableSlots = !isPreview && !hasBye && (
    (!!match.player_1_uid || match.player_1_name === PLAYER_LOADING) &&
    (!!match.player_2_uid || match.player_2_name === PLAYER_LOADING)
  );
  const showDot = !isPreview && hasRealPlayers;
  // Creator submit button (also shown for complete matches so creator can overwrite).
  const showCreatorSubmit = !!isCreator && hasSubmitHandler && hasPlayableSlots && !editMode;
  // Player submit: current user is in this match (or doubles teammate), not yet complete.
  const showPlayerSubmit = !isCreator && hasSubmitHandler && hasRealPlayers && !editMode &&
    !!submittableMatchIds?.has(match.id) && match.status !== 'complete';

  return {
    isPreview, isPreviewFirstRound, isEditable, scoreText, hasBye, hasRealPlayers,
    hasPlayableSlots, showDot, showCreatorSubmit, showPlayerSubmit,
  };
};

// Round deadline as a short "Aug 6". Returns '' for missing/malformed input so callers can gate on
// truthiness. Callers add their own "Till " prefix — the bracket views and the PNG export word it
// differently around the date.
export const formatDeadline = (iso?: string): string => {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}`;
};

/**
 * A player's name as the app shows it, abbreviated to "Juan D" by default.
 *
 * Pass `{ full: true }` where the whole name belongs — a profile page or the profile card. A
 * doubles label arrives as "A / B" and each side is abbreviated separately, which is what this was
 * needed for: two full names joined never fit a row.
 *
 * Placeholders (Player Loading, BYE, "Winner of SF1") are returned untouched.
 */
export const formatPlayerName = (value?: string, opts: { full?: boolean } = {}) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (trimmed === PLAYER_LOADING || trimmed === BYE) return trimmed;
  if (trimmed.toLowerCase().startsWith('winner of ')) return trimmed;
  const one = (s: string) => (opts.full ? toTitleCase(s.split(/\s+/).join(' ')) : abbreviatePlayerName(s));
  return trimmed.includes('/')
    ? trimmed.split('/').map((side) => one(side.trim())).filter(Boolean).join(' / ')
    : one(trimmed);
};

const isEmailLike = (value?: string) => !!value && EMAIL_REGEX.test(value);

export const getParticipantDisplayName = (participant: EventParticipant, userData?: UserData) => {
  if (userData?.name && (!participant.user_name || isEmailLike(participant.user_name))) {
    return formatPlayerName(userData.name);
  }
  if (participant.user_name) {
    return isEmailLike(participant.user_name) ? participant.user_name : formatPlayerName(participant.user_name);
  }
  return formatPlayerName(userData?.name || participant.uid || 'Player');
};

// Kept as a thin alias over the canonical parser so the two Firestore-date shapes are handled
// in one place (src/utils/eventDates.ts). Callers pass raw event fields, hence the `unknown`.
export const parseDateValue = (value: unknown) => parseValidDate(value as FirestoreDateLike);

export const getEventDate = (event: { start_date?: unknown; end_date?: unknown }) =>
  parseDateValue(event.start_date || event.end_date);

export const isTournamentStarted = (event: { start_date?: unknown; end_date?: unknown } | null) => {
  const start = event ? getEventDate(event) : null;
  return !!start && start.getTime() <= Date.now();
};

/**
 * A draw or match with NO zone belongs to the default zone. Zones went live mid-event, so groups
 * generated before that carry no `zone` — they are Downtown-Midtown draws, not a fourth category.
 * Treating them separately put running groups outside the zone list and counted "N signed up"
 * twice. Everything that identifies or compares a draw goes through this.
 */
export const effectiveZone = (zone?: string | null): string => zone || zoneBucketId(DEFAULT_ZONE);

/** True for the default zone, including the zone-less pre-zone case. */
export const isDefaultZone = (zone?: string | null): boolean => effectiveZone(zone) === zoneBucketId(DEFAULT_ZONE);

// The default zone deliberately produces the SHORT, pre-zone key, so groups generated before
// zones existed keep their document ids and stay reachable. Do not "fix" this asymmetry by always
// appending the zone — that re-orphans every match already in the database.
export const getDrawKey = (tournamentChoice: string, division: string, skillGroup: SkillGroup, zone?: string) =>
  `${tournamentChoice}_${division}_${skillGroup}${zone && !isDefaultZone(zone) ? `_${zone}` : ''}`.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

// Cross-products a division's skill draws with each zone bucket, making zone a selectable draw
// dimension (e.g. "Men's Beginners — Downtown"). Singles only.
//
// DRAW HIERARCHY: gender → zone → skill → courts.
// Zone is applied BEFORE skill merges, because a merge belongs to one (division, zone).
// `courts` is planned, not implemented — nothing below should assume it exists.
export const buildZoneAwareDrawConfigs = (draws: DrawConfig[], zoneConfig: ZoneDrawConfig | undefined): DrawConfig[] => {
  if (!zoneConfig?.enabled || zoneConfig.buckets.length === 0) return draws;
  const merges = zoneConfig.merges ?? {};
  // A merged-away zone gets no draws of its own — its players are routed into the target's.
  const active = zoneConfig.buckets.filter((b) => !merges[b.id]);
  const buckets = zoneConfig.includeUnassigned
    ? [...active, { id: UNASSIGNED_ZONE_ID, label: 'Unassigned', zones: [] }]
    : active;
  return draws.flatMap((d) => {
    if (d.tournamentChoice !== 'Singles') return [d]; // doubles: zones don't apply
    return buckets.map((b) => ({ ...d, zone: b.id, label: `${d.label} — ${b.label}` }));
  });
};

// The zone a zone-less MATCH belongs to (pre-zone groups, see effectiveZone). Players no longer fall
// back to it: a player whose courts give no Toronto zone plays in the Unassigned draw.
export const DEFAULT_ZONE = 'Downtown - Midtown';

// One bucket per real zone. Zones are a fixed dimension of every tournament now, not something a
// creator opts into and hand-builds, so the bucket list is derived from ZONE_NAMES rather than
// stored per event. A creator's only lever is merging a quiet zone into a neighbour.
export const zoneBucketId = (zone: string) => zone.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
export const DEFAULT_ZONE_BUCKETS: ZoneBucket[] = ZONE_NAMES.map((z) => ({
  id: zoneBucketId(z),
  label: z,
  zones: [z],
}));

/** Follow a zone through merges to the one it plays in. Chains resolve; a cycle bails out. */
export const resolveMergedZone = (bucketId: string, merges: Record<string, string> = {}): string => {
  let current = bucketId;
  const seen = new Set<string>([current]);
  while (merges[current]) {
    const next = merges[current];
    if (seen.has(next)) break;
    seen.add(next);
    current = next;
  }
  return current;
};

/**
 * The zone config actually in force. Zone draws default to ON — an event that never configured
 * zones still gets the standard seven; an explicit `false` from Manage Draw is honoured.
 *
 * Every bucket is kept, including merged-away sources: a player whose zone was merged still has
 * to match a bucket before `zoneBucketFor` can redirect them. Sources are dropped later, in
 * `buildZoneAwareDrawConfigs`, which is what makes them produce no draws.
 */
export const resolveZoneConfig = (cfg: Partial<ZoneDrawConfig> | undefined): ZoneDrawConfig => ({
  ...(cfg ?? { includeUnassigned: false }),
  enabled: cfg?.enabled ?? true,
  buckets: cfg?.buckets?.length ? cfg.buckets : DEFAULT_ZONE_BUCKETS,
  // Always on: it is where players with no Toronto zone (a non-Toronto court) are drawn.
  includeUnassigned: true,
  merges: cfg?.merges ?? {},
});

// Which zone bucket a participant's `preferred_zone` falls into, given the event's zone config.
// Never returns undefined once zones are on — a player whose zone matches no bucket (no courts, or
// only non-Toronto courts) goes to the Unassigned bucket. There is no Downtown default for players.
export const zoneBucketFor = (preferredZone: string | undefined, zoneConfig: ZoneDrawConfig | undefined): string | undefined => {
  if (!zoneConfig?.enabled) return undefined;
  const merges = zoneConfig.merges ?? {};
  const zone = (preferredZone || '').trim();
  // Match against ALL buckets, not the resolved (merge-filtered) list — a player whose own zone
  // was merged away still needs matching before being redirected to the target.
  const all = zoneConfig.buckets.length ? zoneConfig.buckets : DEFAULT_ZONE_BUCKETS;
  const bucket = zone ? all.find((b) => b.zones.includes(zone)) : undefined;
  if (bucket) return resolveMergedZone(bucket.id, merges);
  return UNASSIGNED_ZONE_ID;
};

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

/**
 * Doubles: collapses mutual partner pairs (each row's partner_uid names the other) into one entry,
 * with `partner_name` set to the partner's registered name. A guest partner has no row of their
 * own, so that entry is kept as-is.
 */
export const deduplicateDoublesTeams = (participants: EventParticipant[]): EventParticipant[] => {
  const processed = new Set<string>();
  const result: EventParticipant[] = [];

  for (const p of participants) {
    if (processed.has(p.id)) continue;

    const partner = p.partner_uid
      ? participants.find(
          (o) => !processed.has(o.id) && o.id !== p.id && o.uid === p.partner_uid && o.partner_uid === p.uid,
        )
      : undefined;

    // Use the partner's actual registered name so the bracket shows the real spelling
    result.push(
      partner
        ? { ...p, partner_name: formatPlayerName(partner.user_name) || p.partner_name }
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
  zoneMap: Record<string, string> = {},
  zoneConfig?: ZoneDrawConfig,
): EventParticipant[] => {
  const filtered = participants.filter((p) => {
    // Withdrawn by the organizer (or cancelled) — the row stays for the record, out of every draw.
    if (p.status !== 'active') return false;
    if (choiceOf(p) !== draw.tournamentChoice) return false;
    if (draw.tournamentChoice === 'Doubles' && draw.division === 'All') return true;
    // Retired Pro is its own division ("Men's Retired Pro"), so this also keeps it out of the
    // Beginners/Challengers/Masters draws.
    if (p.division !== draw.division) return false;
    if (draw.tournamentChoice === 'Doubles') return true;
    // ANDed with everything else below — a draw with no `zone` (doubles) skips this check.
    if (draw.zone && zoneBucketFor(zoneMap[p.uid], zoneConfig) !== draw.zone) return false;
    const effectiveSkill = statsMap[p.uid]?.skill_level ?? Number(p.skill || 0);
    // A merged draw only includes the band(s) it was actually merged from — NOT every band —
    // now that there are three real bands instead of one binary split.
    if (draw.skillGroup === 'All') {
      if (!draw.mergedFrom) return true; // no skill dimension (a Retired Pro division draw)
      const bands = draw.mergedFrom.split('+') as SkillGroup[];
      return bands.includes(skillBand(effectiveSkill));
    }
    return skillBand(effectiveSkill) === draw.skillGroup;
  });
  return draw.tournamentChoice === 'Doubles' ? deduplicateDoublesTeams(filtered) : filtered;
};

// True for merged/consolidated draws that need BYE-placement ordering.
export const isSpecialDraw = (draw: DrawConfig): boolean =>
  (draw.tournamentChoice === 'Singles' && draw.skillGroup === 'All') ||
  (draw.tournamentChoice === 'Doubles' && draw.division === 'All');

// Seed order: league points first, then matches played, then name as a stable tiebreak — the same
// ranking the Leaderboard uses, so slot 1 is genuinely the strongest player in the draw. Anyone
// without a stats row scores 0 and sits at the bottom, which is also where the byes land.
export const seedCompare = (statsMap: Record<string, UserStats>) =>
  (a: EventParticipant, b: EventParticipant): number => {
    const sa = statsMap[a.uid ?? ''];
    const sb = statsMap[b.uid ?? ''];
    const points = (sb?.leaguePoints ?? 0) - (sa?.leaguePoints ?? 0);
    if (points !== 0) return points;
    const played = (sb?.matchesPlayed ?? 0) - (sa?.matchesPlayed ?? 0);
    if (played !== 0) return played;
    return (a.user_name || '').localeCompare(b.user_name || '');
  };

// Orders participants by skill/division so early slots face empty high slots → first-round BYEs.
export const sortParticipantsForDraw = (
  participants: EventParticipant[],
  draw: DrawConfig,
  statsMap: Record<string, UserStats> = {},
): EventParticipant[] => {
  if (draw.tournamentChoice === 'Singles' && draw.skillGroup === 'All' && draw.mergedFrom) {
    // Seed the merged bands highest-first (generalizes the old "masters first" rule to any
    // adjacent pair, or all three).
    const bands = (draw.mergedFrom.split('+') as SkillGroup[])
      .sort((a, b) => SKILL_GROUP_ORDER.indexOf(b) - SKILL_GROUP_ORDER.indexOf(a));
    const skillOf = (p: EventParticipant) => statsMap[p.uid]?.skill_level ?? Number(p.skill || 0);
    // Bands stay in strongest-first order; within each band, seed by standings.
    return bands.flatMap((band) =>
      participants.filter((p) => skillBand(skillOf(p)) === band).sort(seedCompare(statsMap)));
  }
  if (draw.tournamentChoice === 'Doubles' && draw.division === 'All') {
    const byeFirst = participants.filter((p) => p.division === "Women's" || p.division === 'Mixed Doubles').sort(seedCompare(statsMap));
    const mens = participants.filter((p) => p.division === "Men's").sort(seedCompare(statsMap));
    return [...byeFirst, ...mens];
  }
  return participants;
};

export const mapParticipantsToPlayers = (participants: EventParticipant[], userMap: Record<string, MemberInfo>): TournamentPlayer[] =>
  participants.map((p) => {
    const userData = userMap[p.uid];
    const baseName = getParticipantDisplayName(p, userData) || 'Player';
    const partnerName = p.partner_name ? formatPlayerName(p.partner_name) : null;
    const name = partnerName ? `${baseName} / ${partnerName}` : baseName;
    return {
      uid: p.uid,
      name,
      participantId: p.id,
      partnerUid: p.partner_uid || undefined,
    };
  });

/** Every uid on a match: both slots and, for doubles, their partners. */
export const matchUids = (...players: Array<Pick<TournamentPlayer, 'uid' | 'partnerUid'> | null | undefined>) =>
  [...new Set(players.flatMap((p) => [p?.uid, p?.partnerUid]).filter((u): u is string => !!u))];

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
    zone?: string;
    drawsize: number;
    allMatches: TemplateMatch[];
    started: boolean;
  },
) => {
  const p1 = typeof tm.player_1 === 'number' ? (slotMap.get(tm.player_1) ?? null) : null;
  const p2 = typeof tm.player_2 === 'number' ? (slotMap.get(tm.player_2) ?? null) : null;
  const now = Timestamp.now();
  // The full v3 match shape: every field present, typed empties where unused.
  return {
    category: 'tournament' as const,
    sub_category: (cfg.tournamentChoice === 'Doubles' ? 'doubles' : 'singles') as 'singles' | 'doubles',
    status: 'accepted' as const,
    player_1_uid: p1?.uid || '',
    player_1_name: p1?.name || (typeof tm.player_1 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_1, cfg.allMatches)),
    player_2_uid: p2?.uid || '',
    player_2_name: p2?.name || (typeof tm.player_2 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_2, cfg.allMatches)),
    participant_uids: matchUids(p1, p2),
    event_id: cfg.eventId,
    winner_uid: '',
    responded_at: null,
    created_at: now,
    updated_at: now,
    match_id: tm.match_id,
    round: tm.round,
    position: index + 1,
    drawsize: cfg.drawsize,
    division: cfg.division,
    skill_group: cfg.skillGroup,
    zone: cfg.zone ?? '',
    format: 'knockout' as const,
    player_1_slot: typeof tm.player_1 === 'number' ? tm.player_1 : 0,
    player_2_slot: typeof tm.player_2 === 'number' ? tm.player_2 : 0,
    next_match_id: tm.next_match_id || '',
    next_slot: (tm.next_slot ?? '') as 'player_1' | 'player_2' | '',
    started: cfg.started,
    group_label: 'knockout',
  };
};

// Returns the full sorted player list for a draw (no size limit — callers slice as needed).
// Order here IS the seeding: index 0 becomes slot 1, which the bracket template puts opposite the
// bottom slot. See `seedCompare` — this used to be alphabetical, which made seeding arbitrary.
export const buildPlayerList = (
  drawParticipants: EventParticipant[],
  draw: DrawConfig,
  statsMap: Record<string, UserStats>,
  userMap: Record<string, MemberInfo>,
): TournamentPlayer[] => {
  if (isSpecialDraw(draw)) {
    return mapParticipantsToPlayers(sortParticipantsForDraw(drawParticipants, draw, statsMap), userMap)
      .filter((p) => p.name);
  }
  return mapParticipantsToPlayers([...drawParticipants].sort(seedCompare(statsMap)), userMap)
    .filter((p) => p.name);
};

// ─── Draw configs ──────────────────────────────────────────────────────────────────────────────

export const VISIBLE_DRAWS: DrawConfig[] = [
  { tab: 'mens', label: "Men's Beginners", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Beginners' },
  { tab: 'mens', label: "Men's Challengers", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Challengers' },
  { tab: 'mens', label: "Men's Masters", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Masters' },
  { tab: 'mens', label: "Men's Retired Pro", tournamentChoice: 'Singles', division: "Men's Retired Pro", skillGroup: 'All' },
  { tab: 'womens', label: "Women's Beginners", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Beginners' },
  { tab: 'womens', label: "Women's Challengers", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Challengers' },
  { tab: 'womens', label: "Women's Masters", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Masters' },
  { tab: 'womens', label: "Women's Retired Pro", tournamentChoice: 'Singles', division: "Women's Retired Pro", skillGroup: 'All' },
  { tab: 'doubles', label: "Men's Doubles", tournamentChoice: 'Doubles', division: "Men's", skillGroup: 'All' },
  { tab: 'doubles', label: "Women's Doubles", tournamentChoice: 'Doubles', division: "Women's", skillGroup: 'All' },
  { tab: 'doubles', label: 'Mixed Doubles', tournamentChoice: 'Doubles', division: 'Mixed Doubles', skillGroup: 'All' },
];

// The strongest band in a merge — Beginners+Challengers is a Challengers draw, anything including
// Masters is a Masters draw. SKILL_GROUP_ORDER runs weakest → strongest, so the highest index wins.
export const highestBandIn = (pair: SkillMergePair): SkillGroup =>
  (pair.split('+') as SkillGroup[])
    .reduce((best, b) => (SKILL_GROUP_ORDER.indexOf(b) > SKILL_GROUP_ORDER.indexOf(best) ? b : best));

// A merged singles skill draw for one adjacent pair (Beginners+Challengers, or
// Challengers+Masters). Replaces the old static MENS/WOMENS_MERGED_DRAW constants now that
// there's more than one possible pair per division.
//
// Named after the strongest band rather than every band glued together: a merged draw plays as
// that band, and "Men's Beginners + Challengers + Masters" was both a mouthful and misleading.
export const buildMergedSkillDraw = (tab: 'mens' | 'womens', division: "Men's" | "Women's", pair: SkillMergePair): DrawConfig => ({
  tab,
  label: `${division} ${highestBandIn(pair)}`,
  tournamentChoice: 'Singles',
  division,
  skillGroup: 'All',
  mergedFrom: pair,
});

export const CONSOLIDATED_DOUBLES_DRAW: DrawConfig = {
  tab: 'doubles',
  label: 'Doubles',
  tournamentChoice: 'Doubles',
  division: 'All',
  skillGroup: 'All',
};
