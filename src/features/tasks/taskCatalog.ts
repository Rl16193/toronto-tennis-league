// The full task catalogue: twelve categories, each a set of tasks (tiers).
//
// MIRRORS functions/lib/points.js (tiers, counters, initiation) — keep the two in sync by hand.
//
// A task is done when its stats counter reaches its need. Each pays its own points, EXCEPT the Community
// Member Initiation, which pays a flat SETUP_POINTS for finishing all of its tasks. Completing
// every task in a category is a "milestone".
//
// Category totals are deliberately round (multiples of 5 or 10), and so is the grand total:
// 1,050 earned individually + a 50-point community award = 1,100.

export const SETUP_POINTS = 25;

// Every counter is a field on the member's stats doc, written by the server (functions/taskPoints.js,
// commitPoints). A tier is reached when its counter is: nothing per tier is stored.
export type CounterKey =
  | 'matchesPlayed'      // played matches (walkovers excluded)
  | 'challengesPlayed'   // played ladder challenges, either side
  | 'challengesWon'      // played ladder challenges won
  | 'bestStreak'         // longest run of wins ever
  | 'monthsActive'       // distinct months with a played match
  | 'suggestions'        // court condition reports filed
  | 'courtsVisited'      // distinct courts visited
  | 'zoneComplete'       // 1 once every court in your zone is visited
  | 'boardPhotos'        // waiting-board reports filed
  | 'queueUpdates'       // racquet queue reports filed
  | 'eventsJoined'       // events registered for (the initiation's joinEvent)
  | 'volunteerApproved'  // approved volunteer claims
  | 'inviteApproved'     // approved ambassador claims
  | 'hostApproved';      // approved meetup host claims

export type Counters = Record<CounterKey, number>;

export const EMPTY_COUNTERS: Counters = {
  matchesPlayed: 0, challengesPlayed: 0, challengesWon: 0, bestStreak: 0,
  monthsActive: 0, suggestions: 0, courtsVisited: 0, zoneComplete: 0, boardPhotos: 0,
  queueUpdates: 0, eventsJoined: 0, volunteerApproved: 0, inviteApproved: 0, hostApproved: 0,
};

type StatsLike = object | null | undefined;
const field = (stats: StatsLike, k: string) => (stats as Record<string, unknown> | null | undefined)?.[k];

/** The counters off a stats doc (0 when absent). */
export const countersOf = (stats: StatsLike): Counters =>
  Object.fromEntries((Object.keys(EMPTY_COUNTERS) as CounterKey[])
    .map((k) => [k, typeof field(stats, k) === 'number' ? (field(stats, k) as number) : 0])) as Counters;

// What a counter counts, for the "3 more matches" / "1 more event" line on a category card.
export const COUNTER_NOUN: Record<CounterKey, { one: string; many: string }> = {
  matchesPlayed: { one: 'match', many: 'matches' },
  challengesPlayed: { one: 'challenge', many: 'challenges' },
  challengesWon: { one: 'win', many: 'wins' },
  bestStreak: { one: 'win in a row', many: 'wins in a row' },
  monthsActive: { one: 'active month', many: 'active months' },
  suggestions: { one: 'suggestion', many: 'suggestions' },
  courtsVisited: { one: 'court', many: 'courts' },
  zoneComplete: { one: 'zone', many: 'zones' },
  boardPhotos: { one: 'board photo', many: 'board photos' },
  queueUpdates: { one: 'queue update', many: 'queue updates' },
  eventsJoined: { one: 'event', many: 'events' },
  volunteerApproved: { one: 'event', many: 'events' },
  inviteApproved: { one: 'invite', many: 'invites' },
  hostApproved: { one: 'meetup', many: 'meetups' },
};

