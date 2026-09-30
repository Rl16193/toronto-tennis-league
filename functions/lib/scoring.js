/**
 * Scoring: the ONE module that decides points and writes them to `stats`.
 *
 * - `POINTS` is the only copy of the points rules. A match's type picks its row.
 * - `recordScore` records a result on any match (tournament, challenge, rally); `settleDispute`,
 *   `resetScore`, `cancelDraw` and `groupBonus` are the organizer's actions. The `scoreMatch`
 *   callable (../scoring.js) is the only way in.
 * - `commitPoints` is the only function in the codebase that writes points to `stats`.
 * - Points already paid never move: every payment stores exactly what it paid on the match
 *   (`applied_deltas`, `rr_group_bonus_uids`), and undoing negates exactly that. A payment made
 *   before this module existed is undone with the rules it was paid under (`legacyDeltas`).
 *
 * Helpers only (no Cloud Function exports): see notify.js for why helpers live under lib/.
 */
const { FieldValue } = require('firebase-admin/firestore');
const { isOrganizer } = require('./roles');

// ── The points table ───────────────────────────────────────────────────────────
const POINTS = {
  rally: { win: 2, loss: 1 },
  challenge: { win: 3, loss: -3 }, // the loss never takes a player below 0
  group: { win: 3, loss: 1, walkoverWin: 1 },
  knockout: { win: 0, finalWin: 20, walkoverWin: 0, lossByRound: { R32: 1, R16: 2, QF: 3, SF: 5, F: 10 } },
  groupBonus: 5,
  legacyNoShow: 1, // paid to both by the old client; nothing new pays it
};

const MAX_GAME_SCORE = 99;
const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // a player may fix their own entry this long
const SCORE_FIELDS = [
  ['set_1_player_1', 'set_1_player_2'],
  ['set_2_player_1', 'set_2_player_2'],
  ['set_3_player_1', 'set_3_player_2'],
];

class ResultError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (message, code = 'invalid-argument') => { throw new ResultError(code, message); };

const isTournament = (m) => m.category === 'singles' || m.category === 'doubles';
const isGroupMatch = (m) => m.format === 'rr' && m.round === 'RR';

/**
 * A result that was actually played: a tournament match with games (not a walkover or an old no
 * show), or a recorded challenge or rally. Task progress and the Matchday bonus both use it.
 */
const isPlayedResult = (m) => {
  if (!m) return false;
  if (isTournament(m)) {
    return m.status === 'complete' && !!m.winner_uid && m.walkover !== true && !m.no_show &&
      SCORE_FIELDS.some(([a, b]) => (m[a] ?? 0) + (m[b] ?? 0) > 0);
  }
  return ['challenge', 'rally'].includes(m.category) && m.status === 'confirmed' && !!(m.winner_uid || m.claimed_winner_uid);
};
const kindOf = (m) => (isTournament(m) ? (isGroupMatch(m) ? 'group' : 'knockout') : m.category);

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

