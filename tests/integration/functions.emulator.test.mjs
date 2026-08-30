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

test('signup lookup throttles repeated pre-auth enumeration', async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await call('checkSignupEmail', undefined, { email: `lookup-${attempt}@example.invalid` });
    assert.equal(result.status, 200);
    assert.equal(result.body.result.exists, false);
  }
  const blocked = await call('checkSignupEmail', undefined, { email: 'lookup-blocked@example.invalid' });
  assert.equal(blocked.body.error.status, 'RESOURCE_EXHAUSTED');
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

test('group lesson enrollment maintains expiring coach contact access', async () => {
  const player = await session('group-lesson-player');
  await Promise.all([
    db.doc(`users/${player.uid}`).set({ name: 'Group Lesson Player' }),
    db.doc('tasks/a-unrelated-active-coach').set({
      type: 'offer',
      category: 'coaching',
      provider_id: 'unrelated-coach',
      provider_name: 'Unrelated Active Coach',
      uid: 'coach-b',
      active: true,
    }),
    db.doc('tasks/b-inactive-archie-coach').set({
      type: 'offer',
      category: 'coaching',
      provider_id: 'archie',
      provider_name: 'Inactive Archie',
      uid: 'coach-a',
      active: false,
    }),
    db.doc('tasks/z-active-archie-coach').set({
      type: 'offer',
      category: 'coaching',
      provider_id: 'archie',
      provider_name: 'Synthetic Archie',
      uid: 'coach-a',
      active: true,
    }),
  ]);

  const joined = await call('joinGroupLesson', player.token, {});
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  const accessAfterJoin = (await db.doc('group_lesson_contact_access/current').get()).data();
  const rosterAfterJoin = (await db.collection('group_lessons').limit(1).get()).docs[0].data();
  assert.equal(accessAfterJoin.coach_id, 'archie');
  assert.equal(rosterAfterJoin.coach_id, 'archie');
  assert.equal(rosterAfterJoin.coach_name, 'Synthetic Archie');
  assert.deepEqual(accessAfterJoin.player_ids, [player.uid]);
  assert.ok(accessAfterJoin.expires_at.toDate().getTime() > Date.now());

  const left = await call('leaveGroupLesson', player.token, {});
  assert.equal(left.status, 200, JSON.stringify(left.body));
  const accessAfterLeave = (await db.doc('group_lesson_contact_access/current').get()).data();
  assert.deepEqual(accessAfterLeave.player_ids, []);
});

test('booking completion requests keep the lifecycle status in progress', async () => {
  const member = await session('booking-member');
  const providerMember = await session('booking-provider');
  await Promise.all([
    db.doc('providers/provider-1').set({
      id: 'provider-1',
      name: 'Test Stringer',
      roles: ['stringer'],
      member_uid: providerMember.uid,
    }),
    db.doc('services/service-1').set({
      id: 'service-1',
      provider_id: 'provider-1',
      active: true,
      category: 'stringing',
      offer: 'Test restring',
    }),
  ]);

  const booked = await call('book', member.token, { service_id: 'service-1', provider_id: 'provider-1' });
  assert.equal(booked.status, 200, JSON.stringify(booked.body));
  const bookingId = booked.body.result.booking.id;
  assert.equal((await db.doc(`bookings/${bookingId}`).get()).data().status, 'lead');

  assert.equal((await call('racquetDropped', providerMember.token, { booking_id: bookingId })).status, 200);
  assert.equal((await call('requestCompletion', providerMember.token, { booking_id: bookingId })).status, 200);
  const awaitingConfirmation = (await db.doc(`bookings/${bookingId}`).get()).data();
  assert.equal(awaitingConfirmation.status, 'in_progress');
  assert.equal(typeof awaitingConfirmation.completion_requested_at, 'string');

  assert.equal((await call('confirmCompletion', member.token, { booking_id: bookingId, confirmed: true })).status, 200);
  assert.equal((await db.doc(`bookings/${bookingId}`).get()).data().status, 'completed');
});

const ambassadorClaim = (uid, inviteeId, status = 'pending') => ({
  type: 'ambassador',
  uid,
  user_name: `Claimant ${uid}`,
  invitee_id: inviteeId,
  invitee_name: `Invitee ${inviteeId}`,
  status,
  created_at: '2026-08-23T00:00:00.000Z',
});

