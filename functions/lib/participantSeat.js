/**
 * Registration helpers for participantWorkflow.js (late-joiner seating, member-partner rows, the
 * doubles partner pool) and zoneMoves.js. Helpers only, so they can be tested against the emulator.
 */
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { notify } = require('./notify');
const { isGuest } = require('./constants');

const db = () => admin.firestore();

// MIRRORS src/pages/tournament/utils.ts — functions/ is a separate package and can't import from
// src/, so these have to be changed together. A match with no `zone` predates zones and belongs to
// the DEFAULT zone, not to a fourth category.
const DEFAULT_ZONE = 'Downtown - Midtown';
const zoneBucketId = (zone) => String(zone || '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
const effectiveZone = (zone) => zone || zoneBucketId(DEFAULT_ZONE);
const skillBand = (s) => (s < 3 ? 'Beginners' : s < 4 ? 'Challengers' : 'Masters');
/** Follow a zone through the event's merges to the one it actually plays in (cycles bail out). */
const resolveMergedZone = (bucketId, merges = {}) => {
  let id = bucketId;
  for (let i = 0; i < 10 && merges[id] && merges[id] !== id; i += 1) id = merges[id];
  return id;
};
// A doubles registration's id carries its division: {eventId}_{uid}_{mensdoubles|womensdoubles|mixeddoubles}.
const DBL = { "men's": 'mensdoubles', "women's": 'womensdoubles', 'mixed doubles': 'mixeddoubles' };
const registrationId = (eventId, uid, category, division) =>
  `${eventId}_${uid}${category === 'doubles_tournament' ? `_${DBL[String(division || '').toLowerCase()] || 'doubles'}` : ''}`;

const OPEN_NAMES = ['Player Loading', 'BYE', ''];
const slotIsOpen = (m, slot) => !m[`${slot}_uid`] && OPEN_NAMES.includes(m[`${slot}_name`] || '');
const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'F'];
/** A match's order in its round or group: the last number in its `match_id` (`m3`, `rr_g2_m4`). */
const orderOf = (matchId) => Number((String(matchId || '').match(/(\d+)\D*$/) || [])[1] || 0);

/**
 * Knockout late-joiner seating: finds an open first-round-first seat in the draw this registration
 * belongs to (format, division, skill band, zone) and seats the player inside a transaction, so two
 * joiners can never take the same seat. Round-robin placement stays manual (CLAUDE.md).
 */
async function seatJoiner(p) {
  if (!/_tournament$/.test(p.category || '') || p.status !== 'active' || p.sub_category !== 'knockout') return null;
  const sub = p.category === 'doubles_tournament' ? 'doubles' : 'singles';
  const [eventSnap, prefsSnap, matchSnap] = await Promise.all([
    db().doc(`events/${p.event_id}`).get(),
    db().doc(`preferences/${p.uid}`).get(),
    db().collection('matches').where('event_id', '==', p.event_id).where('category', '==', 'tournament').get(),
  ]);
  if (eventSnap.exists && eventSnap.data().status === 'cancelled') return null;
  const merges = (eventSnap.exists && eventSnap.data().zone_draw_config && eventSnap.data().zone_draw_config.merges) || {};
  const myZone = resolveMergedZone(zoneBucketId(prefsSnap.exists ? prefsSnap.data().preferred_zone : ''), merges);
  const band = skillBand(Number(p.skill || 0));
  const all = matchSnap.docs.map((d) => ({ ref: d.ref, id: d.id, ...d.data() }));
  if (all.some((m) => m.player_1_uid === p.uid || m.player_2_uid === p.uid)) return 'already seated';
  const candidates = all
    .filter((m) => m.format === 'knockout' && m.sub_category === sub && m.status !== 'complete')
    .filter((m) => m.division === p.division || m.division === 'All')
    .filter((m) => m.skill_group === band || m.skill_group === 'All')
    .filter((m) => sub === 'doubles' || resolveMergedZone(effectiveZone(m.zone), merges) === myZone)
    .flatMap((m) => ['player_1', 'player_2'].filter((s) => slotIsOpen(m, s)).map((slot) => ({ m, slot })))
    .sort((a, b) => ROUND_ORDER.indexOf(a.m.round) - ROUND_ORDER.indexOf(b.m.round) || orderOf(a.m.match_id) - orderOf(b.m.match_id));
  for (const { m, slot } of candidates) {
    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(m.ref);
      if (!snap.exists) return 'match gone';
      const live = snap.data();
      if (live.status === 'complete' || !slotIsOpen(live, slot)) return 'spot taken';
      // participant_uids carries both sides and their doubles partners, as the draw editor keeps it.
      const onCourt = [p.uid, p.partner_uid].filter((u) => u && !isGuest(u));
      tx.update(m.ref, { [`${slot}_uid`]: p.uid, [`${slot}_name`]: p.user_name || 'Player', participant_uids: FieldValue.arrayUnion(...onCourt), updated_at: Timestamp.now() });
      return 'seated';
    });
    if (outcome === 'seated') return 'seated';
  }
  return candidates.length ? 'every open spot was taken' : 'no open spot';
}

