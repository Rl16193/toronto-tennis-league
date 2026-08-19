import type { TaskProgress } from '../../types';
import { Counters, LADDER_TIER_IDS, PLAYING_TIER_IDS } from './taskCatalog';

// Badges are earned automatically from tier progress and counters, and never lost. Players
// choose up to MAX_DISPLAY_BADGES to show on their profile card and beside their name on the
// leaderboards (stored as `display_badges` on the users doc).

export const MAX_DISPLAY_BADGES = 3;

export interface BadgeDef {
  id: string;
  name: string;
  requirement: string;
  earned: (p: Partial<TaskProgress>, c: Counters, tierCount: (ids: string[]) => number) => boolean;
}

export const BADGES: BadgeDef[] = [
  {
    id: 'member',
    name: 'Community Member',
    requirement: 'Finish the Community Member Initiation',
    earned: (p) => !!p.setupComplete,
  },
  {
    id: 'tourBeginner',
    name: 'Tournament Beginner',
    requirement: '5 playing tasks',
    earned: (_p, _c, count) => count(PLAYING_TIER_IDS) >= 5,
  },
  {
    id: 'tourIntermediate',
    name: 'Tournament Intermediate',
    requirement: '10 playing tasks',
    earned: (_p, _c, count) => count(PLAYING_TIER_IDS) >= 10,
  },
  {
    id: 'tourExpert',
    name: 'Tournament Expert',
    requirement: '15 playing tasks',
    earned: (_p, _c, count) => count(PLAYING_TIER_IDS) >= 15,
  },
  {
    id: 'onFire',
    name: 'On Fire',
    requirement: 'A 10-match winning streak',
    earned: (_p, c) => c.bestStreak >= 10,
  },
  {
    id: 'ladderChallenger',
    name: 'Ladder Challenger',
    requirement: '3 ladder tasks',
    earned: (_p, _c, count) => count(LADDER_TIER_IDS) >= 3,
  },
  {
    id: 'ladderDuellist',
    name: 'Ladder Duellist',
    requirement: '6 ladder tasks',
    earned: (_p, _c, count) => count(LADDER_TIER_IDS) >= 6,
  },
  {
    id: 'ladderMaster',
    name: 'Ladder Master',
    requirement: 'All 7 ladder tasks',
    earned: (_p, _c, count) => count(LADDER_TIER_IDS) >= LADDER_TIER_IDS.length,
  },
  {
    id: 'traveler',
    name: 'Traveler',
    requirement: '10 courts visited',
    earned: (_p, c) => c.courtsVisited >= 10,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    requirement: 'Every court in Toronto visited',
    earned: (p) => !!p.visitedAllCourts,
  },
  {
    id: 'infoGatherer',
    name: 'Information Gatherer',
    requirement: '15 photos submitted',
    earned: (_p, c) => c.boardPhotos + c.queueUpdates >= 15,
  },
  {
    id: 'courtGuardian',
    name: 'Court Guardian',
    requirement: '10 court improvements',
    earned: (_p, c) => c.suggestions >= 10,
  },
  {
    id: 'volunteer',
    name: 'Volunteer',
    requirement: 'Volunteer at 10 events',
    earned: (_p, c) => c.volunteerEvents >= 10,
  },
  {
    id: 'ambassador',
    name: 'Ambassador',
    requirement: '10 players invited',
    earned: (_p, c) => c.invites >= 10,
  },
  {
    id: 'host',
    name: 'Host',
    requirement: '10 meetups hosted',
    earned: (_p, c) => c.meetups >= 10,
  },
  {
    id: 'seasonRegular',
    name: 'Season Regular',
    requirement: 'Play in 12 different months',
    earned: (_p, c) => c.monthsActive >= 12,
  },
  {
    id: 'master',
    name: 'Master',
    requirement: 'Reach the top playing and ladder tiers',
    earned: (_p, _c, count) => count(PLAYING_TIER_IDS) >= 15 && count(LADDER_TIER_IDS) >= LADDER_TIER_IDS.length,
  },
];

// Shared pill styling — deliberately identical to the skill-tier tag ("Masters") so a player's
// badges and their skill level read as one consistent row of labels.
export const BADGE_PILL_CLASS =
  'px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-badge border border-amber-500/25';

export const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b])) as Record<string, BadgeDef>;

export const earnedBadges = (p: Partial<TaskProgress> | null | undefined, c: Counters): BadgeDef[] => {
  const progress = p || {};
  const tierCount = (ids: string[]) =>
    ids.reduce((n, id) => n + ((progress as Record<string, unknown>)[id] ? 1 : 0), 0);
  return BADGES.filter((b) => b.earned(progress, c, tierCount));
};