export interface TierDef {
  id: string;
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
    to: '/matches?mode=challenges',
    tiers: [
      { id: 'chal1', title: 'Play a challenge', points: 2, counter: 'challengesPlayed', need: 1 },
      { id: 'chal5', title: 'Play 5 challenges', points: 8, counter: 'challengesPlayed', need: 5 },
      { id: 'chal10', title: 'Play 10 challenges', points: 15, counter: 'challengesPlayed', need: 10 },
      { id: 'chal20', title: 'Play 20 challenges', points: 25, counter: 'challengesPlayed', need: 20 },
      { id: 'win5', title: 'Win 5 challenges', points: 15, counter: 'challengesWon', need: 5 },
      { id: 'win10', title: 'Win 10 challenges', points: 25, counter: 'challengesWon', need: 10 },
      { id: 'win20', title: 'Win 20 challenges', points: 40, counter: 'challengesWon', need: 20 },
    ],
  },
  {
    id: 'streaks',
    title: 'Streaks',
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
    tiers: [
      { id: 'months3', title: 'Play in 3 different months', points: 10, counter: 'monthsActive', need: 3 },
      { id: 'months6', title: 'Play in 6 different months', points: 25, counter: 'monthsActive', need: 6 },
      { id: 'months12', title: 'Play in 12 different months', points: 50, counter: 'monthsActive', need: 12 },
    ],
  },
  {
    id: 'courtCare',
    title: 'Court Care',
    to: '/tasks?photo=condition',
    tiers: [
      { id: 'sugg5', title: 'Submit 5 court improvements', points: 10, counter: 'suggestions', need: 5 },
      { id: 'sugg10', title: 'Submit 10 court improvements', points: 20, counter: 'suggestions', need: 10 },
    ],
  },
  {
    id: 'traveler',
    title: 'Traveler',
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
    to: '/tasks?photo=waiting_board',
    tiers: [
      { id: 'board1', title: 'Submit 1 waiting board report', points: 5, counter: 'boardPhotos', need: 1 },
      { id: 'board5', title: 'Submit 5 waiting board reports', points: 15, counter: 'boardPhotos', need: 5 },
      { id: 'board10', title: 'Submit 10 waiting board reports', points: 25, counter: 'boardPhotos', need: 10 },
      { id: 'board20', title: 'Submit 20 waiting board reports', points: 40, counter: 'boardPhotos', need: 20 },
    ],
  },
  {
    id: 'liveUpdates',
    title: 'Live Updates',
    to: '/tasks?photo=queue',
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
      { id: 'vol1', title: 'Volunteer at 1 event', points: 5, counter: 'volunteerApproved', need: 1 },
      { id: 'vol5', title: 'Volunteer at 5 events', points: 15, counter: 'volunteerApproved', need: 5 },
      { id: 'vol10', title: 'Volunteer at 10 events', points: 30, counter: 'volunteerApproved', need: 10 },
      { id: 'vol20', title: 'Volunteer at 20 events', points: 50, counter: 'volunteerApproved', need: 20 },
    ],
  },
  {
    id: 'ambassador',
    title: 'Ambassador',
    to: '/tasks?claim=ambassador',
    tiers: [
      { id: 'invite1', title: 'Invite One Player', points: 5, counter: 'inviteApproved', need: 1 },
      { id: 'invite3', title: 'Invite 3 players', points: 10, counter: 'inviteApproved', need: 3 },
      { id: 'invite10', title: 'Invite 10 players', points: 25, counter: 'inviteApproved', need: 10 },
    ],
  },
  {
    id: 'host',
    title: 'Host',
    to: '/tasks?claim=host',
    tiers: [
      { id: 'host1', title: 'Host 1 meetup', points: 10, counter: 'hostApproved', need: 1 },
      { id: 'host5', title: 'Host 5 meetups', points: 30, counter: 'hostApproved', need: 5 },
      { id: 'host10', title: 'Host 10 meetups', points: 50, counter: 'hostApproved', need: 10 },
    ],
  },
];

// ─── Group / community bonuses ──────────────────────────────────────────────
// These pay from COLLECTIVE activity, not one player's counter — awarded server-side by
// functions/groupAwards.js as `awards` rows, which count toward stats.rsPoints. Shown here purely as descriptive cards
// (name + wrapped trigger + points); the numbers must match the constants in groupAwards.js.

