import type { ContactData, EventParticipant, TennisEvent, UserData, UserPreferences, UserStats } from '../types';
import type { TournamentMatch } from '../pages/tournament/types';
import type { ProviderRecord } from '../features/services/types';
import { resolveZoneConfig } from '../features/tournament/domain/placement';

type UnknownRecord = Record<string, unknown>;

export type RoundRobinDraft = {
  groups: string[][];
  custom: boolean[];
  customLabels: string[];
  withdrawn: string[];
};

export const normalizeProvider = (id: string, value: unknown): ProviderRecord | null => {
  const data = record(value);
  const providerId = id.trim();
  const name = string(data.name).trim();
  const roles = strings(data.roles).filter(
    (role): role is ProviderRecord['roles'][number] => role === 'stringer' || role === 'coach' || role === 'other',
  );
  if (!providerId || !name || roles.length === 0) return null;
  return {
    id: providerId,
    name,
    roles: [...new Set(roles)],
    ...(string(data.member_uid).trim() ? { member_uid: string(data.member_uid).trim() } : {}),
    ...(string(data.area).trim() ? { area: string(data.area).trim() } : {}),
    ...(string(data.updated_at) ? { updated_at: string(data.updated_at) } : {}),
  };
};

const record = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {};
const string = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const number = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const boolean = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback);
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

export const normalizeRoundRobinDraft = (value: unknown): RoundRobinDraft => {
  const data = record(value);
  return {
    groups: Array.isArray(data.groups)
      ? data.groups.map((group) => (typeof group === 'string' ? group.split(',').filter(Boolean) : strings(group)))
      : [],
    custom: Array.isArray(data.custom) ? data.custom.filter((item): item is boolean => typeof item === 'boolean') : [],
    customLabels: strings(data.labels),
    withdrawn: strings(data.withdrawn),
  };
};
const optionalString = (value: unknown) => (typeof value === 'string' ? value : undefined);
const optionalNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const dateValue = (value: unknown): TennisEvent['date'] => {
  if (typeof value === 'string') return value;
  const candidate = record(value);
  if (typeof candidate.seconds !== 'number') return undefined;
  return { seconds: candidate.seconds, nanoseconds: number(candidate.nanoseconds) };
};

