/**
 * Scoring: the ONE module that decides points and writes them to `stats`.
 *
 * - `POINTS` is the only copy of the points rules. A match's type picks its row.
 * - Every score entry is a `submissions` doc, kept forever. The match carries only its lifecycle
 *   `status` and `winner_uid`; the result (sets, walkover, points, ledger) lives on the applied entry.
 * - `commitPoints` is the only function in the codebase that writes league points to `stats`.
 * - Points already paid never move: the applied entry stores what it paid (`points_winner` /
 *   `points_loser`, with its sets), and `paymentOf` turns that into the per-player changes for both
 *   paying and undoing, so the two can't drift. A reset is its own entry carrying the negation.
 * - The round-robin group bonus is an `awards` doc (sub_category league); it pays leaguePoints.
 *
 * Helpers only (no Cloud Function exports): see notify.js for why helpers live under lib/.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { isOrganizer } = require('./roles');
const { toDate, isGuest } = require('./constants');
const { skillBand, orderOf } = require('./participantSeat');

// ── The points table ───────────────────────────────────────────────────────────
const POINTS = {
  rally: { win: 2, loss: 1 },
  challenge: { win: 3, loss: -3 }, // the loss never takes a player below 0
  group: { win: 3, loss: 1, walkoverWin: 1 },
  knockout: { win: 0, finalWin: 20, walkoverWin: 0, lossByRound: { R32: 1, R16: 2, QF: 3, SF: 5, F: 10 } },
  groupBonus: 5,
};

const MAX_GAME_SCORE = 99;
const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // a player may fix their own entry this long
const SCORE_FIELDS = [
  ['set_1_player_1', 'set_1_player_2'],
  ['set_2_player_1', 'set_2_player_2'],
  ['set_3_player_1', 'set_3_player_2'],
];
// A submission is the current result when applied and not a reset row.
const RESULT_KINDS = ['result', 'correction', 'walkover'];

class ResultError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (message, code = 'invalid-argument') => { throw new ResultError(code, message); };

const isTournament = (m) => m.category === 'tournament';
const isDoubles = (m) => m.sub_category === 'doubles';
const isGroupMatch = (m) => m.format === 'rr' && m.round === 'RR';
const kindOf = (m) => (isTournament(m) ? (isGroupMatch(m) ? 'group' : 'knockout') : m.category);

/**
 * A result that was actually played: an applied tournament entry with games (not a walkover), or
 * an applied challenge/rally entry. Task progress and the Matchday bonus both use it.
 */
const isPlayedResult = (sub) => {
  if (!sub || sub.status !== 'applied' || !RESULT_KINDS.includes(sub.sub_category) || !sub.winner_uid) return false;
  if (sub.sub_category === 'walkover') return false;
  if (sub.category !== 'tournament') return true;
  return SCORE_FIELDS.some(([a, b]) => (sub[a] ?? 0) + (sub[b] ?? 0) > 0);
};

/** League points a result pays, from the table. */
function pointsFor(match, walkover) {
  const kind = kindOf(match);
  const row = POINTS[kind];
  if (kind === 'knockout') {
    const loser = row.lossByRound[match.round] ?? 1;
    if (walkover) return { winner: row.walkoverWin, loser };
    return { winner: match.round === 'F' ? row.finalWin : row.win, loser };
  }
  if (kind === 'group' && walkover) return { winner: row.walkoverWin, loser: row.loss };
  return { winner: row.win, loser: row.loss };
}

// ── Results ────────────────────────────────────────────────────────────────────

function normalizeScores(value) {
  if (value === undefined) return [[0, 0], [0, 0], [0, 0]];
  if (!Array.isArray(value) || value.length !== 3) fail('Exactly three score pairs are required.');
  return value.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) fail('Each set must contain two scores.');
    return pair.map((score) => {
      if (!Number.isInteger(score) || score < 0 || score > MAX_GAME_SCORE) {
        fail(`Scores must be whole numbers from 0 to ${MAX_GAME_SCORE}.`);
      }
      return score;
    });
  });
}

// The only score check: the client and the rules no longer repeat it.
function validateSetScores(scores) {
  const played = scores.filter(([a, b]) => a !== 0 || b !== 0);
  if (played.length === 0) fail('Enter the games for each set played.');
  for (const [a, b] of played) {
    if (a === b) fail('A set cannot be tied.');
    if (Math.max(a, b) > 21 && Math.abs(a - b) !== 2) fail(`${a}-${b} isn't a valid set. Above 21 the margin has to be exactly 2.`);
  }
}

