/**
 * `scoreMatch`: the one way in to scoring, for every match type. `action` picks what to do:
 *   record  a result (player or organizer; `newMatch` = organizer records a played challenge/rally)
 *   settle  a disputed result: approve or reject the disputing score (organizer)
 *   reset   one tournament match back to unplayed (organizer)
 *   cancel  a draw's matches (organizer)
 *   bonus   a round-robin group's bonus on or off (organizer)
 * Everything happens in lib/scoring.js; this only checks the caller and turns refusals into
 * player-readable messages. Alerts and task progress react to the recorded match elsewhere.
 *
 * Deploy: firebase deploy --only functions:scoreMatch
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const { REGION } = require('./lib/constants');
const { requireAuth, requireTrimmedString } = require('./lib/callable');
const scoring = require('./lib/scoring');

const str = (v, what) => requireTrimmedString(v, `Missing ${what}.`, { maxLength: 500 });
const ids = (v) => {
  const list = Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
  if (list.length === 0 || list.length > 300) throw new HttpsError('invalid-argument', 'No matches given.');
  return list;
};

const ACTIONS = {
  record: (db, uid, d) => scoring.recordScore(db, d.newMatch
    ? { callerUid: uid, newMatch: d.newMatch, input: d }
    : { callerUid: uid, matchId: str(d.matchId, 'match'), input: d }),
  settle: (db, uid, d) => scoring.settleDispute(db, { uid, matchId: str(d.matchId, 'match'), approve: d.approve === true }),
  reset: (db, uid, d) => scoring.resetScore(db, { uid, matchId: str(d.matchId, 'match') }),
  cancel: (db, uid, d) => scoring.cancelDraw(db, { uid, eventId: str(d.eventId, 'event'), matchIds: ids(d.matchIds) }),
  bonus: (db, uid, d) => scoring.groupBonus(db, { uid, eventId: str(d.eventId, 'event'), matchIds: ids(d.matchIds), award: d.award === true }),
};

exports.scoreMatch = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const run = ACTIONS[data.action];
  if (!run) throw new HttpsError('invalid-argument', 'Unknown scoring action.');
  try {
    return { result: await run(admin.firestore(), uid, data) };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    if (err instanceof scoring.ResultError) throw new HttpsError(err.code, err.message);
    logger.error(`scoreMatch ${data.action} failed`, { err: String(err) });
    throw new HttpsError('internal', 'Something went wrong. Please try again.');
  }
});
