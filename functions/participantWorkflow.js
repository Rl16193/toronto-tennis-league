/**
 * Server-side steps when someone registers for a tournament (event_participants create).
 * Ported from Racquets-And-Strings' participantWorkflow.js, narrowed to this repo's rules:
 *
 * 0. Counts the tournament entered (stats.tournamentsPlayed), once per player per event, through
 *    lib/scoring.js's points writer.
 * 1. Late-joiner seating, KNOCKOUT ONLY. The join sheet picks the open spot (right draw, skill
 *    and zone, with the player's fallback confirmation) and records it on the registration as
 *    `requested_match_id` / `requested_slot`. This trigger re-checks that spot inside a
 *    transaction and seats the player, so two joiners can never take the same spot. A player can
 *    no longer write a match, which is why this moved server-side. Round-robin placement stays
 *    manual (CLAUDE.md "Placement is manual"); an RR match is never seated here.
 * 2. Doubles partner who is a member: registering with a member partner also registers that
 *    partner (pointing back at the joiner), unless they already have a doubles registration.
 *
 * Deploy: firebase deploy --only functions:onParticipantSeat
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const { REGION } = require('./lib/constants');
const { seatRequested, registerMemberPartner } = require('./lib/participantSeat');
const { countTournamentEntry } = require('./lib/scoring');

exports.onParticipantSeat = onDocumentCreated(
  { document: 'event_participants/{participantId}', region: REGION },
  async (event) => {
    const p = event.data?.data();
    if (!p || !p.event_id || !p.uid || String(p.uid).startsWith('__loading_')) return;
    try {
      await countTournamentEntry(admin.firestore(), event.params.participantId);
    } catch (err) {
      logger.error('tournament entry count failed', { participantId: event.params.participantId, err: String(err) });
    }
    try {
      const outcome = await seatRequested(p);
      if (outcome) logger.info('late joiner seating', { participantId: event.params.participantId, outcome });
    } catch (err) {
      logger.error('late joiner seating failed', { participantId: event.params.participantId, err: String(err) });
    }
    try {
      await registerMemberPartner(event.params.participantId, p);
    } catch (err) {
      logger.error('partner registration failed', { participantId: event.params.participantId, err: String(err) });
    }
  },
);