const notificationsFor = async (uid, type) => {
  const snapshot = await db.collection('notifications').where('uid', '==', uid).get();
  return snapshot.docs.filter((doc) => doc.data().type === type);
};

const deleteNotificationsFor = async (uid) => {
  const snapshot = await db.collection('notifications').where('uid', '==', uid).get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
};

test('ambassador claims auto-approve', async () => {
  const claimantId = `claimant-${crypto.randomUUID()}`;
  const inviteeId = `invitee-${crypto.randomUUID()}`;
  const claimRef = db.doc(`task_claims/ambassador_${inviteeId}`);
  const pending = ambassadorClaim(claimantId, inviteeId);

  await claimRef.set(pending);
  await waitFor(
    () => claimRef.get(),
    (snapshot) => snapshot.data()?.status === 'approved',
  );
  assert.equal((await claimRef.get()).data().status, 'approved');
});

test('legacy approved ambassador claim rejects a new deterministic duplicate', async () => {
  const claimantId = `claimant-${crypto.randomUUID()}`;
  const legacyClaimantId = `legacy-${crypto.randomUUID()}`;
  const inviteeId = `invitee-${crypto.randomUUID()}`;
  const legacyRef = db.doc(`task_claims/legacy-${crypto.randomUUID()}`);
  const claimRef = db.doc(`task_claims/ambassador_${inviteeId}`);

  await legacyRef.set({ ...ambassadorClaim(legacyClaimantId, inviteeId, 'approved'), type: 'volunteer' });
  await legacyRef.update({ type: 'ambassador' });
  await claimRef.set(ambassadorClaim(claimantId, inviteeId));

  const rejected = await waitFor(
    async () => (await claimRef.get()).data(),
    (claim) => claim?.status === 'rejected',
  );
  assert.equal(rejected.reviewer_note, 'Already claimed by another member.');
  assert.equal((await legacyRef.get()).data().status, 'approved');
});

test('approval guard awards no invite when a legacy approved ambassador claim exists', async () => {
  const claimantId = `claimant-${crypto.randomUUID()}`;
  const legacyClaimantId = `legacy-${crypto.randomUUID()}`;
  const inviteeId = `invitee-${crypto.randomUUID()}`;
  const legacyRef = db.doc(`task_claims/legacy-${crypto.randomUUID()}`);
  const claimRef = db.doc(`task_claims/ambassador_${inviteeId}`);

  await legacyRef.set({ ...ambassadorClaim(legacyClaimantId, inviteeId, 'approved'), type: 'volunteer' });
  await legacyRef.update({ type: 'ambassador' });
  await claimRef.set(ambassadorClaim(claimantId, inviteeId));

  const rejected = await waitFor(
    async () => (await claimRef.get()).data(),
    (claim) => claim?.status === 'rejected',
  );
  assert.equal(rejected.reviewer_note, 'Already claimed by another member.');
  assert.equal((await db.doc(`tasks/${claimantId}`).get()).exists, false);
});

test('joining an event marks initiation progress without a reserved placeholder field', async () => {
  const playerId = `event-player-${crypto.randomUUID()}`;
  await db.doc(`event_participants/${crypto.randomUUID()}`).set({
    event_id: 'synthetic-event',
    uid: playerId,
    user_name: 'Synthetic Event Player',
  });

  const progress = await waitFor(
    async () => (await db.doc(`tasks/${playerId}`).get()).data(),
    (task) => task?.joinEvent === true,
  );
  assert.equal(Object.hasOwn(progress, '__none__'), false);
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
      walkover: false,
      set_1_player_1: 6,
      set_1_player_2: 4,
      set_2_player_1: 6,
      set_2_player_2: 2,
      set_3_player_1: 0,
      set_3_player_2: 0,
    }),
  ]);
  await waitFor(
    async () => Promise.all([db.doc(`tasks/${playerOne}`).get(), db.doc(`tasks/${playerTwo}`).get()]),
    (progress) => progress.every((snapshot) => snapshot.data()?.joinEvent === true),
  );
};

const waitForTournamentProgress = (playerOne, playerTwo) =>
  waitFor(
    async () => Promise.all([db.doc(`tasks/${playerOne}`).get(), db.doc(`tasks/${playerTwo}`).get()]),
    (progress) => progress.every((snapshot) => snapshot.data()?.matchesPlayed === 1),
  );

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
  await waitForTournamentProgress('p1', 'p2');

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
    await waitForTournamentProgress('p1', 'p2');

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