export const normalizeEvent = (id: string, value: unknown): TennisEvent => {
  const data = record(value);
  const rawConfig = record(data.zone_draw_config);
  const buckets = Array.isArray(rawConfig.buckets)
    ? rawConfig.buckets.flatMap((candidate) => {
        const bucket = record(candidate);
        const bucketId = string(bucket.id).trim();
        if (!bucketId) return [];
        return [{ id: bucketId, label: string(bucket.label, bucketId), zones: strings(bucket.zones) }];
      })
    : [];
  const merges = Object.fromEntries(
    Object.entries(record(rawConfig.merges)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );

  return {
    id,
    title: string(data.title),
    type: string(data.type),
    location: string(data.location),
    image: string(data.image),
    creator_id: optionalString(data.creator_id),
    date: dateValue(data.date),
    start_date: dateValue(data.start_date),
    end_date: dateValue(data.end_date),
    startDate: dateValue(data.startDate),
    endDate: dateValue(data.endDate),
    join_last_date: dateValue(data.join_last_date),
    recurring_weekly: boolean(data.recurring_weekly),
    recurring: typeof data.recurring === 'boolean' || typeof data.recurring === 'string' ? data.recurring : undefined,
    day: typeof data.day === 'string' ? data.day : strings(data.day),
    time: optionalString(data.time),
    skill_level: optionalString(data.skill_level),
    about: optionalString(data.about),
    description: optionalString(data.description),
    organizer: optionalString(data.organizer),
    zones: strings(data.zones),
    round_deadlines: Object.fromEntries(
      Object.entries(record(data.round_deadlines)).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
    tournament_format:
      data.tournament_format === 'rr' ? 'rr' : data.tournament_format === 'knockout' ? 'knockout' : undefined,
    tournament_choice:
      data.tournament_choice === 'Singles' || data.tournament_choice === 'Doubles' ? data.tournament_choice : undefined,
    hide_seniors: boolean(data.hide_seniors),
    hide_beginners: boolean(data.hide_beginners),
    zone_draw_config: resolveZoneConfig({
      enabled: typeof rawConfig.enabled === 'boolean' ? rawConfig.enabled : true,
      buckets,
      includeUnassigned: boolean(rawConfig.includeUnassigned),
      ...(Object.keys(merges).length ? { merges } : {}),
      ...(typeof rawConfig.reallocatedAt === 'string' ? { reallocatedAt: rawConfig.reallocatedAt } : {}),
    }),
  };
};

export const normalizeEventParticipant = (id: string, value: unknown): EventParticipant | null => {
  const data = record(value);
  const uid = string(data.uid).trim();
  const eventId = string(data.event_id).trim();
  if (!uid || !eventId) return null;
  const tournamentChoice =
    data.tournament_choice === 'Singles' || data.tournament_choice === 'Doubles' ? data.tournament_choice : undefined;
  return {
    id,
    uid,
    event_id: eventId,
    created_at: string(data.created_at),
    ...(string(data.user_name) ? { user_name: string(data.user_name) } : {}),
    ...(string(data.event_name) ? { event_name: string(data.event_name) } : {}),
    ...(tournamentChoice ? { tournament_choice: tournamentChoice } : {}),
    ...(typeof data.skill === 'number' && Number.isFinite(data.skill) ? { skill: data.skill } : { skill: undefined }),
    ...(Array.isArray(data.dateselected) ? { dateselected: strings(data.dateselected) } : { dateselected: undefined }),
    ...(data.division === "Men's" || data.division === "Women's" || data.division === 'Mixed Doubles'
      ? { division: data.division }
      : {}),
    doubles: optionalString(data.doubles),
    ...(data.partner_in_app === 'yes' || data.partner_in_app === 'no' || data.partner_in_app === ''
      ? { partner_in_app: data.partner_in_app }
      : {}),
    partner_uid: optionalString(data.partner_uid),
    partner_name: optionalString(data.partner_name),
    ...(data.skill_group === 'Retired Pro' ? { skill_group: 'Retired Pro' as const } : {}),
    req_zone_change: boolean(data.req_zone_change),
    new_zone: optionalString(data.new_zone),
    status: data.status === 'withdrawn' ? 'withdrawn' : 'active',
    withdrawn_reason: ['injury', 'unavailable', 'cannot_contact', 'other'].includes(string(data.withdrawn_reason))
      ? (data.withdrawn_reason as EventParticipant['withdrawn_reason'])
      : undefined,
    withdrawn_note: optionalString(data.withdrawn_note),
    withdrawn_at: optionalString(data.withdrawn_at),
    withdrawn_by: optionalString(data.withdrawn_by),
    zone: optionalString(data.zone),
    removal: boolean(data.removal),
    removal_at: optionalString(data.removal_at),
    zone_override: optionalString(data.zone_override),
    merged_zone: boolean(data.merged_zone),
    merged_into: optionalString(data.merged_into),
  };
};

export const normalizeTournamentMatch = (id: string, value: unknown): TournamentMatch | null => {
  const data = record(value);
  const eventId = string(data.event_id).trim();
  const matchId = string(data.match_id).trim();
  if (!eventId || !matchId) return null;
  const choice = data.tournament_choice === 'Doubles' ? 'Doubles' : 'Singles';
  const status = data.status === 'complete' ? 'complete' : 'pending';
  const category = ['singles', 'doubles', 'rally', 'challenge', 'score_submission'].includes(string(data.category))
    ? (data.category as TournamentMatch['category'])
    : undefined;
  return {
    id,
    category,
    event_id: eventId,
    match_id: matchId,
    tournament_choice: choice,
    division: string(data.division, 'All'),
    skill_group: ['Beginners', 'Challengers', 'Masters', 'Retired Pro', 'All'].includes(string(data.skill_group))
      ? (data.skill_group as TournamentMatch['skill_group'])
      : 'All',
    drawsize: Math.max(0, number(data.drawsize)),
    round: string(data.round),
    position: Math.max(0, number(data.position)),
    player_1_slot: typeof data.player_1_slot === 'string' ? data.player_1_slot : number(data.player_1_slot),
    player_2_slot: typeof data.player_2_slot === 'string' ? data.player_2_slot : number(data.player_2_slot),
    player_1_name: string(data.player_1_name),
    player_1_uid: string(data.player_1_uid),
    player_2_name: string(data.player_2_name),
    player_2_uid: string(data.player_2_uid),
    status,
    started: boolean(data.started),
    zone: optionalString(data.zone),
    winner_name: optionalString(data.winner_name),
    winner_uid: optionalString(data.winner_uid),
    set_1_player_1: optionalNumber(data.set_1_player_1),
    set_1_player_2: optionalNumber(data.set_1_player_2),
    set_2_player_1: optionalNumber(data.set_2_player_1),
    set_2_player_2: optionalNumber(data.set_2_player_2),
    set_3_player_1: optionalNumber(data.set_3_player_1),
    set_3_player_2: optionalNumber(data.set_3_player_2),
    next_match_id: optionalString(data.next_match_id),
    next_slot:
      data.next_slot === 'player_1' || data.next_slot === 'player_2' || data.next_slot === ''
        ? data.next_slot
        : undefined,
    bracket: typeof data.bracket === 'string' || data.bracket === null ? data.bracket : undefined,
    created_at: optionalString(data.created_at),
    completed_at: optionalString(data.completed_at),
    score_edited_at: optionalString(data.score_edited_at),
    score_disputed: boolean(data.score_disputed),
    format: data.format === 'rr' || data.format === 'bracket' ? data.format : undefined,
    rr_group: optionalNumber(data.rr_group),
    rr_round: optionalNumber(data.rr_round),
    rr_advancement_count: optionalNumber(data.rr_advancement_count),
    rr_group_label: optionalString(data.rr_group_label),
    rr_label_custom: boolean(data.rr_label_custom),
    rr_groupbonus: boolean(data.rr_groupbonus),
    walkover: boolean(data.walkover),
    court: optionalString(data.court),
    schedule_status:
      data.schedule_status === 'scheduled'
        ? 'scheduled'
        : data.schedule_status === 'unscheduled'
          ? 'unscheduled'
          : undefined,
    proposed_date: optionalString(data.proposed_date),
    proposed_slot: data.proposed_slot === 'AM' || data.proposed_slot === 'PM' ? data.proposed_slot : undefined,
    schedule_requested: boolean(data.schedule_requested),
  };
};

export const normalizeUserData = (value: unknown): UserData => {
  const data = record(value);
  return {
    name: string(data.name),
    created_at: string(data.created_at),
    avatar: optionalString(data.avatar),
    bio: optionalString(data.bio),
    isVerified: boolean(data.isVerified),
    welcomeEmailSent: boolean(data.welcomeEmailSent),
    ...(Array.isArray(data.display_badges) ? { display_badges: strings(data.display_badges).slice(0, 3) } : {}),
  };
};

export const normalizeUserStats = (value: unknown): UserStats => {
  const data = record(value);
  const preference = ['Beginners', 'Challengers', 'Masters'].includes(string(data.tournament_preference))
    ? (data.tournament_preference as UserStats['tournament_preference'])
    : 'Challengers';
  return {
    name: string(data.name),
    skill_level: number(data.skill_level, 2),
    tournament_preference: preference,
    matchesPlayed: number(data.matchesPlayed),
    wins: number(data.wins),
    loses: number(data.loses),
    leaguePoints26: number(data.leaguePoints26),
    tournamentsPlayed: number(data.tournamentsPlayed),
    league: string(data.league),
    ...(typeof data.pointswon === 'number' ? { pointswon: data.pointswon } : {}),
    ...(typeof data.totalPointsPlayed === 'number' ? { totalPointsPlayed: data.totalPointsPlayed } : {}),
    rankPosition: optionalNumber(data.rankPosition),
    rankTrend: ['up', 'down', 'same'].includes(string(data.rankTrend))
      ? (data.rankTrend as UserStats['rankTrend'])
      : undefined,
    rankMove: optionalNumber(data.rankMove),
  };
};

export const normalizeUserPreferences = (value: unknown): UserPreferences => {
  const data = record(value);
  const scheduling =
    data.scheduling_preference === 'Tell me more about matchdays'
      ? 'Tell me more about matchdays'
      : 'I will schedule matches on my own';
  return {
    preferred_courts: strings(data.preferred_courts),
    favourite_players: strings(data.favourite_players),
    scheduling_preference: scheduling,
    event_creator: data.event_creator === true,
    preferred_zone: string(data.preferred_zone),
    preferred_zone_manual: boolean(data.preferred_zone_manual),
    email_notifications: typeof data.email_notifications === 'boolean' ? data.email_notifications : undefined,
    stringer: data.stringer === true,
    stringer_id: optionalString(data.stringer_id),
    coach: data.coach === true,
    coach_id: optionalString(data.coach_id),
    ...(Array.isArray(data.availability_tags) ? { availability_tags: strings(data.availability_tags) } : {}),
    available_to_play: typeof data.available_to_play === 'boolean' ? data.available_to_play : true,
  };
};

export const normalizeContactData = (value: unknown): ContactData => {
  const data = record(value);
  return {
    email: string(data.email),
    phone: string(data.phone),
    preferred_mode_of_contact: strings(data.preferred_mode_of_contact).filter(
      (method): method is 'email' | 'text' | 'whatsapp' => ['email', 'text', 'whatsapp'].includes(method),
    ),
    secondary_email: optionalString(data.secondary_email),
    whatsapp_contact: optionalString(data.whatsapp_contact),
    whatsapp_same_as_phone: boolean(data.whatsapp_same_as_phone),
    contactable: data.contactable !== false,
    updated_at: optionalString(data.updated_at),
  };
};