export interface GroupTaskDef {
  id: string;
  name: string;
  trigger: string;   // full sentence — rendered wrapped, not truncated
  points: string;    // e.g. "+10 each" — a label, since group bonuses aren't a single tier value
  award: string;     // the `awards.category` groupAwards.js writes for it
}

// Reset every day (the calendar day is part of the award, so yesterday's bonus never blocks today's).
export const DAILY_GROUP_TASKS: GroupTaskDef[] = [
  {
    id: 'matchday',
    name: 'Matchday',
    trigger: 'When more than 3 matches are played across the league on the same day, every member '
      + 'who played a match that day unlocks the bonus. Walkovers don’t count.',
    points: '+10 each',
    award: 'matchday',
  },
  {
    id: 'hourlyCoverage',
    name: 'Hourly Coverage',
    trigger: 'When a court has at least one live racquet-queue report for every hour from 8 AM to '
      + '10 PM on the same day, everyone who posted a queue report there that day unlocks the bonus.',
    points: '+10 each',
    award: 'hourly_coverage',
  },
];

// Accumulate over time.
export const COMMUNITY_GROUP_TASKS: GroupTaskDef[] = [
  {
    id: 'courtPioneer',
    name: 'Court Pioneer',
    trigger: 'Be the first member ever to check in at a court that has no prior check-ins.',
    points: '+5',
    award: 'pioneer',
  },
  {
    id: 'boardFreshness',
    name: 'Board Freshness',
    trigger: 'Submit a waiting-board report for a court you haven’t reported a board for before.',
    points: '+5',
    award: 'board_new',
  },
  {
    id: 'zoneSweep',
    name: 'Full Zone Sweep',
    trigger: 'Every member with a check for a court in that a zone, unlocks the bonus. '
      + 'Once completed we start over again.',
    points: '+10 each',
    award: 'zone_sweep',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    trigger: 'When members’ check-ins, score submissions and reports cover every court in Toronto, '
      + 'everyone who contributed unlocks the bonus. Once completed we start over again.',
    points: '+30 each',
    award: 'explorer',
  },
];

export const ALL_TIERS: TierDef[] = CATEGORIES.flatMap((c) => c.tiers);

// Badge grouping: "playing tasks" spans the three match-based categories.
export const PLAYING_CATEGORY_IDS = ['tournament', 'ladder', 'streaks'];
export const LADDER_TIER_IDS = CATEGORIES.find((c) => c.id === 'ladder')!.tiers.map((t) => t.id);
export const PLAYING_TIER_IDS = CATEGORIES
  .filter((c) => PLAYING_CATEGORY_IDS.includes(c.id))
  .flatMap((c) => c.tiers.map((t) => t.id));

// ─── Progress from the stats doc ────────────────────────────────────────────

// The Initiation checklist (mirrors INITIATION in functions/lib/points.js): a counter item is done
// at 1; the rest are the member's own one-time booleans on stats. All done = SETUP_POINTS.
export const INITIATION: { id: string; counter?: CounterKey }[] = [
  { id: 'profileComplete' }, { id: 'followSocial' }, { id: 'tagPost' }, { id: 'whatsappGroup' }, { id: 'profilePhoto' },
  { id: 'joinEvent', counter: 'eventsJoined' }, { id: 'playMatch', counter: 'matchesPlayed' },
  { id: 'courtVisit', counter: 'courtsVisited' }, { id: 'waitingBoard', counter: 'boardPhotos' },
  { id: 'queuePhoto', counter: 'queueUpdates' }, { id: 'courtSuggestion', counter: 'suggestions' },
];

/** Done-ness of every task, keyed by tier id / initiation id, plus `setupComplete`. Derived, never stored. */
export type TaskProgress = Record<string, boolean>;

export const taskState = (stats: StatsLike): TaskProgress => {
  const c = countersOf(stats);
  const state: TaskProgress = {};
  ALL_TIERS.forEach((t) => { state[t.id] = c[t.counter] >= t.need; });
  INITIATION.forEach((i) => { state[i.id] = i.counter ? c[i.counter] >= 1 : field(stats, i.id) === true; });
  state.setupComplete = INITIATION.every((i) => state[i.id]);
  return state;
};
