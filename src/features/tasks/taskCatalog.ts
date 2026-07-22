// The full task catalogue: twelve categories, each a set of tasks (tiers).
//
// A task is completed once and never lost. Each pays its own points, EXCEPT the Community
// Member Initiation, which pays a flat SETUP_POINTS for finishing all of its tasks. Completing
// every task in a category is a "milestone".
//
// Category totals are deliberately round (multiples of 5 or 10), and so is the grand total:
// 1,050 earned individually + a 50-point community award = 1,100.

export const SETUP_POINTS = 25;

// Counters are computed from real data (matches, challenges) or stored on the player's
// task_progress doc (things the app can't derive yet, like courts visited).
export type CounterKey =
  | 'matchesPlayed'      // completed matches with real set scores (walkovers excluded)
  | 'challengesPlayed'   // confirmed ladder challenges, either side
  | 'challengesWon'      // confirmed ladder challenges won
  | 'bestStreak'         // longest run of wins ever
  | 'climbSpots'         // places climbed via ladder challenges this season
  | 'monthsActive'       // distinct months with a completed match
  | 'suggestions'        // court improvement suggestions submitted
  | 'courtsVisited'      // passport stamps
  | 'zoneComplete'       // 1 once every court in your zone is stamped
  | 'boardPhotos'        // waiting-board photos accepted
  | 'queueUpdates'       // racquet queue photos submitted
  | 'volunteerEvents'    // events volunteered at
  | 'invites'            // players who joined via your invite
  | 'meetups';           // meetups hosted

export type Counters = Record<CounterKey, number>;

export const EMPTY_COUNTERS: Counters = {
  matchesPlayed: 0, challengesPlayed: 0, challengesWon: 0, bestStreak: 0, climbSpots: 0,
  monthsActive: 0, suggestions: 0, courtsVisited: 0, zoneComplete: 0, boardPhotos: 0,
  queueUpdates: 0, volunteerEvents: 0, invites: 0, meetups: 0,
};

export interface TierDef {
  id: string;        // field name on task_progress
  title: string;
  points: number;
  counter: CounterKey;
  need: number;
}