const marginOf = (scores, winnerUid, match) => {
  const w = winnerUid === match.player_1_uid ? 0 : 1;
  return scores.reduce((sum, [a, b]) => sum + (w === 0 ? a - b : b - a), 0);
};

/** A submitted result, validated. Throws ResultError with a player-readable message. */
function normalizeResult(input, match) {
  if (!input || typeof input !== 'object') fail('Missing result.');
  const walkover = input.walkover === true;
  const scores = normalizeScores(input.scores);
  if (walkover && !scores.every(([a, b]) => a === 0 && b === 0)) fail('A walkover has no games.');
  if (!walkover) validateSetScores(scores);
  const winnerUid = typeof input.winnerUid === 'string' ? input.winnerUid.trim() : '';
  if (!winnerUid || ![match.player_1_uid, match.player_2_uid].includes(winnerUid)) {
    fail('Please choose who won the match.');
  }
  if (!walkover) {
    const w = winnerUid === match.player_1_uid ? 0 : 1;
    const sets = [0, 0];
    scores.forEach(([a, b]) => { if (a > b) sets[0] += 1; if (b > a) sets[1] += 1; });
    if (sets[w] <= sets[1 - w]) fail('The winner must have won more sets.');
  }
  const court = typeof input.court === 'string' ? input.court.trim() : '';
  if (court.length > 200) fail('Court name is too long.');
  return { winnerUid, scores, walkover, court, margin: marginOf(scores, winnerUid, match) };
}

/** The result an entry records. */
function resultOf(sub, match) {
  const scores = SCORE_FIELDS.map(([a, b]) => [sub[a] ?? 0, sub[b] ?? 0]);
  return { winnerUid: sub.winner_uid || '', scores, walkover: sub.sub_category === 'walkover', court: sub.court || '', margin: marginOf(scores, sub.winner_uid, match) };
}

const scoreFieldPatch = (scores) =>
  Object.fromEntries(SCORE_FIELDS.flatMap(([a, b], i) => [[a, scores[i][0]], [b, scores[i][1]]]));

// ── Points ─────────────────────────────────────────────────────────────────────

const addDelta = (map, uid, delta) => {
  if (!uid) return;
  const cur = map.get(uid) || {};
  Object.entries(delta).forEach(([k, v]) => { if (v) cur[k] = (cur[k] || 0) + v; });
  map.set(uid, cur);
};

const creditedUids = (uid, partners) => {
  const p = partners.get(uid);
  return p && p !== uid ? [uid, p] : [uid];
};

/** What a new result pays: the table, a challenge loss capped at what the loser has. */
function pointsToPay(match, result, loserBalance = Infinity) {
  const pts = pointsFor(match, result.walkover);
  if (kindOf(match) === 'challenge') pts.loser = -Math.min(-pts.loser, Math.max(0, loserBalance));
  return pts;
}

/**
 * Stat changes a result makes, per uid, given the points it pays (`pts` = { winner, loser }). The
 * one source for paying a result and, negated, for undoing a stored one (`paidBy`).
 */
function paymentOf(match, result, pts, partners = new Map()) {
  const deltas = new Map();
  const kind = kindOf(match);
  const tournament = kind === 'group' || kind === 'knockout';
  const played = !result.walkover;

  const winnerIsP1 = result.winnerUid === match.player_1_uid;
  const loserUid = winnerIsP1 ? match.player_2_uid : match.player_1_uid;
  const p1 = result.scores.reduce((s, [a]) => s + a, 0);
  const p2 = result.scores.reduce((s, [, b]) => s + b, 0);
  const side = (won) => ({
    leaguePoints: won ? pts.winner : pts.loser,
    ...(played ? { matchesPlayed: 1, [won ? 'wins' : 'loses']: 1 } : {}),
    ...(played && tournament ? { pointswon: won === winnerIsP1 ? p1 : p2, totalPointsPlayed: p1 + p2 } : {}),
  });
  const credited = (uid) => (tournament ? creditedUids(uid, partners) : [uid]);
  credited(result.winnerUid).forEach((uid) => addDelta(deltas, uid, side(true)));
  credited(loserUid).forEach((uid) => addDelta(deltas, uid, side(false)));
  return deltas;
}

/** What a stored result entry paid, from its own points and sets. Undoing negates exactly this. */
const paidBy = (entry, match, partners) => (entry
  ? paymentOf(match, resultOf(entry, match), { winner: entry.points_winner || 0, loser: entry.points_loser || 0 }, partners)
  : new Map());

