import { EventParticipant, UserData } from '../../types';
import { parseValidDate, type FirestoreDateLike } from '../../utils/eventDates';
import { EMAIL_REGEX } from '../../utils/emailRegex';
import { TournamentMatch, TournamentPlayer } from './types';

export const toTitleCase = (s: string) =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

/**
 * "Juan Diego Albarracin" → "Juan D", "Erick Mata" → "Erick M". First word, then the initial of the
 * next one; anything after that is dropped, so a three-part name is no longer than a two-part one.
 *
 * Used for names in lists, tables and match rows, where a doubles label is two of these joined and
 * was truncating. A profile shows the full name — see `formatPlayerName`'s `full` option.
 *
 * A single-word name ("Kai") is returned as-is: there is no initial to add, and "Kai" is already
 * as short as it gets.
 */
export const abbreviatePlayerName = (s: string) => {
  const parts = toTitleCase(s.trim()).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}`;
};

/** 'Singles' | 'Doubles' of a registration — the draw key's first segment. */
export const choiceOf = (p: Pick<EventParticipant, 'category'>): 'Singles' | 'Doubles' =>
  (p.category === 'doubles_tournament' ? 'Doubles' : 'Singles');

/** 'Singles' | 'Doubles' of a match. */
export const choiceOfMatch = (m: Pick<TournamentMatch, 'sub_category'>): 'Singles' | 'Doubles' =>
  (m.sub_category === 'doubles' ? 'Doubles' : 'Singles');

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

/** How long after a result lands the player who entered it may still fix its games. */
export const SCORE_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A match drawn client-side before the draw is generated (not a Firestore doc). */
export const isPreviewMatch = (m: Pick<TournamentMatch, 'id'>) => m.id.startsWith('preview_');

/** A match's order within its round or group: the trailing number of `match_id` (`m3`, `rr_g2_m4`). */
export const matchNumber = (matchId?: string) => Number(/(\d+)$/.exec(matchId || '')?.[1] ?? 0);

export const byMatchNumber = (a: Pick<TournamentMatch, 'match_id'>, b: Pick<TournamentMatch, 'match_id'>) =>
  matchNumber(a.match_id) - matchNumber(b.match_id);

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

/** "(1) Name" for a seeded player; the name alone otherwise. */
export const withSeed = (name: string, seed?: number) => (seed ? `(${seed}) ${name}` : name);

/** Every uid on a match: both slots and, for doubles, their partners. */
export const matchUids = (...players: Array<Pick<TournamentPlayer, 'uid' | 'partnerUid'> | null | undefined>) =>
  [...new Set(players.flatMap((p) => [p?.uid, p?.partnerUid]).filter((u): u is string => !!u))];

export const deleteKey = <T extends Record<string, unknown>>(obj: T, key: string): T => {
  const next = { ...obj };
  delete next[key];
  return next;
};
