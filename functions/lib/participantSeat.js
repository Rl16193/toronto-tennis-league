/**
 * Registration helpers for participantWorkflow.js (late-joiner seating, member-partner
 * registration). Helpers only, so they can be tested against the emulator directly.
 */
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify } = require('./notify');

const db = () => admin.firestore();
const OPEN_NAMES = ['Player Loading', 'BYE', ''];

const slotIsOpen = (m, slot) => !m[`${slot}_uid`] && OPEN_NAMES.includes(m[`${slot}_name`] || '');

async function seatRequested(participant) {
  const matchId = participant.requested_match_id;
  const slot = participant.requested_slot;
  if (typeof matchId !== 'string' || !matchId || (slot !== 'player_1' && slot !== 'player_2')) return null;
  return db().runTransaction(async (tx) => {
    const ref = db().doc(`matches/${matchId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) return 'match gone';
    const m = snap.data();
    if (m.event_id !== participant.event_id) return 'other event';
    if (!['singles', 'doubles'].includes(m.category) || m.format === 'rr') return 'not a knockout match';
    if (m.tournament_choice !== participant.tournament_choice) return 'wrong format';
    if (m.division !== participant.division && m.division !== 'All') return 'wrong division';
    if (m.status === 'complete') return 'already played';
    if (!slotIsOpen(m, slot)) return 'spot taken';
    if ([m.player_1_uid, m.player_2_uid].includes(participant.uid)) return 'already seated';
    tx.update(ref, { [`${slot}_uid`]: participant.uid, [`${slot}_name`]: participant.user_name || 'Player' });
    return 'seated';
  });
}

async function registerMemberPartner(participantId, p) {
  if (p.tournament_choice !== 'Doubles' || p.partner_in_app !== 'yes' || p.auto_registered_by) return;
  const partnerUid = p.partner_uid;
  if (!partnerUid || partnerUid === p.uid) return;
  const existing = await db().collection('event_participants')
    .where('event_id', '==', p.event_id).where('uid', '==', partnerUid).get();
  if (existing.docs.some((d) => d.data().removal !== true && d.data().tournament_choice === 'Doubles')) return;

  const [userSnap, statsSnap] = await Promise.all([
    db().doc(`users/${partnerUid}`).get(),
    db().doc(`stats/${partnerUid}`).get(),
  ]);
  if (!userSnap.exists) return;
  const partnerName = userSnap.data().name || p.doubles || 'Partner';
  await db().collection('event_participants').add({
    uid: partnerUid,
    user_name: partnerName,
    event_id: p.event_id,
    event_name: p.event_name || '',
    tournament_choice: 'Doubles',
    division: p.division || '',
    doubles: p.user_name || '',
    partner_in_app: 'yes',
    partner_uid: p.uid,
    skill: statsSnap.exists ? Number(statsSnap.data().skill_level || 0) : Number(p.skill || 0),
    dateselected: [],
    auto_registered_by: p.uid,
    created_at: new Date().toISOString(),
  });
  await notify(partnerUid, {
    type: 'partner_registered',
    title: `${p.user_name || 'Your partner'} registered you for ${p.event_name || 'a tournament'}`,
    body: 'You are in their doubles team. If that is a mistake, ask the organizer to remove you.',
    link: `/tournament?event=${p.event_id}`,
  }).catch(() => {});
  logger.info('doubles partner registered', { participantId, partnerUid });
}

module.exports = { seatRequested, registerMemberPartner };