/** The result currently stored on a match. */
function storedResult(match) {
  const scores = SCORE_FIELDS.map(([a, b]) => [match[a] ?? 0, match[b] ?? 0]);
  const winnerUid = match.winner_uid || match.claimed_winner_uid || '';
  return {
    winnerUid, scores,
    walkover: match.walkover === true,
    court: typeof match.court === 'string' ? match.court : '',
    margin: marginOf(scores, winnerUid, match),
  };
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

/**
 * Stat changes a result makes, per uid. `loserBalance`: a challenge takes at most what the loser
 * has. The other options exist only for payments made before this module: `walkoverPlayed` (the
 * old client counted a walkover as played), `counted` (whether a challenge counted as a match) and
 * `legacy` (results used to add tournamentsPlayed; it is now counted once, at registration).
 */
function resultDeltas(match, result, { partners = new Map(), loserBalance = Infinity, walkoverPlayed = false, counted, legacy = false } = {}) {
  const deltas = new Map();
  const kind = kindOf(match);
  const tournament = kind === 'group' || kind === 'knockout';
  const walkover = result.walkover && !walkoverPlayed;
  const pts = pointsFor(match, walkover);
  if (kind === 'challenge') pts.loser = -Math.min(-pts.loser, Math.max(0, loserBalance));
  // A challenge converted from a scored tournament match already counted the match.
  const played = counted ?? (!walkover && !(kind === 'challenge' && match.source === 'tournament'));

  const winnerIsP1 = result.winnerUid === match.player_1_uid;
  const loserUid = winnerIsP1 ? match.player_2_uid : match.player_1_uid;
  const p1 = result.scores.reduce((s, [a]) => s + a, 0);
  const p2 = result.scores.reduce((s, [, b]) => s + b, 0);
  const side = (won) => ({
    leaguePoints26: won ? pts.winner : pts.loser,
    ...(played ? { matchesPlayed: 1, [won ? 'wins' : 'loses']: 1 } : {}),
    ...(played && tournament ? {
      pointswon: won === winnerIsP1 ? p1 : p2,
      totalPointsPlayed: p1 + p2,
      ...(legacy ? { tournamentsPlayed: won ? (match.round === 'F' ? 1 : 0) : 1 } : {}),
    } : {}),
  });
  const credited = (uid) => (tournament ? creditedUids(uid, partners) : [uid]);
  credited(result.winnerUid).forEach((uid) => addDelta(deltas, uid, side(true)));
  credited(loserUid).forEach((uid) => addDelta(deltas, uid, side(false)));
  return deltas;
}

/** What a payment made BEFORE this module paid, so it can be undone exactly. */
function legacyDeltas(match, partners = new Map()) {
  if (match.category === 'rally' || match.category === 'challenge') {
    if (match.applied !== true) return new Map();
    const winnerUid = match.applied_winner_uid || match.winner_uid || match.claimed_winner_uid;
    return resultDeltas(match, { ...storedResult(match), winnerUid, walkover: false }, {
      loserBalance: match.applied_loser_delta !== undefined ? Number(match.applied_loser_delta) || 0 : -POINTS.challenge.loss,
      counted: match.applied_counted_match !== undefined ? match.applied_counted_match !== false : undefined,
      legacy: true,
    });
  }
  if (match.status !== 'complete') return new Map();
  if (match.no_show) {
    const deltas = new Map();
    [match.player_1_uid, match.player_2_uid].forEach((uid) => addDelta(deltas, uid, { leaguePoints26: POINTS.legacyNoShow }));
    return deltas;
  }
  if (!match.winner_uid) return new Map();
  return resultDeltas(match, storedResult(match), { partners, walkoverPlayed: true, legacy: true });
}

/** The stat changes this match currently stands for: stored if paid here, else legacy. */
function standingDeltas(match, partners = new Map()) {
  if (match.applied_deltas && typeof match.applied_deltas === 'object') {
    return new Map(Object.entries(match.applied_deltas));
  }
  return legacyDeltas(match, partners);
}

/**
 * THE ONLY FUNCTION THAT WRITES POINTS TO `stats`. Undoes `undo`, applies `apply`, one net
 * increment per player, inside the caller's transaction. Never call tx.set on stats elsewhere.
 */
function commitPoints(tx, db, { undo = new Map(), apply = new Map(), league } = {}) {
  const net = new Map();
  for (const [uid, d] of undo) addDelta(net, uid, Object.fromEntries(Object.entries(d).map(([k, v]) => [k, -v])));
  for (const [uid, d] of apply) addDelta(net, uid, d);
  for (const [uid, delta] of net) {
    const values = {};
    Object.entries(delta).forEach(([k, v]) => { if (typeof v === 'number' && v) values[k] = FieldValue.increment(v); });
    if (Object.keys(values).length === 0) continue;
    if (league) values.league = league;
    tx.set(db.collection('stats').doc(uid), values, { merge: true });
  }
}

/**
 * Records a result on any match, or clears it (`result: null`), and moves the points to match,
 * in the caller's transaction. Reads first, then writes, so the caller must do its own reads
 * before calling and its own writes after.
 */
async function applyMatchResult(tx, db, { matchRef, match, result, partners = new Map(), extra = {} }) {
  const undo = standingDeltas(match, partners);
  let apply = new Map();
  if (result) {
    let loserBalance = Infinity;
    if (match.category === 'challenge') {
      const loserUid = result.winnerUid === match.player_1_uid ? match.player_2_uid : match.player_1_uid;
      const snap = await tx.get(db.collection('stats').doc(loserUid));
      loserBalance = (snap.exists ? snap.data().leaguePoints26 ?? 0 : 0) - (undo.get(loserUid)?.leaguePoints26 ?? 0);
    }
    apply = resultDeltas(match, result, { partners, loserBalance });
  }
  const league = isTournament(match) ? (match.tournament_choice === 'Doubles' ? 'Doubles' : match.division) : undefined;
  commitPoints(tx, db, { undo, apply, league });

  const paid = result ? pointsFor(match, result.walkover) : null;
  const stamp = result
    ? {
      applied_deltas: Object.fromEntries(apply),
      scoring_v2: true,
      applied: true,
      applied_at: new Date().toISOString(),
      applied_winner_uid: result.winnerUid,
      ...(isTournament(match) ? { points_winner: paid.winner, points_loser: paid.loser } : {}),
    }
    : {
      applied_deltas: FieldValue.delete(), scoring_v2: FieldValue.delete(), applied: FieldValue.delete(),
      applied_at: FieldValue.delete(), applied_winner_uid: FieldValue.delete(),
      applied_loser_delta: FieldValue.delete(), applied_counted_match: FieldValue.delete(),
      points_winner: FieldValue.delete(), points_loser: FieldValue.delete(),
    };
  tx.set(matchRef, { ...stamp, ...extra }, { merge: true });
  return apply;
}

// ── Round-robin group bonus ────────────────────────────────────────────────────

const groupPlayers = (matches) =>
  [...new Set(matches.flatMap((m) => [m.player_1_uid, m.player_2_uid]).filter(Boolean))];

/**
 * Who currently holds this group's bonus (empty if it isn't paid). The paid players are stored
 * (`rr_group_bonus_uids`); a bonus paid before that stored nobody, so it is the group's players.
 */
function paidBonusUids(matches) {
  if (!matches.some((m) => m.rr_group_bonus_v2)) return [];
  return matches.find((m) => Array.isArray(m.rr_group_bonus_uids))?.rr_group_bonus_uids ?? groupPlayers(matches);
}

// ── Draw helpers ───────────────────────────────────────────────────────────────

const sameDraw = (a, b) =>
  (a.bracket ?? null) === (b.bracket ?? null) &&
  a.tournament_choice === b.tournament_choice &&
  a.division === b.division &&
  a.skill_group === b.skill_group &&
  (a.zone ?? null) === (b.zone ?? null);

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
      .sort((a, b) => (a.data().position ?? 0) - (b.data().position ?? 0));
    slot = siblings.findIndex((d) => d.id === matchId) <= 0 ? 'player_1' : 'player_2';
  }
  return { ref: next.ref, data: next.data(), slot };
}

