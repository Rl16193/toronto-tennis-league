const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { REGION } = require('./lib/constants');

const db = () => admin.firestore();
const PLAYER_LOADING = 'Player Loading';
const DEFAULT_ZONE = 'downtown_midtown';
const zoneId = (value) =>
  String(value || '')
    .trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .toLowerCase();
const effectiveZone = (value) => zoneId(value) || DEFAULT_ZONE;
const skillBand = (value) =>
  Number(value || 0) < 3 ? 'Beginners' : Number(value || 0) < 4 ? 'Challengers' : 'Masters';
const active = (p) => p && p.removal !== true && p.status !== 'withdrawn' && p.active !== false;

function resolvesToDraw(participant, match, preferredZone, merges = {}) {
  if (!['singles', 'doubles'].includes(match.category)) return false;
  if (match.tournament_choice !== participant.tournament_choice) return false;
  if (match.division !== participant.division && match.division !== 'All') return false;
  const band = participant.skill_group || skillBand(participant.skill);
  if (match.skill_group !== band && match.skill_group !== 'All') return false;
  if (match.category === 'singles') {
    let target = effectiveZone(match.zone);
    let wanted = effectiveZone(participant.zone || preferredZone);
    for (let i = 0; i < 10 && merges[wanted] && merges[wanted] !== wanted; i += 1) wanted = merges[wanted];
    for (let i = 0; i < 10 && merges[target] && merges[target] !== target; i += 1) target = merges[target];
    if (target !== wanted) return false;
  }
  return true;
}

function openSlot(match) {
  if (!match || match.status === 'complete') return null;
  if (!match.player_1_uid && [PLAYER_LOADING, '', undefined].includes(match.player_1_name)) return 'player_1';
  if (!match.player_2_uid && [PLAYER_LOADING, '', undefined].includes(match.player_2_name)) return 'player_2';
  return null;
}

/** Pure placement decision used by the Firestore trigger and unit tests. */
function choosePlacement(participant, matches, preferredZone, merges = {}) {
  if (!active(participant)) return null;
  const candidates = matches.filter((m) => resolvesToDraw(participant, m, preferredZone, merges));
  const rr = candidates.filter((m) => m.format === 'rr' && m.round === 'RR');
  if (rr.length) {
    const groups = new Map();
    rr.forEach((m) => {
      const key = m.rr_group ?? 0;
      const entry = groups.get(key) || { count: new Set(), match: null, slot: null };
      [m.player_1_uid, m.player_2_uid].filter(Boolean).forEach((uid) => entry.count.add(uid));
      if (!entry.slot && openSlot(m)) {
        entry.match = m;
        entry.slot = openSlot(m);
      }
      groups.set(key, entry);
    });
    const group = [...groups.values()].find((entry) => entry.slot && entry.count.size < 5);
    if (group) return { matchId: group.match.id, slot: group.slot };
  }
  const slot = candidates.map((match) => ({ match, slot: openSlot(match) })).find((entry) => entry.slot);
  return slot ? { matchId: slot.match.id, slot: slot.slot } : null;
}

async function seatParticipant(participantId, participant) {
  const eventSnap = await db().doc(`events/${participant.event_id}`).get();
  if (!eventSnap.exists) return null;
  const event = eventSnap.data() || {};
  const preferred = participant.zone || (await db().doc(`preferences/${participant.uid}`).get()).data()?.preferred_zone;
  const matchSnap = await db().collection('matches').where('event_id', '==', participant.event_id).get();
  const matches = matchSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const decision = choosePlacement(participant, matches, preferred, event.zone_draw_config?.merges || {});
  if (!decision) return null;
  const ref = db().doc(`matches/${decision.matchId}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current = snap.data();
    if (openSlot(current) !== decision.slot) return; // another participant won the race
    tx.update(ref, {
      [`${decision.slot}_uid`]: participant.uid,
      [`${decision.slot}_name`]: participant.user_name || 'Player',
    });
  });
  logger.info('participant placed by server', { participantId, matchId: decision.matchId, slot: decision.slot });
  return decision;
}

exports.choosePlacement = choosePlacement;
exports.onParticipantCreated = onDocumentCreated(
  { document: 'event_participants/{participantId}', region: REGION },
  async (event) => {
    const participant = event.data?.data();
    if (!participant || !participant.event_id || !participant.uid || participant.uid.startsWith('__loading_')) return;
    try {
      await seatParticipant(event.params.participantId, participant);
      if (participant.partner_uid && participant.tournament_choice === 'Doubles') {
        const existing = await db()
          .collection('event_participants')
          .where('event_id', '==', participant.event_id)
          .where('uid', '==', participant.partner_uid)
          .limit(1)
          .get();
        if (existing.empty) {
          const partnerUser = await db().doc(`users/${participant.partner_uid}`).get();
          const partnerStats = await db().doc(`stats/${participant.partner_uid}`).get();
          if (partnerUser.exists) {
            await db()
              .collection('event_participants')
              .add({
                uid: participant.partner_uid,
                user_name: partnerUser.data()?.name || 'Partner',
                event_id: participant.event_id,
                event_name: participant.event_name || '',
                tournament_choice: 'Doubles',
                division: participant.division || '',
                doubles: participant.user_name || '',
                partner_in_app: 'yes',
                partner_uid: participant.uid,
                skill: partnerStats.data()?.skill_level || participant.skill || 0,
                status: 'active',
                created_at: new Date().toISOString(),
              });
          }
        }
      }
    } catch (error) {
      logger.error('participant placement failed', { participantId: event.params.participantId, error: error.message });
    }
  },
);