// A guest's stats doc: the member shape (profileBootstrap.ts), every counter 0.
const ZERO_STATS = ['leaguePoints', 'leaguePointsPrev', 'matchesPlayed', 'wins', 'pointswon', 'totalPointsPlayed',
  'tournamentsPlayed', 'rankPosition', 'rankMove', 'eventsJoined', 'challengesPlayed', 'challengesWon', 'courtsVisited',
  'zoneComplete', 'suggestions', 'boardPhotos', 'queueUpdates', 'currentStreak', 'bestStreak', 'monthsActive',
  'volunteerClaimed', 'volunteerApproved', 'inviteClaimed', 'inviteApproved', 'hostClaimed', 'hostApproved', 'rsPoints', 'pointsSpent'];
const guestStats = (uid, name) => ({
  uid, name: name || '', skill_level: 0, league: '', ...Object.fromEntries(ZERO_STATS.map((k) => [k, 0])),
  rankTrend: 'flat', rankUpdatedAt: null, profilePhoto: false, profileComplete: false, whatsappGroup: false,
  followSocial: false, tagPost: false, active_months: [], latestVolunteerStatus: 'none', latestInviteStatus: 'none',
  latestHostStatus: 'none', updated_at: FieldValue.serverTimestamp(),
});

/**
 * THE ONLY FUNCTION THAT WRITES LEAGUE POINTS TO `stats`. Undoes `undo`, applies `apply`, one net
 * increment per player, inside the caller's transaction (call it before any other write: it reads
 * guests' stats). A guest is given a stats doc the first time they are paid, named from `guestNames`.
 * `loses` is never stored (losses derive as matchesPlayed - wins), so it is dropped here.
 */