async function partnersFor(tx, db, match) {
  const partners = new Map();
  if (match.tournament_choice !== 'Doubles') return partners;
  const snap = await tx.get(db.collection('event_participants').where('event_id', '==', match.event_id));
  snap.docs.map((d) => d.data()).filter((p) => p.uid && p.partner_uid).forEach((p) => partners.set(p.uid, p.partner_uid));
  return partners;
}

const audit = (tx, db, row) =>
  tx.create(db.collection('tournament_result_audit').doc(), { ...row, recorded_at: new Date().toISOString() });

// ── Recording a result ─────────────────────────────────────────────────────────

/** A match an organizer records for two other members (Matches' + button): challenge or rally. */
function playedMatchFor(input) {
  const n = input && typeof input === 'object' ? input : {};
  if (!['rally', 'challenge'].includes(n.category)) fail('Only a challenge or a rally can be recorded this way.');
  const uids = [n.player_1_uid, n.player_2_uid];
  if (!uids.every((u) => typeof u === 'string' && u) || uids[0] === uids[1]) fail('Pick two different players.');
  if (n.category === 'challenge' && (typeof n.event_id !== 'string' || !n.event_id)) fail('There is no active league ladder to record a challenge in.');
  return {
    category: n.category,
    ...(n.category === 'challenge' ? { event_id: n.event_id, division: String(n.division || '') } : {}),
    player_1_uid: uids[0], player_1_name: String(n.player_1_name || ''),
    player_2_uid: uids[1], player_2_name: String(n.player_2_name || ''),
    status: 'accepted',
    created_at: new Date().toISOString(),
  };
}

