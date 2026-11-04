/**
 * The tier catalogue + RS points. RS points = the tiers a member's stats counters have reached +
 * the initiation bonus + every task-ledger award they hold. Stored on stats.rsPoints and recomputed
 * (never incremented) whenever a counter or an award changes, so it cannot drift.
 *
 * Lives in lib/ for the same reason constants.js does: index.js re-exports its modules wholesale
 * via `Object.assign(exports, require('./x'))` and the Firebase CLI treats every export it finds
 * there as a Cloud Function, so plain values must not be exported from a function module.
 *
 * MIRRORS src/features/tasks/taskCatalog.ts — keep the two in sync by hand (the client and the
 * functions are separate packages). `taskPointsOf` is the server twin of taskPoints() in
 * src/features/tasks/useTasks.ts.
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
  // zoneComplete is set by the visit that completes the member's zone (taskPoints.js).
  { id: 'visitZone', title: 'Visit every court in your zone', points: 30, counter: 'zoneComplete', need: 1 },

  { id: 'board1', title: 'Submit 1 waiting board report', points: 5, counter: 'boardPhotos', need: 1 },
  { id: 'board5', title: 'Submit 5 waiting board reports', points: 15, counter: 'boardPhotos', need: 5 },
  { id: 'board10', title: 'Submit 10 waiting board reports', points: 25, counter: 'boardPhotos', need: 10 },
  { id: 'board20', title: 'Submit 20 waiting board reports', points: 40, counter: 'boardPhotos', need: 20 },

  { id: 'queue10', title: 'Submit 10 queue updates', points: 10, counter: 'queueUpdates', need: 10 },
  { id: 'queue25', title: 'Submit 25 queue updates', points: 20, counter: 'queueUpdates', need: 25 },
  { id: 'queue50', title: 'Submit 50 queue updates', points: 35, counter: 'queueUpdates', need: 50 },
  { id: 'queue100', title: 'Submit 100 queue updates', points: 50, counter: 'queueUpdates', need: 100 },

  { id: 'vol1', title: 'Volunteer at 1 event', points: 5, counter: 'volunteerApproved', need: 1 },
  { id: 'vol5', title: 'Volunteer at 5 events', points: 15, counter: 'volunteerApproved', need: 5 },
  { id: 'vol10', title: 'Volunteer at 10 events', points: 30, counter: 'volunteerApproved', need: 10 },
  { id: 'vol20', title: 'Volunteer at 20 events', points: 50, counter: 'volunteerApproved', need: 20 },

  { id: 'invite1', title: 'Invite 1 player who joins', points: 5, counter: 'inviteApproved', need: 1 },
  { id: 'invite3', title: 'Invite 3 players', points: 10, counter: 'inviteApproved', need: 3 },
  { id: 'invite10', title: 'Invite 10 players', points: 25, counter: 'inviteApproved', need: 10 },

  { id: 'host1', title: 'Host 1 meetup', points: 10, counter: 'hostApproved', need: 1 },
  { id: 'host5', title: 'Host 5 meetups', points: 30, counter: 'hostApproved', need: 5 },
  { id: 'host10', title: 'Host 10 meetups', points: 50, counter: 'hostApproved', need: 10 },
];

// The Initiation checklist: every item done awards the flat SETUP_POINTS bonus (mirrors useTasks.ts).
// A counter item is done at 1; the rest are the member's own one-time booleans on stats.
const INITIATION = [
  { id: 'profileComplete' }, { id: 'followSocial' }, { id: 'tagPost' }, { id: 'whatsappGroup' }, { id: 'profilePhoto' },
  { id: 'joinEvent', counter: 'eventsJoined' }, { id: 'playMatch', counter: 'matchesPlayed' },
  { id: 'courtVisit', counter: 'courtsVisited' }, { id: 'waitingBoard', counter: 'boardPhotos' },
  { id: 'queuePhoto', counter: 'queueUpdates' }, { id: 'courtSuggestion', counter: 'suggestions' },
];

const num = (v) => (typeof v === 'number' ? v : 0);
const initiationDone = (stats) => !!stats && INITIATION.every((i) => (i.counter ? num(stats[i.counter]) >= 1 : stats[i.id] === true));

/** Task points a stats doc has reached: tiers by counter + the initiation bonus. */
function taskPointsOf(stats) {
  if (!stats) return 0;
  const tiers = ALL_TIERS.reduce((sum, t) => sum + (num(stats[t.counter]) >= t.need ? t.points : 0), 0);
  return tiers + (initiationDone(stats) ? SETUP_POINTS : 0);
}

/**
 * Inside a transaction: the stats patch with rsPoints recomputed from the counters (after `patch`)
 * + every task-ledger award naming the member. Does reads, so call it before the transaction writes.
 */
async function rsPointsPatch(tx, db, uid, patch = {}) {
  const [statsSnap, awardsSnap] = await Promise.all([
    tx.get(db.collection('stats').doc(uid)),
    tx.get(db.collection('awards').where('awardees', 'array-contains', uid).where('sub_category', '==', 'task')),
  ]);
  const next = { ...(statsSnap.exists ? statsSnap.data() : {}), ...patch };
  const awardPoints = awardsSnap.docs.reduce((sum, d) => sum + num(d.data().points_each), 0);
  return { ...patch, rsPoints: taskPointsOf(next) + awardPoints };
}

module.exports = { num, initiationDone, rsPointsPatch };
