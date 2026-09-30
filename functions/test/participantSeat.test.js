// Registration helpers against the Firestore emulator only (project demo-ttl).
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through the emulator: npm run test:functions');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-ttl' });
const db = admin.firestore();
const { seatRequested, registerMemberPartner } = require('../lib/participantSeat');

const clear = () => fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ttl/databases/(default)/documents`,
  { method: 'DELETE' },
);
const knockout = (extra = {}) => ({
  category: 'singles', event_id: 'e1', format: 'bracket', round: 'R16', status: 'pending',
  tournament_choice: 'Singles', division: "Men's", skill_group: 'Challengers',
  player_1_uid: 'x', player_1_name: 'Xan', player_2_uid: '', player_2_name: 'Player Loading', ...extra,
});
const joiner = (extra = {}) => ({
  uid: 'j', user_name: 'Jo', event_id: 'e1', event_name: 'Test Open', tournament_choice: 'Singles',
  division: "Men's", requested_match_id: 'k1', requested_slot: 'player_2', ...extra,
});

beforeEach(clear);
after(() => admin.app().delete());

test('a late joiner is seated in the open spot they were offered', async () => {
  await db.doc('matches/k1').set(knockout());
  assert.equal(await seatRequested(joiner()), 'seated');
  const m = (await db.doc('matches/k1').get()).data();
  assert.equal(m.player_2_uid, 'j');
  assert.equal(m.player_2_name, 'Jo');
});

test('a spot someone else took first is left alone', async () => {
  await db.doc('matches/k1').set(knockout({ player_2_uid: 'other', player_2_name: 'Oli' }));
  assert.equal(await seatRequested(joiner()), 'spot taken');
  assert.equal((await db.doc('matches/k1').get()).data().player_2_uid, 'other');
});

test('round-robin is never seated automatically', async () => {
  await db.doc('matches/k1').set(knockout({ format: 'rr', round: 'RR' }));
  assert.equal(await seatRequested(joiner()), 'not a knockout match');
});

test('a spot in another event or division is refused', async () => {
  await db.doc('matches/k1').set(knockout({ event_id: 'e2' }));
  assert.equal(await seatRequested(joiner()), 'other event');
  await db.doc('matches/k1').set(knockout({ division: "Women's" }));
  assert.equal(await seatRequested(joiner()), 'wrong division');
});

test('no requested spot means nothing happens', async () => {
  assert.equal(await seatRequested(joiner({ requested_match_id: undefined })), null);
});

test('a member partner is registered with the joiner, once', async () => {
  await db.doc('users/pp').set({ name: 'Pia' });
  await db.doc('stats/pp').set({ skill_level: 3.5 });
  const p = joiner({ tournament_choice: 'Doubles', partner_in_app: 'yes', partner_uid: 'pp', doubles: 'Pia' });
  await registerMemberPartner('r1', p);
  await registerMemberPartner('r1', p); // replay must not register twice
  const rows = await db.collection('event_participants').where('uid', '==', 'pp').get();
  assert.equal(rows.size, 1);
  const row = rows.docs[0].data();
  assert.equal(row.partner_uid, 'j');
  assert.equal(row.doubles, 'Jo');
  assert.equal(row.skill, 3.5);
  assert.equal(row.auto_registered_by, 'j');
});

test('a guest partner or an auto-registered row registers nobody', async () => {
  await db.doc('users/pp').set({ name: 'Pia' });
  await registerMemberPartner('r1', joiner({ tournament_choice: 'Doubles', partner_in_app: 'no', partner_uid: '' }));
  await registerMemberPartner('r2', joiner({ tournament_choice: 'Doubles', partner_in_app: 'yes', partner_uid: 'pp', auto_registered_by: 'z' }));
  assert.equal((await db.collection('event_participants').get()).size, 0);
});