const submissionOf = (result, now) => ({
  winner_uid: result.winnerUid, walkover: result.walkover, margin: result.margin, submitted_at: now,
  sets: Object.fromEntries(result.scores.map(([a, b], i) => [`set_${i + 1}`, { player_1: a, player_2: b }])),
});

/**
 * Records a result on a tournament match, challenge or rally, by a player or an organizer, in one
 * transaction: the result, its points (applyMatchResult), advancement, event completion, audit.
 *
 * - Nothing recorded yet: it counts at once.
 * - A player naming a different winner from the recorded one: a dispute (organizer approves or
 *   rejects it with settleDispute). Nothing moves.
 * - A player naming the same winner: the one who entered it may fix it within 7 days; anyone
 *   else's replaces it only if closer.
 * - An organizer: replaces anything, except a winner change once the next round is played.
 *
 * `newMatch` creates a challenge/rally two other members already played (organizer only).
 */
async function recordScore(db, { callerUid, matchId, input, newMatch }) {
  return db.runTransaction(async (tx) => {
    const now = new Date().toISOString();
    let matchRef;
    let match;
    if (newMatch) {
      match = playedMatchFor(newMatch);
      matchRef = db.collection('matches').doc();
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
    const event = eventSnap && eventSnap.exists ? eventSnap.data() : {};
    const organizer = await isOrganizer(callerUid, event);
    const partners = tournament ? await partnersFor(tx, db, match) : new Map();
    const sides = [match.player_1_uid, match.player_2_uid];
    const isPlayer = sides.includes(callerUid) || sides.some((uid) => partners.get(uid) === callerUid);
    if (newMatch && !organizer) fail('Only an organizer can record a match for two other players.', 'permission-denied');
    if (!organizer && !isPlayer) fail('Only the two players or an organizer can record this score.', 'permission-denied');

    // Accepting a challenge converted from a played match records the result it was proposed with.
    const conversion = !tournament && match.status === 'open' && !!match.source && !!match.winner_uid && callerUid === match.player_2_uid;
    if (!tournament && !newMatch && !conversion && !['accepted', 'confirmed'].includes(match.status)) {
      fail('That match is not ready for a score yet.', 'failed-precondition');
    }
    const stored = storedResult(match);
    const result = normalizeResult(conversion ? { winnerUid: stored.winnerUid, scores: stored.scores, court: stored.court } : input, match);
    if (result.walkover && !tournament) fail('Walkovers are only for tournament matches.');
    if (result.walkover && !organizer) fail('Only the organizer can record a walkover.', 'permission-denied');

    const recorded = tournament
      ? match.status === 'complete' && !!(match.winner_uid || match.no_show)
      : match.status === 'confirmed' && !!stored.winnerUid;
    const old = recorded ? stored : null;
    const submissions = { ...(match.result_submissions || {}), [callerUid]: submissionOf(result, now) };
    if (old && !match.no_show && old.winnerUid === result.winnerUid && old.walkover === result.walkover &&
      JSON.stringify(old.scores) === JSON.stringify(result.scores)) {
      tx.update(matchRef, { result_submissions: submissions });
      return { duplicate: true, matchId: matchRef.id };
    }
    if (old && !organizer) {
      if (match.no_show || old.walkover) fail('Only the organizer can change this result.', 'permission-denied');
      if (result.winnerUid !== old.winnerUid) {
        tx.update(matchRef, {
          result_submissions: submissions, score_disputed: true, dispute_uid: callerUid,
          score_disputed_at: match.score_disputed_at || now,
        });
        return { inDispute: true, matchId: matchRef.id };
      }
      const ownFix = callerUid === match.reported_by && Date.now() - (Date.parse(match.completed_at || '') || 0) <= EDIT_WINDOW_MS;
      if (!ownFix && result.margin >= old.margin) {
        tx.update(matchRef, { result_submissions: submissions });
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

    const winnerName = result.winnerUid === match.player_1_uid ? match.player_1_name : match.player_2_name;
    await applyMatchResult(tx, db, {
      matchRef, match, result, partners,
      extra: {
        ...(newMatch ? match : {}),
        winner_uid: result.winnerUid,
        winner_name: winnerName,
        ...scoreFieldPatch(result.scores),
        ...(result.court ? { court: result.court } : {}),
        score_disputed: false,
        score_disputed_at: FieldValue.delete(),
        dispute_uid: FieldValue.delete(),
        result_submissions: submissions,
        ...(old
          ? { score_edited_at: now }
          : { completed_at: now, reported_by: callerUid, reported_at: now, ...(organizer && !isPlayer ? { recorded_by_organizer: true } : {}) }),
        ...(tournament
          ? { status: 'complete', walkover: result.walkover, no_show: false, ...(isGroupMatch(match) ? { rr_winner_pts_v2: true } : {}) }
          : { status: 'confirmed', ...(old ? {} : { confirmed_at: now }), ...(conversion ? { responded_at: now } : {}) }),
      },
    });
    audit(tx, db, {
      event_id: match.event_id || null, match_id: matchRef.id, category: match.category,
      actor_uid: callerUid, as_organizer: organizer, action: old ? 'rescore' : 'apply',
      before: old ? { winner_uid: old.winnerUid, walkover: old.walkover, no_show: !!match.no_show, scores: scoreFieldPatch(old.scores) } : null,
      after: { winner_uid: result.winnerUid, walkover: result.walkover, scores: scoreFieldPatch(result.scores) },
    });
    if (target && target.data.status !== 'complete') {
      tx.update(target.ref, { [`${target.slot}_uid`]: result.winnerUid, [`${target.slot}_name`]: winnerName });
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
  const event = eventId ? (await db.doc(`events/${eventId}`).get()).data() : {};
  if (eventId && !event) fail('Event not found.', 'not-found');
  if (!(await isOrganizer(uid, event))) fail('Only the organizer can do that.', 'permission-denied');
}

/**
 * Organizer: a disputed result. Approve applies the disputing player's score (points follow);
 * reject keeps the recorded result. Either way the dispute is closed.
 */
async function settleDispute(db, { uid, matchId, approve }) {
  const snap = await db.doc(`matches/${matchId}`).get();
  if (!snap.exists) fail('Match not found.', 'not-found');
  const match = snap.data();
  await requireOrganizer(db, uid, match.event_id);
  if (match.score_disputed !== true) fail('That result is not disputed.', 'failed-precondition');
  if (approve) {
    const sub = match.result_submissions?.[match.dispute_uid];
    if (!sub) fail('The disputing score was entered before this change and was not saved. Reject it and ask the players to re-enter it.', 'failed-precondition');
    const scores = [1, 2, 3].map((i) => [sub.sets?.[`set_${i}`]?.player_1 ?? 0, sub.sets?.[`set_${i}`]?.player_2 ?? 0]);
    return recordScore(db, { callerUid: uid, matchId, input: { winnerUid: sub.winner_uid, scores, walkover: sub.walkover === true } });
  }
  return db.runTransaction(async (tx) => {
    tx.update(snap.ref, { score_disputed: false, score_disputed_at: FieldValue.delete(), dispute_uid: FieldValue.delete() });
    audit(tx, db, { event_id: match.event_id || null, match_id: matchId, category: match.category, actor_uid: uid, as_organizer: true, action: 'dispute_rejected' });
    return { applied: false };
  });
}

/**
 * Organizer: send one scored match back to unplayed, undoing what it paid.
 *
 * Works for a tournament fixture, a challenge and a rally. It stays ORGANIZER-ONLY for all three:
 * the players can correct a score (games, inside the edit window) or dispute a winner, but only an
 * organizer can take a result away. A rally carries no event, so the organizer test falls back to
 * the `event_creator` flag exactly as `recordScore` does.
 */
async function resetScore(db, { uid, matchId }) {
  return db.runTransaction(async (tx) => {
    const matchRef = db.collection('matches').doc(matchId);
    const snap = await tx.get(matchRef);
    if (!snap.exists) fail('Match not found.', 'not-found');
    const match = snap.data();
    const tournament = isTournament(match);
    if (!tournament && !['challenge', 'rally'].includes(match.category)) fail('That match cannot be reset.');
    const eventSnap = match.event_id ? await tx.get(db.doc(`events/${match.event_id}`)) : null;
    const event = eventSnap && eventSnap.exists ? eventSnap.data() : {};
    if (!(await isOrganizer(uid, event))) fail('Only the organizer can reset a score.', 'permission-denied');
    // A played tournament fixture is 'complete'; a played challenge or rally is 'confirmed'.
    if (match.status !== (tournament ? 'complete' : 'confirmed')) return false;
    const partners = tournament ? await partnersFor(tx, db, match) : new Map();
    const target = tournament ? await nextTarget(tx, db, match, matchId) : null;
    await applyMatchResult(tx, db, {
      matchRef, match, result: null, partners,
      extra: {
        // Back to the state each kind was in before the score: a fixture waiting to be played,
        // or an accepted request either player can record again.
        status: tournament ? 'pending' : 'accepted',
        winner_uid: '', winner_name: '', ...scoreFieldPatch([[0, 0], [0, 0], [0, 0]]),
        walkover: false, no_show: false, score_disputed: false, result_submissions: FieldValue.delete(),
        dispute_uid: FieldValue.delete(), reported_by: FieldValue.delete(),
        // A rally/challenge is sorted and listed by these; left behind they read as still played.
        ...(tournament ? {} : {
          completed_at: FieldValue.delete(), confirmed_at: FieldValue.delete(), reported_at: FieldValue.delete(),
        }),
      },
    });
    // Pull the winner back out of the next round, unless that match has already been played.
    if (target && target.data.status !== 'complete' && target.data[`${target.slot}_uid`] === match.winner_uid) {
      tx.update(target.ref, { [`${target.slot}_uid`]: '', [`${target.slot}_name`]: 'Player Loading' });
    }
    audit(tx, db, {
      event_id: match.event_id || null, match_id: matchId, category: match.category, actor_uid: uid, as_organizer: true, action: 'reset',
      before: { winner_uid: match.winner_uid || '', walkover: !!match.walkover, no_show: !!match.no_show }, after: null,
    });
    return true;
  });
}

/** Organizer: delete a draw's matches, undoing everything they and their groups' bonuses paid. */
async function cancelDraw(db, { uid, eventId, matchIds }) {
  await requireOrganizer(db, uid, eventId);
  return db.runTransaction(async (tx) => {
    const snaps = (await tx.getAll(...matchIds.map((id) => db.collection('matches').doc(id)))).filter((s) => s.exists);
    if (snaps.some((s) => s.data().event_id !== eventId)) fail('Those matches belong to another event.');
    const doubles = snaps.find((s) => s.data().tournament_choice === 'Doubles');
    const partners = doubles ? await partnersFor(tx, db, doubles.data()) : new Map();
    const undo = new Map();
    snaps.forEach((s) => standingDeltas(s.data(), partners).forEach((d, u) => addDelta(undo, u, d)));
    const groups = new Map();
    snaps.map((s) => s.data()).filter(isGroupMatch)
      .forEach((m) => groups.set(m.rr_group ?? 0, [...(groups.get(m.rr_group ?? 0) || []), m]));
    groups.forEach((gm) => paidBonusUids(gm).forEach((u) => addDelta(undo, u, { leaguePoints26: POINTS.groupBonus })));
    commitPoints(tx, db, { undo });
    snaps.forEach((s) => tx.delete(s.ref));
    audit(tx, db, { event_id: eventId, actor_uid: uid, as_organizer: true, action: 'cancel_draw', match_ids: snaps.map((s) => s.id) });
    return snaps.length;
  });
}

/**
 * Organizer: turn one round-robin group's bonus on or off. On pays every player in the group;
 * off takes it back only from those it was paid to. Returns how many players it moved.
 */
async function groupBonus(db, { uid, eventId, matchIds, award }) {
  await requireOrganizer(db, uid, eventId);
  return db.runTransaction(async (tx) => {
    const snaps = (await tx.getAll(...matchIds.map((id) => db.collection('matches').doc(id)))).filter((s) => s.exists);
    const groupKeys = new Set(snaps.map((s) => s.data().rr_group ?? 0));
    if (snaps.length === 0 || groupKeys.size !== 1 || !snaps.every((s) => s.data().event_id === eventId && isGroupMatch(s.data()))) {
      fail('Give the matches of exactly one group.');
    }
    const matches = snaps.map((s) => s.data());
    const players = groupPlayers(matches);
    const paidUids = paidBonusUids(matches);
    if (matches.some((m) => m.rr_group_bonus_v2) === (award === true)) return 0;
    const bonus = (uids) => new Map(uids.map((u) => [u, { leaguePoints26: POINTS.groupBonus }]));
    commitPoints(tx, db, award ? { apply: bonus(players) } : { undo: bonus(paidUids) });
    snaps.forEach((s) => tx.set(s.ref, award
      ? { rr_group_bonus_v2: true, rr_group_bonus_uids: players }
      : { rr_group_bonus_v2: false, rr_group_bonus_uids: FieldValue.delete() }, { merge: true }));
    return award ? players.length : paidUids.length;
  });
}

/**
 * Counts one tournament entered (`tournamentsPlayed`), once per player per event, at registration
 * (Racquets-And-Strings' rule; results no longer count it). A removed player who re-joins is not
 * counted again: the registration that counted carries `tournament_counted`.
 */
async function countTournamentEntry(db, participantId) {
  return db.runTransaction(async (tx) => {
    const ref = db.collection('event_participants').doc(participantId);
    const snap = await tx.get(ref);
    const p = snap.exists ? snap.data() : null;
    if (!p || !p.uid || !p.event_id || String(p.uid).startsWith('__loading_') || p.tournament_counted) return false;
    const [eventSnap, mine] = await Promise.all([
      tx.get(db.collection('events').doc(p.event_id)),
      tx.get(db.collection('event_participants').where('event_id', '==', p.event_id).where('uid', '==', p.uid)),
    ]);
    if (!eventSnap.exists || !String(eventSnap.data().type || '').toLowerCase().includes('tournament')) return false;
    if (mine.docs.some((d) => d.data().tournament_counted === true)) return false;
    commitPoints(tx, db, { apply: new Map([[p.uid, { tournamentsPlayed: 1 }]]) });
    tx.update(ref, { tournament_counted: true });
    return true;
  });
}

module.exports = {
  POINTS,
  ResultError,
  cancelDraw,
  countTournamentEntry,
  groupBonus,
  isPlayedResult,
  pointsFor,
  recordScore,
  resetScore,
  settleDispute,
};
