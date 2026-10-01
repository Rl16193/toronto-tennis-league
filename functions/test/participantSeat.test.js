// Registration helpers against the Firestore emulator only (project demo-ttl).
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through the emulator: npm run test:functions');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-ttl' });
const db = admin.firestore();
const { seatJoiner, registerMemberPartner, joinPartnerPool, registrationId } = require('../lib/participantSeat');

const clear = () => fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ttl/databases/(default)/documents`,
  { method: 'DELETE' },
);
const match = async (id) => (await db.doc(`matches/${id}`).get()).data();
const alerts = async (uid, type) =>
  (await db.collection('notifications').where('uid', '==', uid).where('sub_category', '==', type).get()).size;
const knockout = (extra = {}) => ({
  category: 'tournament', sub_category: 'singles', event_id: 'e1', format: 'knockout', round: 'R16', position: 1,
  status: 'accepted', winner_uid: '', division: "Men's", skill_group: 'Challengers', zone: '',
  player_1_uid: 'x', player_1_name: 'Xan', player_2_uid: '', player_2_name: 'Player Loading', participant_uids: ['x'], ...extra,
});
const joiner = (extra = {}) => ({
  uid: 'j', user_name: 'Jo', event_id: 'e1', event_name: 'Test Open', category: 'singles_tournament', sub_category: 'knockout',
  division: "Men's", skill: 3.5, partner_uid: '', partner_name: '', status: 'active', ...extra,
});
const doubles = (extra = {}) => joiner({ category: 'doubles_tournament', ...extra });

beforeEach(async () => {
  await clear();
  await db.doc('events/e1').set({ title: 'Test Open', organizer_ids: ['org-1'] });
  await db.doc('preferences/j').set({ preferred_zone: 'Downtown - Midtown' });
});
after(() => admin.app().delete());

// ── Knockout late-joiner seating ──

test('a late joiner is seated in an open spot of their draw', async () => {
  await db.doc('matches/k1').set(knockout());
  assert.equal(await seatJoiner(joiner()), 'seated');
  const m = await match('k1');
  assert.deepEqual([m.player_2_uid, m.player_2_name], ['j', 'Jo']);
  assert.deepEqual([...m.participant_uids].sort(), ['j', 'x']);
});

test('the earliest round and lowest position is filled first', async () => {
  await db.doc('matches/qf').set(knockout({ round: 'QF', position: 1 }));
  await db.doc('matches/k2').set(knockout({ position: 2 }));
  await db.doc('matches/k1').set(knockout({ position: 1 }));
  assert.equal(await seatJoiner(joiner()), 'seated');
  assert.equal((await match('k1')).player_2_uid, 'j');
  assert.deepEqual([(await match('k2')).player_2_uid, (await match('qf')).player_2_uid], ['', '']);
});

test('a spot someone else holds is left alone', async () => {
  await db.doc('matches/k1').set(knockout({ player_2_uid: 'other', player_2_name: 'Oli', participant_uids: ['x', 'other'] }));
  assert.equal(await seatJoiner(joiner()), 'no open spot');
  assert.equal((await match('k1')).player_2_uid, 'other');
});

test('a player already in the draw is not seated twice', async () => {
  await db.doc('matches/k1').set(knockout());
  await db.doc('matches/k0').set(knockout({ player_2_uid: 'j', player_2_name: 'Jo', participant_uids: ['x', 'j'] }));
  assert.equal(await seatJoiner(joiner()), 'already seated');
  assert.equal((await match('k1')).player_2_uid, '');
});

test('round-robin is never seated automatically', async () => {
  await db.doc('matches/k1').set(knockout({ format: 'rr', round: 'RR' }));
  assert.equal(await seatJoiner(joiner({ sub_category: 'rr' })), null);
  assert.equal(await seatJoiner(joiner()), 'no open spot');
  assert.equal((await match('k1')).player_2_uid, '');
});

test('only an active tournament registration is seated', async () => {
  await db.doc('matches/k1').set(knockout());
  assert.equal(await seatJoiner(joiner({ status: 'withdrawn' })), null);
  assert.equal(await seatJoiner(joiner({ category: 'social' })), null);
  assert.equal((await match('k1')).player_2_uid, '');
});

test('a spot in another division, skill band or zone is refused', async () => {
  await db.doc('matches/k1').set(knockout({ division: "Women's" }));
  assert.equal(await seatJoiner(joiner()), 'no open spot');
  await db.doc('matches/k1').set(knockout({ skill_group: 'Masters' }));
  assert.equal(await seatJoiner(joiner()), 'no open spot');
  await db.doc('matches/k1').set(knockout({ zone: 'scarborough' }));
  assert.equal(await seatJoiner(joiner()), 'no open spot');
  await db.doc('matches/k1').set(knockout({ division: 'All', skill_group: 'All' })); // a merged draw takes anyone
  assert.equal(await seatJoiner(joiner()), 'seated');
});

test('a zone merged into another plays in that zone\'s draw', async () => {
  await db.doc('events/e1').set({ zone_draw_config: { merges: { scarborough: 'downtown_midtown' } } }, { merge: true });
  await db.doc('preferences/j').set({ preferred_zone: 'Scarborough' });
  await db.doc('matches/k1').set(knockout()); // no zone: the default zone
  assert.equal(await seatJoiner(joiner()), 'seated');
});

test('doubles ignores zone and puts the member partner on court, never a guest', async () => {
  await db.doc('matches/d1').set(knockout({ sub_category: 'doubles', zone: 'scarborough' }));
  assert.equal(await seatJoiner(doubles({ partner_uid: 'pp', partner_name: 'Pia' })), 'seated');
  assert.deepEqual([...(await match('d1')).participant_uids].sort(), ['j', 'pp', 'x']);
  await db.doc('matches/d2').set(knockout({ sub_category: 'doubles', player_1_uid: 'y', participant_uids: ['y'] }));
  assert.equal(await seatJoiner(doubles({ uid: 'k', user_name: 'Kai', partner_uid: 'guest_1' })), 'seated');
  assert.deepEqual([...(await match('d2')).participant_uids].sort(), ['k', 'y']);
});

// ── Doubles partners ──

test('registration ids carry the doubles division', () => {
  assert.equal(registrationId('e1', 'u', 'singles_tournament', "Men's"), 'e1_u');
  assert.equal(registrationId('e1', 'u', 'doubles_tournament', "Men's"), 'e1_u_mensdoubles');
  assert.equal(registrationId('e1', 'u', 'doubles_tournament', "Women's"), 'e1_u_womensdoubles');
  assert.equal(registrationId('e1', 'u', 'doubles_tournament', 'Mixed Doubles'), 'e1_u_mixeddoubles');
});

test('a member partner is registered with the joiner, once, and told', async () => {
  await db.doc('users/pp').set({ name: 'Pia' });
  await db.doc('stats/pp').set({ skill_level: 3.5 });
  const p = doubles({ partner_uid: 'pp', partner_name: 'Pia', skill: 4 });
  await registerMemberPartner(p);
  await registerMemberPartner(p); // replay must not register twice
  const rows = await db.collection('event_participants').where('uid', '==', 'pp').get();
  assert.equal(rows.size, 1);
  assert.equal(rows.docs[0].id, 'e1_pp_mensdoubles');
  const row = rows.docs[0].data();
  assert.deepEqual(
    [row.user_name, row.partner_uid, row.partner_name, row.skill, row.status, row.category, row.sub_category, row.division],
    ['Pia', 'j', 'Jo', 3.5, 'active', 'doubles_tournament', 'knockout', "Men's"],
  );
  assert.deepEqual([row.withdrawn_reason, row.withdrawn_at, row.withdrawn_by], ['', null, '']);
  assert.equal(await alerts('pp', 'partner_registered'), 1);
});

test('the partner\'s row pointing back does not register the joiner again', async () => {
  await db.doc('users/pp').set({ name: 'Pia' });
  await db.doc('users/j').set({ name: 'Jo' });
  await db.doc('event_participants/e1_j_mensdoubles').set(doubles({ partner_uid: 'pp', partner_name: 'Pia' }));
  await registerMemberPartner(doubles({ partner_uid: 'pp', partner_name: 'Pia' }));
  const partnerRow = (await db.doc('event_participants/e1_pp_mensdoubles').get()).data();
  await registerMemberPartner(partnerRow);
  assert.equal((await db.collection('event_participants').get()).size, 2);
});

test('a guest partner, no partner, a non-member or singles registers nobody', async () => {
  await db.doc('users/pp').set({ name: 'Pia' });
  await registerMemberPartner(doubles({ partner_uid: 'guest_1', partner_name: 'Gus' }));
  await registerMemberPartner(doubles());
  await registerMemberPartner(doubles({ partner_uid: 'nobody' }));
  await registerMemberPartner(joiner({ partner_uid: 'pp' }));
  await registerMemberPartner(doubles({ partner_uid: 'pp', status: 'withdrawn' }));
  assert.equal((await db.collection('event_participants').get()).size, 0);
});

// ── Partner pool: active doubles registrations with no partner ──

test('a player with no partner is linked to everyone looking in their division, and they are told', async () => {
  const reg = (uid, extra = {}) => db.doc(`event_participants/e1_${uid}_mensdoubles`).set(doubles({ uid, user_name: uid, ...extra }));
  await reg('o1');
  await reg('o2', { partner_uid: 'o9' });
  await reg('o3', { division: "Women's" });
  await reg('o4', { status: 'withdrawn' });
  await reg('guest_5');
  await reg('j');
  const links = [];
  await joinPartnerPool(doubles(), async (a, b, reason) => { links.push([a, b, reason]); });
  assert.deepEqual(links, [['j', 'o1', 'partner_pool']]);
  assert.equal(await alerts('o1', 'partner_pool_joined'), 1);
  assert.equal(await alerts('o3', 'partner_pool_joined'), 0);
});

test('a player with a partner, a withdrawn one or a singles player joins no pool', async () => {
  await db.doc('event_participants/e1_o1_mensdoubles').set(doubles({ uid: 'o1' }));
  const links = [];
  const link = async (a, b, reason) => { links.push([a, b, reason]); };
  await joinPartnerPool(doubles({ partner_uid: 'pp' }), link);
  await joinPartnerPool(doubles({ status: 'withdrawn' }), link);
  await joinPartnerPool(joiner(), link);
  assert.deepEqual(links, []);
  assert.equal(await alerts('o1', 'partner_pool_joined'), 0);
});