export interface CategoryDef {
  id: string;
  title: string;
  tiers: TierDef[];
  locked?: boolean;  // the feature that feeds it doesn't exist yet
  to?: string;       // where to go to make progress
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'tournament',
    title: 'Tournament',
    to: '/tournament',
    tiers: [
      { id: 'play5', title: 'Play 5 matches', points: 2, counter: 'matchesPlayed', need: 5 },
      { id: 'play10', title: 'Play 10 matches', points: 5, counter: 'matchesPlayed', need: 10 },
      { id: 'play20', title: 'Play 20 matches', points: 8, counter: 'matchesPlayed', need: 20 },
      { id: 'play30', title: 'Play 30 matches', points: 15, counter: 'matchesPlayed', need: 30 },
      { id: 'play50', title: 'Play 50 matches', points: 25, counter: 'matchesPlayed', need: 50 },
    ],
  },
  {
    id: 'ladder',
    title: 'League Ladder',
    to: '/tournament',
    tiers: [
      { id: 'chal1', title: 'Play a challenge', points: 2, counter: 'challengesPlayed', need: 1 },
      { id: 'chal5', title: 'Play 5 challenges', points: 8, counter: 'challengesPlayed', need: 5 },
      { id: 'chal10', title: 'Play 10 challenges', points: 15, counter: 'challengesPlayed', need: 10 },
      { id: 'chal20', title: 'Play 20 challenges', points: 25, counter: 'challengesPlayed', need: 20 },
      { id: 'win5', title: 'Win 5 challenges', points: 15, counter: 'challengesWon', need: 5 },
      { id: 'win10', title: 'Win 10 challenges', points: 25, counter: 'challengesWon', need: 10 },
      { id: 'win20', title: 'Win 20 challenges', points: 40, counter: 'challengesWon', need: 20 },
      { id: 'climb10', title: 'Climb 10 spots', points: 10, counter: 'climbSpots', need: 10 },
      { id: 'climb20', title: 'Climb 20 spots', points: 20, counter: 'climbSpots', need: 20 },
      { id: 'climb50', title: 'Climb 50 spots', points: 50, counter: 'climbSpots', need: 50 },
    ],
  },
  {
    id: 'streaks',
    title: 'Streaks',
    to: '/tournament',
    tiers: [
      { id: 'streak3', title: '3 wins in a row', points: 5, counter: 'bestStreak', need: 3 },
      { id: 'streak5', title: '5 wins in a row', points: 15, counter: 'bestStreak', need: 5 },
      { id: 'streak10', title: '10 wins in a row', points: 30, counter: 'bestStreak', need: 10 },
      { id: 'streak20', title: '20 wins in a row', points: 50, counter: 'bestStreak', need: 20 },
    ],
  },
  {
    id: 'seasonRegular',
    title: 'Season Regular',
    to: '/events',
    tiers: [
      { id: 'months3', title: 'Play in 3 different months', points: 10, counter: 'monthsActive', need: 3 },
      { id: 'months6', title: 'Play in 6 different months', points: 25, counter: 'monthsActive', need: 6 },
      { id: 'months12', title: 'Play in 12 different months', points: 50, counter: 'monthsActive', need: 12 },
    ],
  },
  {
    id: 'courtCare',
    title: 'Court Care',
    to: '/courts',
    tiers: [
      { id: 'sugg5', title: 'Submit 5 court improvements', points: 10, counter: 'suggestions', need: 5 },
      { id: 'sugg10', title: 'Submit 10 court improvements', points: 20, counter: 'suggestions', need: 10 },
    ],
  },
  {
    id: 'traveller',
    title: 'Traveller',
    to: '/tasks?checkin=1',
    tiers: [
      { id: 'visit1', title: 'Visit 1 court', points: 5, counter: 'courtsVisited', need: 1 },
      { id: 'visit5', title: 'Visit 5 courts', points: 15, counter: 'courtsVisited', need: 5 },
      { id: 'visit10', title: 'Visit 10 courts', points: 25, counter: 'courtsVisited', need: 10 },
      { id: 'visit20', title: 'Visit 20 courts', points: 40, counter: 'courtsVisited', need: 20 },
      { id: 'visitZone', title: 'Visit every court in your zone', points: 30, counter: 'zoneComplete', need: 1 },
    ],
  },
  {
    id: 'courtInfo',
    title: 'Court Information',
    to: '/tasks?photo=1',
    tiers: [
      { id: 'board1', title: 'Submit 1 waiting board photo', points: 5, counter: 'boardPhotos', need: 1 },
      { id: 'board5', title: 'Submit 5 waiting board photos', points: 15, counter: 'boardPhotos', need: 5 },
      { id: 'board10', title: 'Submit 10 waiting board photos', points: 25, counter: 'boardPhotos', need: 10 },
      { id: 'board20', title: 'Submit 20 waiting board photos', points: 40, counter: 'boardPhotos', need: 20 },
    ],
  },
  {
    id: 'liveUpdates',
    title: 'Live Updates',
    to: '/tasks?photo=1',
    tiers: [
      { id: 'queue10', title: 'Submit 10 queue updates', points: 10, counter: 'queueUpdates', need: 10 },
      { id: 'queue25', title: 'Submit 25 queue updates', points: 20, counter: 'queueUpdates', need: 25 },
      { id: 'queue50', title: 'Submit 50 queue updates', points: 35, counter: 'queueUpdates', need: 50 },
      { id: 'queue100', title: 'Submit 100 queue updates', points: 50, counter: 'queueUpdates', need: 100 },
    ],
  },
  {
    id: 'volunteering',
    title: 'Volunteering',
    to: '/tasks?claim=volunteer',
    tiers: [
      { id: 'vol1', title: 'Volunteer at 1 event', points: 5, counter: 'volunteerEvents', need: 1 },
      { id: 'vol5', title: 'Volunteer at 5 events', points: 15, counter: 'volunteerEvents', need: 5 },
      { id: 'vol10', title: 'Volunteer at 10 events', points: 30, counter: 'volunteerEvents', need: 10 },
      { id: 'vol20', title: 'Volunteer at 20 events', points: 50, counter: 'volunteerEvents', need: 20 },
    ],
  },
  {
    id: 'ambassador',
    title: 'Ambassador',
    to: '/tasks?claim=ambassador',
    tiers: [
      { id: 'invite1', title: 'Invite One Player', points: 5, counter: 'invites', need: 1 },
      { id: 'invite3', title: 'Invite 3 players', points: 10, counter: 'invites', need: 3 },
      { id: 'invite10', title: 'Invite 10 players', points: 25, counter: 'invites', need: 10 },
    ],
  },
  {
    id: 'host',
    title: 'Host',
    to: '/tasks?claim=host',
    tiers: [
      { id: 'host1', title: 'Host 1 meetup', points: 10, counter: 'meetups', need: 1 },
      { id: 'host5', title: 'Host 5 meetups', points: 30, counter: 'meetups', need: 5 },
      { id: 'host10', title: 'Host 10 meetups', points: 50, counter: 'meetups', need: 10 },
    ],
  },
];

