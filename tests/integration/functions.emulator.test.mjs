import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectId = process.env.GCLOUD_PROJECT;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST;
if (!projectId || !authHost || !functionsHost || !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Run with npm run test:functions:integration.');
}
const app = initializeApp({ projectId }, 'functions-integration');
const db = getFirestore(app);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tournamentAvailable = existsSync(path.join(root, 'functions', 'tournamentResults.js'));

const session = async (label, uid) => {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const password = 'local-test-password';
  if (uid) await getAuth(app).createUser({ uid, email, password });
  const operation = uid ? 'signInWithPassword' : 'signUp';
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=local`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return { uid: body.localId, token: body.idToken };
};
const call = async (name, token, data) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
};
const clear = async () => {
  const response = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.equal(response.ok, true, await response.text());
};
const waitFor = async (read, predicate) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail('Timed out waiting for emulator side effect.');
};

beforeEach(clear);
after(() => deleteApp(app));

test('protected callables reject anonymous requests at the emulator wrapper', async () => {
  for (const [name, data] of [
    ['redeemReward', { rewardId: 'missing' }],
    ['requestCancellation', { code: 'RS-TEST-AA' }],
    ['reviewRedemption', { code: 'RS-TEST-AA', approve: true }],
    ['applyTournamentResult', { matchId: 'missing', scores: [] }],
  ]) {
    const response = await call(name, null, data);
    assert.equal(response.status, 401, `${name}: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.error.status, 'UNAUTHENTICATED');
  }
});

test('redemption rejects insufficient balance and duplicate open coupons', async () => {
  const player = await session('reward-player');
  const rewardId = `reward-${crypto.randomUUID()}`;
  await Promise.all([
    db.doc(`tasks/${rewardId}`).set({
      type: 'offer',
      active: true,
      offer: 'Test restring',
      points_cost: 30,
      provider_id: 'provider-a',
      provider_name: 'Provider A',
    }),
    db.doc(`users/${player.uid}`).set({ name: 'Reward Player' }),
    db.doc(`stats/${player.uid}`).set({ leaguePoints26: 20 }),
  ]);
  const insufficient = await call('redeemReward', player.token, { rewardId });
  assert.equal(insufficient.status, 400);
  assert.equal(insufficient.body.error.status, 'FAILED_PRECONDITION');
  assert.equal((await db.collection('redemptions').get()).empty, true);

  await db.doc(`stats/${player.uid}`).set({ leaguePoints26: 50 });
  const redeemed = await call('redeemReward', player.token, { rewardId });
  assert.equal(redeemed.status, 200, JSON.stringify(redeemed.body));
  assert.equal((await db.doc(`offers/${player.uid}`).get()).data().pointsSpent, 30);
  const duplicate = await call('redeemReward', player.token, { rewardId });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.status, 'ALREADY_EXISTS');
  assert.equal((await db.collection('redemptions').get()).size, 1);
});

test('redemption rejects non-offer task documents', async () => {
  const player = await session('non-offer-player');
  const rewardId = `progress-${crypto.randomUUID()}`;
  await Promise.all([
    db.doc(`tasks/${rewardId}`).set({ active: true, offer: 'Bogus task', points_cost: 1 }),
    db.doc(`stats/${player.uid}`).set({ leaguePoints26: 50 }),
  ]);
  const response = await call('redeemReward', player.token, { rewardId });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.status, 'FAILED_PRECONDITION');
  assert.equal((await db.collection('redemptions').get()).empty, true);
});

test('approved cancellation refunds points and releases the lock', async () => {
  const player = await session('refund-player');
  const administrator = await session('refund-administrator', '7PvfzNtDmsOq5GLMieId7QRT7wH3');
  const eventCreator = await session('refund-event-creator');
  const rewardId = `reward-${crypto.randomUUID()}`;
  await Promise.all([
    db.doc(`tasks/${rewardId}`).set({
      type: 'offer',
      active: true,
      offer: 'Test grip',
      points_cost: 25,
      provider_id: 'provider-a',
      provider_name: 'Provider A',
    }),
    db.doc(`users/${player.uid}`).set({ name: 'Refund Player' }),
    db.doc(`stats/${player.uid}`).set({ leaguePoints26: 50 }),
    db.doc(`preferences/${eventCreator.uid}`).set({ event_creator: true }),
  ]);
  const redeemed = await call('redeemReward', player.token, { rewardId });
  const code = redeemed.body.result.code;
  assert.equal((await call('requestCancellation', player.token, { code })).status, 200);
  assert.equal((await call('reviewRedemption', eventCreator.token, { code, approve: true })).status, 403);
  assert.equal((await call('reviewRedemption', administrator.token, { code, approve: true })).status, 200);
  assert.equal((await db.doc(`redemptions/${code}`).get()).data().status, 'cancelled');
  assert.equal((await db.doc(`offers/${player.uid}`).get()).data().pointsSpent, 0);
  assert.equal((await call('redeemReward', player.token, { rewardId })).status, 200);
});

