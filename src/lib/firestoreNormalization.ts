import type { ContactData, EventParticipant, TennisEvent, UserData, UserPreferences, UserStats } from '../types';
import type { TournamentMatch } from '../features/tournament/types';
import { resolveZoneConfig } from '../features/tournament/domain/placement';

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {};
const string = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const number = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const boolean = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback);
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

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
    ...(data as Omit<TennisEvent, 'id' | 'title' | 'type' | 'location' | 'image' | 'zone_draw_config'>),
    id,
    title: string(data.title),
    type: string(data.type),
    location: string(data.location),
    image: string(data.image),
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
    ...(data as Partial<EventParticipant>),
    id,
    uid,
    event_id: eventId,
    created_at: string(data.created_at),
    ...(string(data.user_name) ? { user_name: string(data.user_name) } : {}),
    ...(string(data.event_name) ? { event_name: string(data.event_name) } : {}),
    ...(tournamentChoice ? { tournament_choice: tournamentChoice } : {}),
    ...(typeof data.skill === 'number' && Number.isFinite(data.skill) ? { skill: data.skill } : { skill: undefined }),
    ...(Array.isArray(data.dateselected) ? { dateselected: strings(data.dateselected) } : { dateselected: undefined }),
  };
};

export const normalizeTournamentMatch = (id: string, value: unknown): TournamentMatch | null => {
  const data = record(value);
  const eventId = string(data.event_id).trim();
  const matchId = string(data.match_id).trim();
  if (!eventId || !matchId) return null;
  const choice = data.tournament_choice === 'Doubles' ? 'Doubles' : 'Singles';
  const status = data.status === 'complete' ? 'complete' : 'pending';
  return {
    ...(data as Partial<TournamentMatch>),
    id,
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
  };
};

export const normalizeUserData = (value: unknown): UserData => {
  const data = record(value);
  return {
    ...(data as Partial<UserData>),
    name: string(data.name),
    created_at: string(data.created_at),
    ...(Array.isArray(data.display_badges) ? { display_badges: strings(data.display_badges).slice(0, 3) } : {}),
  };
};

export const normalizeUserStats = (value: unknown): UserStats => {
  const data = record(value);
  const preference = ['Beginners', 'Challengers', 'Masters'].includes(string(data.tournament_preference))
    ? (data.tournament_preference as UserStats['tournament_preference'])
    : 'Challengers';
  return {
    ...(data as Partial<UserStats>),
    name: string(data.name),
    skill_level: number(data.skill_level, 2),
    tournament_preference: preference,
    matchesPlayed: number(data.matchesPlayed),
    wins: number(data.wins),
    loses: number(data.loses),
    leaguePoints26: number(data.leaguePoints26),
    tournamentsPlayed: number(data.tournamentsPlayed),
    league: string(data.league),
    pointswon: number(data.pointswon),
    totalPointsPlayed: number(data.totalPointsPlayed),
  };
};

export const normalizeUserPreferences = (value: unknown): UserPreferences => {
  const data = record(value);
  const scheduling =
    data.scheduling_preference === 'Tell me more about matchdays'
      ? 'Tell me more about matchdays'
      : 'I will schedule matches on my own';
  return {
    ...(data as Partial<UserPreferences>),
    preferred_courts: strings(data.preferred_courts),
    favourite_players: strings(data.favourite_players),
    scheduling_preference: scheduling,
    event_creator: data.event_creator === true,
    preferred_zone: string(data.preferred_zone),
    ...(Array.isArray(data.availability_tags) ? { availability_tags: strings(data.availability_tags) } : {}),
  };
};

export const normalizeContactData = (value: unknown): ContactData => {
  const data = record(value);
  return {
    ...(data as Partial<ContactData>),
    email: string(data.email),
    phone: string(data.phone),
    preferred_mode_of_contact: strings(data.preferred_mode_of_contact).filter(
      (method): method is 'email' | 'text' | 'whatsapp' => ['email', 'text', 'whatsapp'].includes(method),
    ),
  };
};