// ─── Group / community bonuses ──────────────────────────────────────────────
// These pay from COLLECTIVE activity, not one player's counter — awarded server-side by
// functions/groupAwards.js and landed as bonusPoints. Shown here purely as descriptive cards
// (name + wrapped trigger + points); the numbers must match the constants in groupAwards.js.

export interface GroupTaskDef {
  id: string;
  name: string;
  trigger: string;   // full sentence — rendered wrapped, not truncated
  points: string;    // e.g. "+10 each" — a label, since group bonuses aren't a single tier value
}

// Reset every day (the calendar day is part of the award, so yesterday's bonus never blocks today's).
export const DAILY_GROUP_TASKS: GroupTaskDef[] = [
  {
    id: 'matchday',
    name: 'Matchday',
    trigger: 'When 6 or more members check in at the same court on the same day (verified by the '
      + 'check-in feature), everyone who checked in there that day unlocks the bonus.',
    points: '+10 each',
  },
  {
    id: 'hourlyCoverage',
    name: 'Hourly Coverage',
    trigger: 'When a court has at least one live racquet-queue photo for every hour from 8 AM to '
      + '10 PM on the same day, everyone who posted a queue photo there that day unlocks the bonus.',
    points: '+10 each',
  },
];

// Accumulate over time.
export const COMMUNITY_GROUP_TASKS: GroupTaskDef[] = [
  {
    id: 'courtPioneer',
    name: 'Court Pioneer',
    trigger: 'Be the first member ever to check in at a court that has no prior check-ins.',
    points: '+5',
  },
  {
    id: 'boardFreshness',
    name: 'Board Freshness',
    trigger: 'Submit the first approved waiting-board photo for a court that has never had one — '
      + '+5 to you. And once every court in a zone has an approved waiting-board photo, everyone '
      + 'who contributed one in that zone unlocks +10.',
    points: '+5 / +10',
  },
  {
    id: 'zoneSweep',
    name: 'Full Zone Sweep',
    trigger: 'When members collectively check in at every court in a zone, everyone who '
      + 'contributed a check-in that cycle unlocks the bonus. The sweep then resets to zero and '
      + 'starts again — a running baseline for how long full coverage takes.',
    points: '+10 each',
  },
];

export const ALL_TIERS: TierDef[] = CATEGORIES.flatMap((c) => c.tiers);
export const TIER_POINTS: Record<string, number> = Object.fromEntries(ALL_TIERS.map((t) => [t.id, t.points]));

export const categoryTotal = (c: CategoryDef): number => c.tiers.reduce((n, t) => n + t.points, 0);
// 1,050 = every tier + the Initiation's flat award.
export const TOTAL_AVAILABLE = CATEGORIES.reduce((n, c) => n + categoryTotal(c), 0) + SETUP_POINTS;

// Badge grouping: "playing tasks" spans the three match-based categories.
export const PLAYING_CATEGORY_IDS = ['tournament', 'ladder', 'streaks'];
export const LADDER_TIER_IDS = CATEGORIES.find((c) => c.id === 'ladder')!.tiers.map((t) => t.id);
export const PLAYING_TIER_IDS = CATEGORIES
  .filter((c) => PLAYING_CATEGORY_IDS.includes(c.id))
  .flatMap((c) => c.tiers.map((t) => t.id));