test('friendly confirmation pays once across a replayed transition', async () => {
  const matchId = `friendly-${crypto.randomUUID()}`;
  const winnerId = `winner-${crypto.randomUUID()}`;
  const loserId = `loser-${crypto.randomUUID()}`;
  const ref = db.doc(`matches/${matchId}`);
  await ref.set({
    category: 'rally',
    status: 'reported',
    player_1_uid: winnerId,
    player_2_uid: loserId,
    winner_uid: winnerId,
    set_1_player_1: 6,
    set_1_player_2: 4,
    set_2_player_1: 6,
    set_2_player_2: 2,
    set_3_player_1: 0,
    set_3_player_2: 0,
    reported_by: loserId,
  });
  await ref.update({ status: 'confirmed', confirmed_by: winnerId });
  await waitFor(
    async () => (await ref.get()).data(),
    (value) => value?.applied === true,
  );
  assert.equal((await db.doc(`stats/${winnerId}`).get()).data().leaguePoints26, 2);
  assert.equal((await db.doc(`stats/${loserId}`).get()).data().leaguePoints26, 1);
  await ref.update({ status: 'reported' });
  await ref.update({ status: 'confirmed', confirmed_by: winnerId });
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert.equal((await db.doc(`stats/${winnerId}`).get()).data().leaguePoints26, 2);
  assert.equal((await db.doc(`stats/${loserId}`).get()).data().leaguePoints26, 1);
});

test('friendly confirmation refuses an unrelated winner', async () => {
  const playerOne = `player-${crypto.randomUUID()}`;
  const playerTwo = `player-${crypto.randomUUID()}`;
  const ref = db.doc(`matches/friendly-invalid-${crypto.randomUUID()}`);
  await ref.set({
    category: 'rally',
    status: 'reported',
    player_1_uid: playerOne,
    player_2_uid: playerTwo,
    winner_uid: 'unrelated',
    set_1_player_1: 6,
    set_1_player_2: 4,
    set_2_player_1: 6,
    set_2_player_2: 2,
    set_3_player_1: 0,
    set_3_player_2: 0,
    reported_by: playerTwo,
  });
  await ref.update({ status: 'confirmed', confirmed_by: playerOne });
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert.equal((await ref.get()).data().applied, undefined);
  assert.equal((await db.doc(`stats/${playerOne}`).get()).exists, false);
  assert.equal((await db.doc(`stats/${playerTwo}`).get()).exists, false);
});

const seedTournament = async (ownerUid, playerOne, playerTwo) => {
  await Promise.all([
    db.doc('events/e1').set({ creator_id: ownerUid }),
    db.doc('event_participants/pa').set({ event_id: 'e1', uid: playerOne, removal: false }),
    db.doc('event_participants/pb').set({ event_id: 'e1', uid: playerTwo, removal: false }),
    db.doc('matches/m1').set({
      event_id: 'e1',
      category: 'singles',
      tournament_choice: 'Singles',
      division: "Men's",
      skill_group: 'Challengers',
      format: 'rr',
      round: 'RR',
      status: 'pending',
      player_1_uid: playerOne,
      player_1_name: 'P1',
      player_2_uid: playerTwo,
      player_2_name: 'P2',
      match_id: 'M1',
      position: 0,
      next_match_id: 'M3',
      next_slot: 'player_1',
    }),
    db.doc('matches/m3').set({
      event_id: 'e1',
      category: 'singles',
      tournament_choice: 'Singles',
      division: "Men's",
      skill_group: 'Challengers',
      format: 'rr',
      round: 'Final',
      status: 'pending',
      player_1_uid: '',
      player_1_name: '',
      player_2_uid: '',
      player_2_name: '',
      match_id: 'M3',
      position: 0,
    }),
    db.doc('matches/result-1').set({
      category: 'score_submission',
      event_id: 'e1',
      match_id: 'm1',
      submitted_by: playerOne,
      claimed_winner_uid: playerOne,
      is_walkover: false,
      set_1_player_1: 6,
      set_1_player_2: 4,
      set_2_player_1: 6,
      set_2_player_2: 2,
      set_3_player_1: 0,
      set_3_player_2: 0,
    }),
  ]);
};

