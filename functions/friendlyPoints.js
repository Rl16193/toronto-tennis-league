/**
 * Friendly (rally) match points.
 *
 * A friendly is recorded once a SECOND party confirms the reported score — the other player, or an
 * admin. Winner +2 leaguePoints26, loser +1; neither ever loses points, unlike a challenge's ±3.
 * Both players also get matchesPlayed +1 and a win/loss.
 *
 * Runs server-side because leaguePoints26 is organizer-gated in firestore.rules — no client can
 * write it. The rules also forbid the reporter confirming their own report; that check, not this
 * file, is what stops a player minting points.
 *
 * The `applied` stamp is written in the same transaction as the payout and checked first.
 * `status === 'confirmed'` is NOT proof of payment — the same defect already bit the RR +5 bonus.
 *
 * Deployment is environment-gated. Follow docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md;
 * do not use a bare Firebase deploy command from this checkout.
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const { REGION } = require('./lib/constants');
const { safeId } = require('./lib/logging');
const { isValidFriendlyResult, winnerFor } = require('./lib/friendlyResult');
const db = () => admin.firestore();

const WINNER_POINTS = 2;
const LOSER_POINTS = 1;

exports.onFriendlyConfirmedAwardPoints = onDocumentUpdated(
  { document: 'matches/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (after.category !== 'rally') return;
    if (before.status === 'confirmed' || after.status !== 'confirmed') return;

    // `winner_uid` is the current field; `claimed_winner_uid` is what rallies used before results
    // were normalised to the tournament shape. Reading both means this keeps paying whichever
    // order hosting and functions happen to deploy in, and for rows written either way.
    const winnerId = winnerFor(after);
    const p1 = after.player_1_uid;
    const p2 = after.player_2_uid;
    if (!isValidFriendlyResult(after)) {
      logger.warn('friendlyPoints: invalid result, skipping payout', { id: safeId(event.params.id) });
      return;
    }
    const loserId = winnerId === p1 ? p2 : p1;
    if (loserId === winnerId) return;

    const ref = db().collection('matches').doc(event.params.id);

    try {
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        // Re-read inside the transaction: two confirms landing together would otherwise both
        // see an unpaid match and pay twice.
        if (snap.data().applied === true) return;

        tx.set(
          db().collection('stats').doc(winnerId),
          {
            leaguePoints26: admin.firestore.FieldValue.increment(WINNER_POINTS),
            matchesPlayed: admin.firestore.FieldValue.increment(1),
            wins: admin.firestore.FieldValue.increment(1),
          },
          { merge: true },
        );

        tx.set(
          db().collection('stats').doc(loserId),
          {
            leaguePoints26: admin.firestore.FieldValue.increment(LOSER_POINTS),
            matchesPlayed: admin.firestore.FieldValue.increment(1),
            loses: admin.firestore.FieldValue.increment(1),
          },
          { merge: true },
        );

        tx.set(ref, { applied: true, applied_at: new Date().toISOString() }, { merge: true });
      });
      logger.info('friendlyPoints: paid', {
        id: safeId(event.params.id),
        winner: safeId(winnerId),
        loser: safeId(loserId),
      });
    } catch (err) {
      logger.error('friendlyPoints: payout failed', { id: safeId(event.params.id), err: String(err) });
      // Throw so the Firestore trigger retries and a confirmed match cannot remain silently
      // unpaid. The transaction's applied marker keeps a successful retry idempotent.
      throw err;
    }
  },
);
