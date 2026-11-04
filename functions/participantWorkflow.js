/**
 * Server-side steps when a registration is written (event_participants). Ported from
 * Racquets-And-Strings' participantWorkflow.js, narrowed to this repo's rules:
 *
 * 0. Recounts the member's entries (stats.eventsJoined / tournamentsPlayed) on every create,
 *    status change or delete — set, never incremented, so re-joining can't double-count.
 * 1. Nobody is seated here. A player who joins after a draw is generated, knockout or round robin,
 *    waits in Unplaced Players until an organizer seats them (CLAUDE.md "Placement is manual").
 * 2. Doubles with a member partner: the partner gets their own registration (pointing back).
 * 3. Doubles with no partner: the partner pool (connections to others looking in that division).
 *    Steps 2 and 3 also run when partner_uid changes after joining (a teammate named later).
 * 4. A member who withdraws themselves: the event's organizers are alerted.
 *
 * Deploy: firebase deploy --only functions:onParticipantSeat
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const { REGION } = require('./lib/constants');
const { registerMemberPartner, joinPartnerPool } = require('./lib/participantSeat');
const { recountEntries } = require('./lib/scoring');
const { linkPlayers } = require('./connections');
const { notify } = require('./lib/notify');
const { eventOrganizerUids } = require('./lib/roles');

const REASON_TEXT = { wrong_zone: 'wrong zone', unavailable: 'unavailable', other: 'other' };

// Their opponents already have walkovers; a slot with no real opponent is the organizer's to clear.
async function alertSelfWithdrawal(p) {
  const ev = await admin.firestore().doc(`events/${p.event_id}`).get();
  if (!ev.exists) return;
  const name = p.user_name || 'A player';
  const reason = REASON_TEXT[p.withdrawn_reason];
  await notify(eventOrganizerUids(ev.data()), {
    type: 'organizer_player_withdrew',
    title: `${name} withdrew from ${p.event_name || 'your event'}`,
    body: `${name} withdrew${reason ? ` (${reason})` : ''}. Their opponents got walkovers. Clear any slot they still hold with no opponent from Edit Draw.`,
    link: `/tournament?event=${p.event_id}`,
    counterpart_uid: p.uid,
    counterpart_name: name,
  });
}

const safely = async (what, id, fn) => {
  try { return await fn(); } catch (err) { logger.error(`${what} failed`, { participantId: id, err: String(err) }); return null; }
};

exports.onParticipantSeat = onDocumentWritten(
  { document: 'event_participants/{participantId}', region: REGION },
  async (event) => {
    const id = event.params.participantId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const p = after || before;
    if (!p || !p.event_id || !p.uid) return;
    const created = !before && !!after;
    const statusChanged = !!before && !!after && before.status !== after.status;
    if (created || statusChanged || !after) await safely('entry recount', id, () => recountEntries(admin.firestore(), p.uid));
    if (statusChanged && before.status === 'active' && after.status === 'withdrawn' && after.withdrawn_by === after.uid) {
      await safely('withdrawal alert', id, () => alertSelfWithdrawal(after));
    }
    const partnerChanged = !!before && !!after && (before.partner_uid || '') !== (after.partner_uid || '');
    if (!after || after.status !== 'active' || !(created || statusChanged || partnerChanged)) return;
    await safely('partner registration', id, () => registerMemberPartner(after));
    await safely('partner pool', id, () => joinPartnerPool(after, linkPlayers));
  },
);
