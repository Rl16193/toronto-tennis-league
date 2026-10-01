/**
 * Server-side steps when a registration is written (event_participants). Ported from
 * Racquets-And-Strings' participantWorkflow.js, narrowed to this repo's rules:
 *
 * 0. Recounts the member's entries (stats.eventsJoined / tournamentsPlayed) on every create,
 *    status change or delete — set, never incremented, so re-joining can't double-count.
 * 1. Late-joiner seating, KNOCKOUT ONLY: finds the open seat in the draw the player belongs to
 *    and seats them in a transaction (lib/participantSeat.js). Round-robin placement stays manual
 *    (CLAUDE.md "Placement is manual"); an RR match is never seated here.
 * 2. Doubles with a member partner: the partner gets their own registration (pointing back).
 * 3. Doubles with no partner: the partner pool (connections to others looking in that division).
 *    Steps 2 and 3 also run when partner_uid changes after joining (a teammate named later).
 *
 * Deploy: firebase deploy --only functions:onParticipantSeat
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const { REGION } = require('./lib/constants');
const { seatJoiner, registerMemberPartner, joinPartnerPool } = require('./lib/participantSeat');
const { recountEntries } = require('./lib/scoring');
const { linkPlayers } = require('./connections');

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
    const partnerChanged = !!before && !!after && (before.partner_uid || '') !== (after.partner_uid || '');
    if (!after || after.status !== 'active' || !(created || statusChanged || partnerChanged)) return;
    if (created || statusChanged) {
      const outcome = await safely('late joiner seating', id, () => seatJoiner(after));
      if (outcome) logger.info('late joiner seating', { participantId: id, outcome });
    }
    await safely('partner registration', id, () => registerMemberPartner(after));
    await safely('partner pool', id, () => joinPartnerPool(after, linkPlayers));
  },
);