async function commitPoints(tx, db, { undo = new Map(), apply = new Map(), guestNames = new Map() } = {}) {
  const net = new Map();
  for (const [uid, d] of undo) addDelta(net, uid, Object.fromEntries(Object.entries(d).map(([k, v]) => [k, -v])));
  for (const [uid, d] of apply) addDelta(net, uid, d);
  const guests = [...net.keys()].filter(isGuest);
  const guestSnaps = new Map(await Promise.all(guests.map(async (u) => [u, await tx.get(db.collection('stats').doc(u))])));
  for (const [uid, delta] of net) {
    const values = {};
    Object.entries(delta).forEach(([k, v]) => { if (k !== 'loses' && typeof v === 'number' && v) values[k] = FieldValue.increment(v); });
    if (Object.keys(values).length === 0) continue;
    const ref = db.collection('stats').doc(uid);
    if (guestSnaps.has(uid) && !guestSnaps.get(uid).exists) {
      if (apply.has(uid)) tx.set(ref, { ...guestStats(uid, guestNames.get(uid)), ...values });
      continue;
    }
    tx.set(ref, { ...values, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  }
}

// ── Draw helpers ───────────────────────────────────────────────────────────────

const sameDraw = (a, b) =>
  a.sub_category === b.sub_category &&
  a.division === b.division &&
  a.skill_group === b.skill_group &&
  (a.zone || '') === (b.zone || '');

/** `{eventId}_{drawKey}_{matchId}` → drawKey. */
const drawKeyOf = (docId, match) => {
  const e = match.event_id || '', mid = match.match_id || '';
  return docId.startsWith(`${e}_`) && docId.endsWith(`_${mid}`) ? docId.slice(e.length + 1, -mid.length - 1) : '';
};

async function nextTarget(tx, db, match, matchId) {
  if (!match.next_match_id) return null;
  const snap = await tx.get(db.collection('matches').where('event_id', '==', match.event_id));
  const inDraw = snap.docs.filter((d) => sameDraw(d.data(), match));
  const next = inDraw.find((d) => d.data().match_id === match.next_match_id);
  if (!next) return null;
  let slot = match.next_slot;
  if (slot !== 'player_1' && slot !== 'player_2') {
    const siblings = inDraw
      .filter((d) => d.data().next_match_id === match.next_match_id)
      .sort((a, b) => orderOf(a.data().match_id) - orderOf(b.data().match_id));
    slot = siblings.findIndex((d) => d.id === matchId) <= 0 ? 'player_1' : 'player_2';
  }
  return { ref: next.ref, data: next.data(), slot };
}

/** An event's active doubles registrations that name a partner. */
async function doublesRegs(tx, db, eventId) {
  if (!eventId) return [];
  const snap = await tx.get(db.collection('event_participants').where('event_id', '==', eventId));
  return snap.docs.map((d) => d.data())
    .filter((p) => p.category === 'doubles_tournament' && p.status === 'active' && p.uid && p.partner_uid);
}

/** A doubles match's teams from those registrations: uid → partner uid, and each guest partner's name. */
function teamsOf(regs, match) {
  const partners = new Map();
  const guestNames = new Map();
  if (!isDoubles(match)) return { partners, guestNames };
  regs.filter((p) => !match.division || match.division === 'All' || p.division === match.division).forEach((p) => {
    partners.set(p.uid, p.partner_uid);
    if (isGuest(p.partner_uid)) guestNames.set(p.partner_uid, p.partner_name || '');
  });
  return { partners, guestNames };
}

const partnersFor = async (tx, db, match) => teamsOf(isDoubles(match) ? await doublesRegs(tx, db, match.event_id) : [], match);

/** A match's participant_uids once `slot` holds `uid`: both sides plus their doubles partners (as the draw editor keeps it). */
const onCourtAfter = (data, slot, uid, partners) => {
  const sides = [slot === 'player_1' ? uid : data.player_1_uid, slot === 'player_2' ? uid : data.player_2_uid].filter(Boolean);
  return [...new Set([...sides, ...sides.map((u) => partners.get(u) || '')].filter(Boolean))];
};

/** The applied result entry of a match (null when unplayed), read inside the transaction. */
async function currentEntry(tx, db, matchId) {
  const snap = await tx.get(db.collection('submissions').where('match_id', '==', matchId).where('status', '==', 'applied'));
  const docs = snap.docs.filter((d) => RESULT_KINDS.includes(d.data().sub_category));
  return docs.length ? { ref: docs[0].ref, id: docs[0].id, data: docs[0].data() } : null;
}

/** A full submissions doc: every field present (uniform shape), typed empties where not used. */
function entryDoc(match, matchId, fields) {
  const now = Timestamp.now();
  return {
    category: match.category, sub_category: 'result', status: 'applied', match_id: matchId, event_id: match.event_id || '',
    uid: '', user_name: '', winner_uid: '', winner_name: '', ...scoreFieldPatch([[0, 0], [0, 0], [0, 0]]), court: '',
    replaces_id: '', points_winner: 0, points_loser: 0, applied_at: null, completed_at: null,
    resolved_by: '', resolved_at: null, created_at: now, updated_at: now,
    ...fields,
  };
}

/** A full matches doc for a challenge/rally an organizer records for two other members. */
function playedMatchFor(input) {
  const n = input && typeof input === 'object' ? input : {};
  if (!['rally', 'challenge'].includes(n.category)) fail('Only a challenge or a rally can be recorded this way.');
  const uids = [n.player_1_uid, n.player_2_uid];
  if (!uids.every((u) => typeof u === 'string' && u) || uids[0] === uids[1]) fail('Pick two different players.');
  if (n.category === 'challenge' && (typeof n.event_id !== 'string' || !n.event_id)) fail('There is no active league ladder to record a challenge in.');
  const now = Timestamp.now();
  return {
    category: n.category, sub_category: 'singles', status: 'accepted',
    player_1_uid: uids[0], player_1_name: String(n.player_1_name || ''),
    player_2_uid: uids[1], player_2_name: String(n.player_2_name || ''),
    participant_uids: uids, event_id: n.category === 'challenge' ? n.event_id : '', winner_uid: '',
    responded_at: now, created_at: now, updated_at: now,
    match_id: '', round: '', drawsize: 0, division: '',
    skill_group: '', zone: '', format: '', player_1_slot: 0, player_2_slot: 0, next_match_id: '', next_slot: '', started: false,
    group_label: n.category,
  };
}

const BANDS = ['Beginners', 'Challengers', 'Masters'];
/**
 * A recorded challenge/rally's division and skill band, from both players' stats: the shared
 * `league` (else 'Mixed'), and the lower of their bands. One side missing → the other's.
 */
// Same as leagueDivision / pairDivision in src/utils/skillLevels.ts — change together.
const leagueDivision = (league) => {
  const l = String(league || '').toLowerCase();
  return l.includes('wom') || l.includes('female') ? "Women's" : l.includes('men') || l.includes('male') ? "Men's" : '';
};

function pairDraw(a = {}, b = {}) {
  const [la, lb] = [leagueDivision(a.league), leagueDivision(b.league)];
  const division = la && la === lb ? la : 'Mixed';
  const bands = [a, b].filter((s) => Number(s.skill_level) > 0).map((s) => skillBand(Number(s.skill_level)));
  return { division, skill_group: bands.sort((x, y) => BANDS.indexOf(x) - BANDS.indexOf(y))[0] || '' };
}

const nameOf = async (tx, db, uid) => {
  if (!uid) return '';
  const s = await tx.get(db.collection('users').doc(uid));
  return (s.exists && s.data().name) || '';
};

/**
 * Records a result on a tournament match, challenge or rally, by a player or an organizer, in one
 * transaction: the entry, its points, advancement and event completion.
 *
 * - Nothing recorded yet: it counts at once.
 * - A player naming a different winner from the recorded one: a `disputed` entry (organizer
 *   approves or rejects it with settleDispute). Nothing moves.
 * - A player naming the same winner: the one who entered it may fix it within 7 days; anyone
 *   else's replaces it only if closer. Otherwise the entry is kept as `superseded`.
 * - An organizer: replaces anything, except a winner change once the next round is played.
 *
 * `newMatch` creates a challenge/rally two other members already played (organizer only).
 * `applyEntryId` (settleDispute) applies an existing disputed entry instead of writing a new one.
 */
async function recordScore(db, { callerUid, matchId, input, newMatch, applyEntryId }) {
  return db.runTransaction(async (tx) => {
    const now = Timestamp.now();
    let matchRef;
    let match;
    if (newMatch) {
      match = playedMatchFor(newMatch);
      matchRef = db.collection('matches').doc();
      const [s1, s2] = await tx.getAll(db.collection('stats').doc(match.player_1_uid), db.collection('stats').doc(match.player_2_uid));
      Object.assign(match, pairDraw(s1.data(), s2.data()));
    } else {
      matchRef = db.collection('matches').doc(matchId);
      const snap = await tx.get(matchRef);
      if (!snap.exists) fail('Match not found.', 'not-found');
      match = snap.data();
    }
    const tournament = isTournament(match);
    if (!tournament && !['challenge', 'rally'].includes(match.category)) fail('That match cannot be scored.');
    if (!match.player_1_uid || !match.player_2_uid || match.player_1_uid === match.player_2_uid) {
      fail('Both players must be in the match before a score can be recorded.', 'failed-precondition');
    }
    if (tournament && !match.event_id) fail('That match has no event.');

    const eventSnap = match.event_id ? await tx.get(db.collection('events').doc(match.event_id)) : null;
    const event = eventSnap && eventSnap.exists ? eventSnap.data() : null;
    const organizer = await isOrganizer(callerUid, event);
    const { partners, guestNames } = await partnersFor(tx, db, match);
    const sides = [match.player_1_uid, match.player_2_uid];
    const isPlayer = sides.includes(callerUid) || sides.some((uid) => partners.get(uid) === callerUid);
    if (newMatch && !organizer) fail('Only an organizer can record a match for two other players.', 'permission-denied');
    if (!organizer && !isPlayer) fail('Only the two players or an organizer can record this score.', 'permission-denied');
    if (!tournament && !newMatch && !['accepted', 'complete'].includes(match.status)) {
      fail('That match is not ready for a score yet.', 'failed-precondition');
    }

    const current = newMatch ? null : await currentEntry(tx, db, matchRef.id);
    const pending = applyEntryId ? await tx.get(db.collection('submissions').doc(applyEntryId)) : null;
    const result = pending ? resultOf(pending.data(), match) : normalizeResult(input, match);
    if (result.walkover && !tournament) fail('Walkovers are only for tournament matches.');
    if (result.walkover && !organizer) fail('Only the organizer can record a walkover.', 'permission-denied');

    const callerName = await nameOf(tx, db, callerUid);
    const winnerName = result.winnerUid === match.player_1_uid ? match.player_1_name : match.player_2_name;
    const entryFields = {
      uid: callerUid, user_name: callerName, winner_uid: result.winnerUid, winner_name: winnerName,
      ...scoreFieldPatch(result.scores), court: result.court, sub_category: result.walkover ? 'walkover' : 'result',
    };
    const old = current ? resultOf(current.data, match) : null;
    const keep = (status) => { tx.set(db.collection('submissions').doc(), entryDoc(match, matchRef.id, { ...entryFields, status })); };

    if (old && !pending && old.winnerUid === result.winnerUid && old.walkover === result.walkover &&
      JSON.stringify(old.scores) === JSON.stringify(result.scores)) {
      keep('superseded');
      return { duplicate: true, matchId: matchRef.id };
    }
    if (old && !organizer) {
      if (old.walkover) fail('Only the organizer can change this result.', 'permission-denied');
      if (result.winnerUid !== old.winnerUid) {
        keep('disputed');
        return { inDispute: true, matchId: matchRef.id };
      }
      const enteredAt = toDate(current.data.created_at);
      const ownFix = callerUid === current.data.uid && enteredAt && Date.now() - enteredAt.getTime() <= EDIT_WINDOW_MS;
      if (!ownFix && result.margin >= old.margin) {
        keep('superseded');
        return { recordedOnly: true, matchId: matchRef.id };
      }
    }

    const target = tournament ? await nextTarget(tx, db, match, matchRef.id) : null;
    const occupant = target ? target.data[`${target.slot}_uid`] : '';
    if (old && target && result.winnerUid !== old.winnerUid && target.data.status === 'complete') {
      fail('The next round has already been played, so the winner can no longer change.', 'failed-precondition');
    }
    if (!old && target && occupant && occupant !== result.winnerUid) {
      fail('The next-round spot already holds another player. Fix the draw first.', 'failed-precondition');
    }

    // Points: undo exactly what the current entry paid (its stored points), pay the new result.
    const undo = paidBy(current && current.data, match, partners);
    let loserBalance = Infinity;
    if (match.category === 'challenge') {
      const loserUid = result.winnerUid === match.player_1_uid ? match.player_2_uid : match.player_1_uid;
      const s = await tx.get(db.collection('stats').doc(loserUid));
      loserBalance = (s.exists ? s.data().leaguePoints ?? 0 : 0) - (undo.get(loserUid)?.leaguePoints ?? 0);
    }
    const paid = pointsToPay(match, result, loserBalance);
    await commitPoints(tx, db, { undo, apply: paymentOf(match, result, paid, partners), guestNames });
    const appliedFields = {
      status: 'applied',
      sub_category: result.walkover ? 'walkover' : old ? 'correction' : 'result',
      replaces_id: current ? current.id : '',
      points_winner: paid.winner, points_loser: paid.loser, applied_at: now,
      // Pinned to the first scoring of the match: corrections carry the original time.
      completed_at: current ? current.data.completed_at || now : now,
      updated_at: now,
    };
    if (pending) {
      tx.update(pending.ref, { ...appliedFields, resolved_by: callerUid, resolved_at: now });
    } else {
      tx.set(db.collection('submissions').doc(), entryDoc(match, matchRef.id, { ...entryFields, ...appliedFields }));
    }
    if (current) tx.update(current.ref, { status: 'superseded', updated_at: now });

    if (newMatch) tx.set(matchRef, { ...match, status: 'complete', winner_uid: result.winnerUid, updated_at: now });
    else tx.update(matchRef, { status: 'complete', winner_uid: result.winnerUid, updated_at: now });

    if (target && target.data.status !== 'complete') {
      tx.update(target.ref, {
        [`${target.slot}_uid`]: result.winnerUid, [`${target.slot}_name`]: winnerName,
        participant_uids: onCourtAfter(target.data, target.slot, result.winnerUid, partners), updated_at: now,
      });
    }
    // A played final means the event is over, as far as the public homepage is concerned. Each
    // new final pushes the stamp forward, so an event with several draws stays listed until the last.
    if (tournament && !old && match.round === 'F' && eventSnap && eventSnap.exists) {
      tx.set(eventSnap.ref, { completed_at: now }, { merge: true });
    }
    return { applied: true, advanced: !!target, matchId: matchRef.id };
  });
}

// ── Organizer actions ──────────────────────────────────────────────────────────

async function requireOrganizer(db, uid, eventId) {
  const event = eventId ? (await db.doc(`events/${eventId}`).get()).data() : null;
  if (eventId && !event) fail('Event not found.', 'not-found');
  if (!(await isOrganizer(uid, event))) fail('Only the organizer can do that.', 'permission-denied');
}

/** The newest disputed entry of a match. */
async function disputedEntry(db, matchId) {
  const snap = await db.collection('submissions').where('match_id', '==', matchId).where('status', '==', 'disputed').get();
  return snap.docs.sort((a, b) => (toDate(b.data().created_at)?.getTime() ?? 0) - (toDate(a.data().created_at)?.getTime() ?? 0))[0] || null;
}

/**
 * Organizer: a disputed result. Approve applies the disputing entry (points follow); reject marks
 * it rejected and the recorded result stands.
 */
async function settleDispute(db, { uid, matchId, approve }) {
  const snap = await db.doc(`matches/${matchId}`).get();
  if (!snap.exists) fail('Match not found.', 'not-found');
  const match = snap.data();
  await requireOrganizer(db, uid, match.event_id);
  const entry = await disputedEntry(db, matchId);
  if (!entry) fail('That result is not disputed.', 'failed-precondition');
  if (approve) return recordScore(db, { callerUid: uid, matchId, applyEntryId: entry.id });
  const now = Timestamp.now();
  await entry.ref.update({ status: 'rejected', resolved_by: uid, resolved_at: now, updated_at: now });
  return { applied: false };
}

/**
 * Organizer: send one scored match back to unplayed. The applied entry becomes superseded and a
 * reset entry records the negated points. Works for a tournament fixture, a challenge and a rally;
 * only an organizer can take a result away.
 */
async function resetScore(db, { uid, matchId }) {
  return db.runTransaction(async (tx) => {
    const now = Timestamp.now();
    const matchRef = db.collection('matches').doc(matchId);
    const snap = await tx.get(matchRef);
    if (!snap.exists) fail('Match not found.', 'not-found');
    const match = snap.data();
    const tournament = isTournament(match);
    if (!tournament && !['challenge', 'rally'].includes(match.category)) fail('That match cannot be reset.');
    const eventSnap = match.event_id ? await tx.get(db.doc(`events/${match.event_id}`)) : null;
    const event = eventSnap && eventSnap.exists ? eventSnap.data() : null;
    if (!(await isOrganizer(uid, event))) fail('Only the organizer can reset a score.', 'permission-denied');
    if (match.status !== 'complete') return false;
    const current = await currentEntry(tx, db, matchId);
    const target = tournament ? await nextTarget(tx, db, match, matchId) : null;
    const { partners } = await partnersFor(tx, db, match);
    const callerName = await nameOf(tx, db, uid);
    await commitPoints(tx, db, { undo: paidBy(current && current.data, match, partners) });
    if (current) {
      tx.update(current.ref, { status: 'superseded', updated_at: now });
      tx.set(db.collection('submissions').doc(), entryDoc(match, matchId, {
        sub_category: 'reset', status: 'applied', uid, user_name: callerName, replaces_id: current.id,
        points_winner: 0 - (current.data.points_winner || 0), points_loser: 0 - (current.data.points_loser || 0), applied_at: now,
      }));
    }
    tx.update(matchRef, { status: 'accepted', winner_uid: '', updated_at: now });
    // Pull the winner back out of the next round, unless that match has already been played.
    if (target && target.data.status !== 'complete' && target.data[`${target.slot}_uid`] === match.winner_uid) {
      tx.update(target.ref, {
        [`${target.slot}_uid`]: '', [`${target.slot}_name`]: 'Player Loading',
        participant_uids: onCourtAfter(target.data, target.slot, '', partners), updated_at: now,
      });
    }
    return true;
  });
}

const awardIdForGroup = (eventId, drawKey, groupLabel) =>
  `rr_group_bonus_${eventId}_${drawKey}_${String(groupLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/** Organizer: delete a draw's matches, undoing everything they and their groups' bonuses paid. */
async function cancelDraw(db, { uid, eventId, matchIds }) {
  await requireOrganizer(db, uid, eventId);
  return db.runTransaction(async (tx) => {
    const now = Timestamp.now();
    const snaps = (await tx.getAll(...matchIds.map((id) => db.collection('matches').doc(id)))).filter((s) => s.exists);
    if (snaps.some((s) => s.data().event_id !== eventId)) fail('Those matches belong to another event.');
    const entries = await Promise.all(snaps.map((s) => currentEntry(tx, db, s.id)));
    const groupAwards = new Map();
    snaps.filter((s) => isGroupMatch(s.data())).forEach((s) => {
      const id = awardIdForGroup(eventId, drawKeyOf(s.id, s.data()), s.data().group_label);
      groupAwards.set(id, db.collection('awards').doc(id));
    });
    const awardSnaps = groupAwards.size ? await tx.getAll(...groupAwards.values()) : [];
    const regs = snaps.some((s) => isDoubles(s.data())) ? await doublesRegs(tx, db, eventId) : [];
    const undo = new Map();
    entries.forEach((e, i) => e && paidBy(e.data, snaps[i].data(), teamsOf(regs, snaps[i].data()).partners).forEach((d, u) => addDelta(undo, u, d)));
    awardSnaps.filter((a) => a.exists).forEach((a) => (a.data().awardees || []).forEach((u) => addDelta(undo, u, { leaguePoints: POINTS.groupBonus })));
    await commitPoints(tx, db, { undo });
    entries.forEach((e) => e && tx.update(e.ref, { status: 'superseded', updated_at: now }));
    awardSnaps.filter((a) => a.exists).forEach((a) => tx.delete(a.ref));
    snaps.forEach((s) => tx.delete(s.ref));
    return snaps.length;
  });
}

/**
 * Organizer: turn one round-robin group's bonus on or off. On writes the group's award (every player
 * in the group) and pays leaguePoints; off deletes it and takes the points back only from its awardees.
 */
async function groupBonus(db, { uid, eventId, matchIds, award }) {
  await requireOrganizer(db, uid, eventId);
  return db.runTransaction(async (tx) => {
    const snaps = (await tx.getAll(...matchIds.map((id) => db.collection('matches').doc(id)))).filter((s) => s.exists);
    const labels = new Set(snaps.map((s) => s.data().group_label));
    if (snaps.length === 0 || labels.size !== 1 || !snaps.every((s) => s.data().event_id === eventId && isGroupMatch(s.data()))) {
      fail('Give the matches of exactly one group.');
    }
    const first = snaps[0];
    const drawKey = drawKeyOf(first.id, first.data());
    const ref = db.collection('awards').doc(awardIdForGroup(eventId, drawKey, first.data().group_label));
    const existing = await tx.get(ref);
    if (existing.exists === (award === true)) return 0;
    const bonus = (uids) => new Map(uids.map((u) => [u, { leaguePoints: POINTS.groupBonus }]));
    if (award) {
      const players = [...new Set(snaps.flatMap((s) => [s.data().player_1_uid, s.data().player_2_uid]).filter(Boolean))];
      await commitPoints(tx, db, { apply: bonus(players) });
      const now = Timestamp.now();
      tx.set(ref, {
        category: 'rr_group_bonus', sub_category: 'league', key: `${eventId}_${drawKey}_${first.data().group_label}`,
        points_each: POINTS.groupBonus, awardees: players, started_at: null, created_at: now, updated_at: now,
      });
      return players.length;
    }
    const paid = existing.data().awardees || [];
    await commitPoints(tx, db, { undo: bonus(paid) });
    tx.delete(ref);
    return paid.length;
  });
}

/**
 * Recounts a member's registrations: `eventsJoined` = distinct events with an active registration,
 * `tournamentsPlayed` = those that are tournaments. Set, never incremented, so a re-join can't
 * double-count and no marker is needed. Returns the counts.
 */
async function recountEntries(db, uid) {
  if (!uid || isGuest(uid)) return null;
  const regs = await db.collection('event_participants').where('uid', '==', uid).where('status', '==', 'active').get();
  const events = [...new Set(regs.docs.map((d) => d.data().event_id).filter(Boolean))];
  const tournaments = new Set(regs.docs.filter((d) => /_tournament$/.test(d.data().category || '')).map((d) => d.data().event_id));
  const { rsPointsPatch } = require('./points');
  await db.runTransaction(async (tx) => {
    const patch = await rsPointsPatch(tx, db, uid, { eventsJoined: events.length, tournamentsPlayed: tournaments.size });
    tx.set(db.collection('stats').doc(uid), { ...patch, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { eventsJoined: events.length, tournamentsPlayed: tournaments.size };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Closes stale requests (weeklyReminders): a rally open, or accepted with no result, 30+ days after
 * it was made becomes `played` (no score, no points); a challenge still open after 40 days is
 * `declined`. Batched writes. Returns the counts.
 */
async function closeStaleRequests(db, now = Date.now()) {
  const old = (m, days) => { const t = toDate(m.created_at); return !!t && now - t.getTime() >= days * DAY_MS; };
  const [rallies, challenges] = await Promise.all([
    db.collection('matches').where('category', '==', 'rally').where('status', 'in', ['open', 'accepted']).get(),
    db.collection('matches').where('category', '==', 'challenge').where('status', '==', 'open').get(),
  ]);
  const writes = [];
  for (const d of rallies.docs.filter((x) => old(x.data(), 30))) {
    if (d.data().status === 'accepted') {
      const subs = await db.collection('submissions').where('match_id', '==', d.id).where('status', '==', 'applied').get();
      if (subs.docs.some((s) => RESULT_KINDS.includes(s.data().sub_category))) continue;
    }
    writes.push([d.ref, 'played']);
  }
  challenges.docs.filter((d) => old(d.data(), 40)).forEach((d) => writes.push([d.ref, 'declined']));
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    const at = Timestamp.now();
    writes.slice(i, i + 400).forEach(([ref, status]) => batch.update(ref, { status, updated_at: at }));
    await batch.commit();
  }
  const count = (status) => writes.filter(([, s]) => s === status).length;
  return { rallies: count('played'), challenges: count('declined') };
}

module.exports = {
  POINTS,
  RESULT_KINDS,
  ResultError,
  cancelDraw,
  closeStaleRequests,
  pairDraw,
  paymentOf,
  recountEntries,
  groupBonus,
  isPlayedResult,
  pointsFor,
  recordScore,
  resetScore,
  settleDispute,
  awardIdForGroup,
  drawKeyOf,
};
