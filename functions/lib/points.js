/**
 * The tier catalogue + RS-points summing, shared by taskPoints.js (which awards tiers) and
 * rewards.js (which needs a player's earned RS total to compute their redeemable balance).
 *
 * Lives in lib/ for the same reason constants.js does: index.js re-exports its modules wholesale
 * via `Object.assign(exports, require('./x'))` and the Firebase CLI treats every export it finds
 * there as a Cloud Function, so plain values must not be exported from a function module.
 *
 * MIRRORS src/features/tasks/taskCatalog.ts — keep the two in sync by hand, same duplication
 * pattern as scripts/regroup-rr.js mirroring rrGeneration.ts. `earnedRsPoints` below is the
 * exact server twin of taskPoints() in src/features/tasks/useTasks.ts.
 */

// Flat bonus for finishing the Community Member Initiation checklist (taskCatalog.ts SETUP_POINTS).
const SETUP_POINTS = 25;

const ALL_TIERS = [
  { id: 'play5', title: 'Play 5 matches', points: 2, counter: 'matchesPlayed', need: 5 },
  { id: 'play10', title: 'Play 10 matches', points: 5, counter: 'matchesPlayed', need: 10 },
  { id: 'play20', title: 'Play 20 matches', points: 8, counter: 'matchesPlayed', need: 20 },
  { id: 'play30', title: 'Play 30 matches', points: 15, counter: 'matchesPlayed', need: 30 },
  { id: 'play50', title: 'Play 50 matches', points: 25, counter: 'matchesPlayed', need: 50 },

  { id: 'chal1', title: 'Play a challenge', points: 2, counter: 'challengesPlayed', need: 1 },
  { id: 'chal5', title: 'Play 5 challenges', points: 8, counter: 'challengesPlayed', need: 5 },
  { id: 'chal10', title: 'Play 10 challenges', points: 15, counter: 'challengesPlayed', need: 10 },
  { id: 'chal20', title: 'Play 20 challenges', points: 25, counter: 'challengesPlayed', need: 20 },
  { id: 'win5', title: 'Win 5 challenges', points: 15, counter: 'challengesWon', need: 5 },
  { id: 'win10', title: 'Win 10 challenges', points: 25, counter: 'challengesWon', need: 10 },
  { id: 'win20', title: 'Win 20 challenges', points: 40, counter: 'challengesWon', need: 20 },

  { id: 'streak3', title: '3 wins in a row', points: 5, counter: 'bestStreak', need: 3 },
  { id: 'streak5', title: '5 wins in a row', points: 15, counter: 'bestStreak', need: 5 },
  { id: 'streak10', title: '10 wins in a row', points: 30, counter: 'bestStreak', need: 10 },
  { id: 'streak20', title: '20 wins in a row', points: 50, counter: 'bestStreak', need: 20 },

  { id: 'months3', title: 'Play in 3 different months', points: 10, counter: 'monthsActive', need: 3 },
  { id: 'months6', title: 'Play in 6 different months', points: 25, counter: 'monthsActive', need: 6 },
  { id: 'months12', title: 'Play in 12 different months', points: 50, counter: 'monthsActive', need: 12 },

  { id: 'sugg5', title: 'Submit 5 court improvements', points: 10, counter: 'suggestions', need: 5 },
  { id: 'sugg10', title: 'Submit 10 court improvements', points: 20, counter: 'suggestions', need: 10 },

  { id: 'visit1', title: 'Visit 1 court', points: 5, counter: 'courtsVisited', need: 1 },
  { id: 'visit5', title: 'Visit 5 courts', points: 15, counter: 'courtsVisited', need: 5 },
  { id: 'visit10', title: 'Visit 10 courts', points: 25, counter: 'courtsVisited', need: 10 },
  { id: 'visit20', title: 'Visit 20 courts', points: 40, counter: 'courtsVisited', need: 20 },
  // Nothing bumps `zoneComplete` server-side yet, so this never auto-awards — it's mirrored
  // from taskCatalog.ts purely so earnedRsPoints() can't under-count a balance the Tasks page
  // already shows the player. Inert in the award primitives until a zone counter exists.
  { id: 'visitZone', title: 'Visit every court in your zone', points: 30, counter: 'zoneComplete', need: 1 },

  { id: 'board1', title: 'Submit 1 waiting board report', points: 5, counter: 'boardPhotos', need: 1 },
  { id: 'board5', title: 'Submit 5 waiting board reports', points: 15, counter: 'boardPhotos', need: 5 },
  { id: 'board10', title: 'Submit 10 waiting board reports', points: 25, counter: 'boardPhotos', need: 10 },
  { id: 'board20', title: 'Submit 20 waiting board reports', points: 40, counter: 'boardPhotos', need: 20 },

  { id: 'queue10', title: 'Submit 10 queue updates', points: 10, counter: 'queueUpdates', need: 10 },
  { id: 'queue25', title: 'Submit 25 queue updates', points: 20, counter: 'queueUpdates', need: 25 },
  { id: 'queue50', title: 'Submit 50 queue updates', points: 35, counter: 'queueUpdates', need: 50 },
  { id: 'queue100', title: 'Submit 100 queue updates', points: 50, counter: 'queueUpdates', need: 100 },

  { id: 'vol1', title: 'Volunteer at 1 event', points: 5, counter: 'volunteerEvents', need: 1 },
  { id: 'vol5', title: 'Volunteer at 5 events', points: 15, counter: 'volunteerEvents', need: 5 },
  { id: 'vol10', title: 'Volunteer at 10 events', points: 30, counter: 'volunteerEvents', need: 10 },
  { id: 'vol20', title: 'Volunteer at 20 events', points: 50, counter: 'volunteerEvents', need: 20 },

  { id: 'invite1', title: 'Invite 1 player who joins', points: 5, counter: 'invites', need: 1 },
  { id: 'invite3', title: 'Invite 3 players', points: 10, counter: 'invites', need: 3 },
  { id: 'invite10', title: 'Invite 10 players', points: 25, counter: 'invites', need: 10 },

  { id: 'host1', title: 'Host 1 meetup', points: 10, counter: 'meetups', need: 1 },
  { id: 'host5', title: 'Host 5 meetups', points: 30, counter: 'meetups', need: 5 },
  { id: 'host10', title: 'Host 10 meetups', points: 50, counter: 'meetups', need: 10 },
];

