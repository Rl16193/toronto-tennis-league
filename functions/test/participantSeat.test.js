// Registration helpers against the Firestore emulator only (project demo-ttl).
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through the emulator: npm run test:functions');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-ttl' });
const db = admin.firestore();
const { registerMemberPartner, joinPartnerPool, registrationId } = require('../lib/participantSeat');

const clear = () => fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ttl/databases/(default)/documents`,
  { method: 'DELETE' },
);
const alerts = async (uid, type) =>
  (await db.collection('notifications').where('uid', '==', uid).where('sub_category', '==', type).get()).size;
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
  await joinPartnerPool(doubles({ partner_uid: 'guest_1', partner_name: 'Gus' }), link); // a guest partner is a partner
  await joinPartnerPool(doubles({ status: 'withdrawn' }), link);
  await joinPartnerPool(joiner(), link);
  assert.deepEqual(links, []);
  assert.equal(await alerts('o1', 'partner_pool_joined'), 0);
});