/** A full event_participants doc. */
const registrationDoc = (fields) => ({
  uid: '', user_name: '', event_id: '', event_name: '', category: '', sub_category: '', division: '', skill: 0,
  partner_uid: '', partner_name: '', status: 'active', withdrawn_reason: '', withdrawn_at: null, withdrawn_by: '',
  created_at: Timestamp.now(), ...fields,
});

/**
 * Doubles with a member partner: the partner gets their own registration (pointing back), unless
 * they already hold one in that division. Guests (`guest_…`) are linked by an organizer instead.
 */
async function registerMemberPartner(p) {
  if (p.category !== 'doubles_tournament' || p.status !== 'active') return;
  const partnerUid = p.partner_uid;
  if (!partnerUid || partnerUid === p.uid || isGuest(partnerUid)) return;
  const ref = db().doc(`event_participants/${registrationId(p.event_id, partnerUid, p.category, p.division)}`);
  const [existing, userSnap, statsSnap] = await Promise.all([ref.get(), db().doc(`users/${partnerUid}`).get(), db().doc(`stats/${partnerUid}`).get()]);
  if (existing.exists || !userSnap.exists) return;
  await ref.set(registrationDoc({
    uid: partnerUid, user_name: userSnap.data().name || p.partner_name || 'Partner', event_id: p.event_id, event_name: p.event_name || '',
    category: p.category, sub_category: p.sub_category, division: p.division || '',
    skill: statsSnap.exists ? Number(statsSnap.data().skill_level || 0) : Number(p.skill || 0),
    partner_uid: p.uid, partner_name: p.user_name || '',
  }));
  await notify(partnerUid, {
    type: 'partner_registered',
    title: `${p.user_name || 'Your partner'} registered you for ${p.event_name || 'a tournament'}`,
    body: 'You are in their doubles team. If that is a mistake, ask the organizer to remove you.',
    link: `/tournament?event=${p.event_id}`,
  }).catch(() => {});
  logger.info('doubles partner registered', { event: p.event_id, partnerUid });
}

/**
 * The partner pool is the event's active doubles registrations with no partner, per division. A new
 * one is connected to everyone already looking there (so they can read each other's contacts), and
 * those players are told someone joined.
 */
async function joinPartnerPool(p, linkPlayers) {
  if (p.category !== 'doubles_tournament' || p.status !== 'active' || p.partner_uid) return;
  const snap = await db().collection('event_participants')
    .where('event_id', '==', p.event_id).where('category', '==', 'doubles_tournament').where('status', '==', 'active').get();
  const others = snap.docs.map((d) => d.data())
    .filter((o) => o.uid && o.uid !== p.uid && !o.partner_uid && o.division === p.division && !isGuest(o.uid))
    .map((o) => o.uid);
  await Promise.all(others.map((o) => linkPlayers(p.uid, o, 'partner_pool')));
  await notify(others, {
    type: 'partner_pool_joined',
    title: 'A new player is looking for a doubles partner',
    body: `${p.user_name || 'A player'} joined the partner pool for ${p.event_name || 'your event'}.`,
    link: `/tournament?event=${p.event_id}`,
  }).catch(() => {});
}

module.exports = {
  seatJoiner, registerMemberPartner, joinPartnerPool, registrationDoc, registrationId,
  zoneBucketId, effectiveZone, skillBand, resolveMergedZone, orderOf,
};