// The Initiation checklist — every task is unlocked, so completing every one of these awards
// the flat SETUP_POINTS bonus (mirrors UNLOCKED_TASK_IDS in useTasks.ts).
// 'ladderMatch' was removed from this list — it gated the Member badge behind the ladder,
// which most new players never reach. The field is still written when someone plays a ladder
// match (see taskPoints.js), it just no longer counts toward setupComplete.
const INITIATION_TASK_IDS = [
  'profileComplete',
  'followSocial',
  'tagPost',
  'waitingBoard',
  'courtVisit',
  'queuePhoto',
  'playMatch',
  'courtSuggestion',
  'whatsappGroup',
  'profilePhoto',
  'joinEvent',
];

const TIER_POINTS = Object.fromEntries(ALL_TIERS.map((t) => [t.id, t.points]));

// Server twin of taskPoints() in src/features/tasks/useTasks.ts. `progress` is the raw
// tasks/{uid} document data (or undefined/null if the doc doesn't exist yet).
function earnedRsPoints(progress) {
  if (!progress) return 0;
  const setup = progress.setupComplete ? SETUP_POINTS : 0;
  const tiers = ALL_TIERS.reduce((n, t) => n + (progress[t.id] ? t.points : 0), 0);
  const bonus = typeof progress.bonusPoints === 'number' ? progress.bonusPoints : 0;
  return setup + tiers + bonus;
}

module.exports = { SETUP_POINTS, ALL_TIERS, INITIATION_TASK_IDS, TIER_POINTS, earnedRsPoints };
