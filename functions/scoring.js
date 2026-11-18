/**
 * `scoreMatch`: the one way in to scoring, for every match type. `action` picks what to do:
 *   record  a result (player or organizer; `newMatch` = organizer records a played challenge/rally)
 *   settle  a disputed result: approve or reject the disputing score (organizer)
 *   reset   one played match (tournament, challenge or rally) back to unplayed (organizer)
 *   cancel  a draw's matches (organizer)
 *   bonus   a round-robin group's bonus on or off (organizer)
 *   champion  name a one-group round robin's leader as its winner, or take it back (organizer)
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
  champion: (db, uid, d) => scoring.groupChampion(db, {
    uid, eventId: str(d.eventId, 'event'), matchIds: ids(d.matchIds), winnerUid: d.winnerUid ? str(d.winnerUid, 'winner') : null,
  }),
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

/**
 * `pastResults`: two finished draws of a completed tournament (one Men's and one Women's when it
 * has both, otherwise any two), picked at random on each call. Public: a signed-out caller gets
 * players as "Player A", "Player B"… per draw; a member gets names. Never returns a uid or a contact
 * (the court played at is included, the owner's call), so `matches` and `submissions` stay members-only in the rules.
 *
 * Deploy: firebase deploy --only functions:pastResults
 */
const SLOT_NAMES = new Set(['BYE', 'Player Loading']);
const letters = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const pickRandom = (list) => list.splice(Math.floor(Math.random() * list.length), 1)[0];

exports.pastResults = onCall({ region: REGION }, async (request) => {
  const eventId = str((request.data || {}).eventId, 'event');
  const db = admin.firestore();
  const eventSnap = await db.collection('events').doc(eventId).get();
  const event = eventSnap.data();
  if (!event || !event.completed_at || event.status === 'cancelled' || !/_tournament$/.test(event.category || '')) {
    throw new HttpsError('not-found', 'No results for this event.');
  }

  const [matchSnap, subSnap] = await Promise.all([
    db.collection('matches').where('event_id', '==', eventId).get(),
    db.collection('submissions').where('event_id', '==', eventId).where('status', '==', 'applied').get(),
  ]);
  const results = new Map(subSnap.docs.map((d) => d.data())
    .filter((s) => ['result', 'correction', 'walkover'].includes(s.sub_category))
    .map((s) => [s.match_id, s]));

  const draws = new Map();
  for (const d of matchSnap.docs) {
    const m = d.data();
    if (m.category !== 'tournament' || m.status === 'cancelled') continue;
    // A round robin's knockout ids carry '_rr_ko' after the draw key; it belongs to the same draw.
    const key = (scoring.drawKeyOf(d.id, m) || [m.sub_category, m.division, m.skill_group, m.zone || ''].join('|')).replace(/_rr_ko$/, '');
    if (!draws.has(key)) draws.set(key, []);
    draws.get(key).push({ id: d.id, m });
  }

  // One Men's and one Women's draw when there are both, then anything to make two.
  const pool = [...draws.keys()];
  const of = (prefix) => pool.filter((k) => String(draws.get(k)[0].m.division || '').startsWith(prefix));
  const chosen = [];
  for (const prefix of ["Men's", "Women's"]) {
    const options = of(prefix);
    if (options.length && chosen.length < 2) {
      const k = pickRandom(options);
      chosen.push(k);
      pool.splice(pool.indexOf(k), 1);
    }
  }
  while (chosen.length < 2 && pool.length) chosen.push(pickRandom(pool));

  const named = !!(request.auth && request.auth.uid);
  return {
    title: event.title || 'Tournament',
    roundDeadlines: event.round_deadlines || {},
    draws: chosen.map((key) => {
      const rows = draws.get(key);
      const first = rows[0].m;
      // Each person gets one stand-in id (and, signed out, one letter) for the whole draw.
      const alias = new Map();
      const aliasOf = (uid, name) => {
        if (!uid || SLOT_NAMES.has(name)) return { uid: '', name: name || 'Player Loading' };
        if (!alias.has(uid)) alias.set(uid, `p${alias.size + 1}`);
        const id = alias.get(uid);
        const n = Number(id.slice(1)) - 1;
        return { uid: id, name: named ? name : `${first.sub_category === 'doubles' ? 'Team' : 'Player'} ${letters(n)}` };
      };
      const sorted = [...rows].sort((a, b) => String(a.m.match_id).localeCompare(String(b.m.match_id), undefined, { numeric: true }));
      return {
        key,
        division: first.division || '',
        skillGroup: first.skill_group || '',
        zone: first.zone || '',
        subCategory: first.sub_category || 'singles',
        matches: sorted.map(({ id, m }) => {
          const p1 = aliasOf(m.player_1_uid, m.player_1_name);
          const p2 = aliasOf(m.player_2_uid, m.player_2_name);
          const s = results.get(id);
          const winner = m.winner_uid === m.player_1_uid ? p1.uid : m.winner_uid === m.player_2_uid ? p2.uid : '';
          return {
            match_id: m.match_id || '',
            round: m.round || '',
            group_label: m.group_label || '',
            format: m.format || '',
            drawsize: m.drawsize || 0,
            next_match_id: m.next_match_id || '',
            status: m.status || '',
            player_1_uid: p1.uid, player_1_name: p1.name,
            player_2_uid: p2.uid, player_2_name: p2.name,
            winner_uid: winner,
            result: s ? {
              walkover: s.sub_category === 'walkover',
              sets: [1, 2, 3].map((i) => [s[`set_${i}_player_1`] || 0, s[`set_${i}_player_2`] || 0]),
              // `completed_at` is pinned to the first time the score was recorded.
              recordedAt: s.completed_at ? s.completed_at.toMillis() : 0,
              court: s.court || '',
            } : null,
          };
        }),
      };
    }),
  };
});