test('tournament result applies stats and advancement exactly once', { skip: !tournamentAvailable }, async () => {
  const owner = await session('tournament-owner');
  await seedTournament(owner.uid, 'p1', 'p2');
  const data = {
    matchId: 'm1',
    winnerUid: 'p1',
    scores: [
      [6, 4],
      [6, 2],
      [0, 0],
    ],
    submissionId: 'result-1',
  };
  const applied = await call('applyTournamentResult', owner.token, data);
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.deepEqual(applied.body.result, { applied: true, duplicate: false, advanced: true, needsManual: false });
  assert.equal((await db.doc('matches/m1').get()).data().winner_uid, 'p1');
  assert.equal((await db.doc('matches/m3').get()).data().player_1_uid, 'p1');
  assert.equal((await db.doc('stats/p1').get()).data().leaguePoints26, 3);
  assert.equal((await db.doc('stats/p2').get()).data().leaguePoints26, 1);

  const duplicate = await call('applyTournamentResult', owner.token, data);
  assert.equal(duplicate.status, 200, JSON.stringify(duplicate.body));
  assert.deepEqual(duplicate.body.result, { applied: false, duplicate: true, advanced: true, needsManual: false });
  assert.equal((await db.doc('stats/p1').get()).data().leaguePoints26, 3);
  assert.equal((await db.doc('stats/p2').get()).data().leaguePoints26, 1);
});

test('tournament result rejects a non-owner and an unrelated winner', { skip: !tournamentAvailable }, async () => {
  const owner = await session('tournament-owner');
  const outsider = await session('tournament-outsider');
  await seedTournament(owner.uid, 'p1', 'p2');
  const unauthorized = await call('applyTournamentResult', outsider.token, {
    matchId: 'm1',
    winnerUid: 'p1',
    scores: [
      [6, 4],
      [6, 2],
      [0, 0],
    ],
  });
  assert.equal(unauthorized.status, 403);
  assert.equal(unauthorized.body.error.status, 'PERMISSION_DENIED');
  const invalidWinner = await call('applyTournamentResult', owner.token, {
    matchId: 'm1',
    winnerUid: 'unrelated',
    scores: [
      [6, 4],
      [6, 2],
      [0, 0],
    ],
  });
  assert.equal(invalidWinner.status, 400);
  assert.equal(invalidWinner.body.error.status, 'INVALID_ARGUMENT');
  assert.equal((await db.doc('matches/m1').get()).data().status, 'pending');
});

test(
  'tournament result rejects a missing advancement target without applying stats',
  { skip: !tournamentAvailable },
  async () => {
    const owner = await session('tournament-missing-target-owner');
    await seedTournament(owner.uid, 'p1', 'p2');
    await db.doc('matches/m3').delete();
    const rejected = await call('applyTournamentResult', owner.token, {
      matchId: 'm1',
      winnerUid: 'p1',
      scores: [
        [6, 4],
        [6, 2],
        [0, 0],
      ],
    });
    assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error.status, 'FAILED_PRECONDITION');
    assert.equal((await db.doc('matches/m1').get()).data().status, 'pending');
    assert.equal((await db.doc('stats/p1').get()).exists, false);
  },
);

test(
  'tournament result accepts organizer_ids assignments and rejects non-bracket matches',
  { skip: !tournamentAvailable },
  async () => {
    const assigned = await session('tournament-assigned');
    await seedTournament('different-owner', 'p1', 'p2');
    await db.doc('events/e1').update({ assigned_organizer_uids: [assigned.uid] });
    const legacyRejected = await call('applyTournamentResult', assigned.token, {
      matchId: 'm1',
      winnerUid: 'p1',
      scores: [
        [6, 4],
        [6, 2],
        [0, 0],
      ],
    });
    assert.equal(legacyRejected.status, 403, JSON.stringify(legacyRejected.body));
    await db.doc('events/e1').update({ organizer_ids: [assigned.uid] });

    const applied = await call('applyTournamentResult', assigned.token, {
      matchId: 'm1',
      winnerUid: 'p1',
      scores: [
        [6, 4],
        [6, 2],
        [0, 0],
      ],
      submissionId: 'result-1',
    });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));

    await db.doc('matches/not-bracket').set({
      event_id: 'e1',
      category: 'challenge',
      status: 'pending',
      player_1_uid: 'p1',
      player_2_uid: 'p2',
    });
    const rejected = await call('applyTournamentResult', assigned.token, {
      matchId: 'not-bracket',
      winnerUid: 'p1',
      scores: [
        [6, 4],
        [6, 2],
        [0, 0],
      ],
    });
    assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
  },
);
