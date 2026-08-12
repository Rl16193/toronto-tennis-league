/**
 * Opponent connections — the server-side record of "these two people may see each other's
 * contact details".
 *
 * Contact details (phone / email / WhatsApp) live in `contacts/{uid}` and used to be readable by
 * any signed-in member. They are now readable only by the owner, or by someone holding a
 * connection to them — and a connection is only ever created here, never by a client.
 *
 * A connection is earned by:
 *   - an accepted rally or challenge (either direction), or
 *   - being drawn against each other in a tournament match.
 *
 * Doc id is the two uids sorted and joined with `__`, so the pair is order-independent and one
 * pair can only ever produce one document. `firestore.rules` recomputes the same id with its own
 * pairId() helper — the two MUST stay in sync or every contact read starts failing.
 *
 * Connections are deliberately permanent. Once you have played someone you keep the ability to
 * reach them; revoking on match completion would strand people mid-arrangement.
 *
 * Deploy with: firebase deploy --only functions:onMatchConnection
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const { REGION } = require('./lib/constants');
const db = () => admin.firestore();

/** Order-independent pair id. Must match pairId() in firestore.rules exactly. */
const pairId = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);

/**
 * Records a connection between two players. Idempotent — `create` on an existing doc throws
 * ALREADY_EXISTS, which is the cheap way to avoid a read on every single match write.
 */
async function linkPlayers(a, b, reason) {
  if (!a || !b || a === b) return false;
  try {
    await db().collection('connections').doc(pairId(a, b)).create({
      uids: [a, b].sort(),
      reason,
      created_at: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    if (err.code === 6 || err.code === 'already-exists') return false; // already linked
    logger.error('linkPlayers failed', { a, b, reason, err: err.message });
    return false;
  }
}

exports.linkPlayers = linkPlayers;
exports.pairId = pairId;

/**
 * Marketplace sellers are a separate consent case: posting a listing IS an invitation to be
 * contacted by a stranger, and that was already how the board worked. Rules can't ask "does this
 * user have a listing", so this marker doc answers it for them — one doc per seller, present only
 * while they have at least one listing.
 *
 * Without it, locking `contacts` to opponents would silently remove the Contact button from every
 * listing on the board.
 */
exports.onListingContact = onDocumentWritten(
  { document: 'listings/{id}', region: REGION },
  async (event) => {
    const uid = event.data?.after?.data()?.uid || event.data?.before?.data()?.uid;
    if (!uid) return;

    const remaining = await db().collection('listings').where('uid', '==', uid).limit(1).get();
    const ref = db().collection('public_contacts').doc(uid);

    if (remaining.empty) {
      await ref.delete().catch(() => { /* already gone */ });
      logger.info('public_contacts cleared', { uid });
      return;
    }
    await ref.set({ uid, reason: 'listing', updated_at: new Date().toISOString() });
  },
);

/**
 * Watches every match doc. `onDocumentWritten` rather than created/updated separately because a
 * tournament match arrives already populated (create) while a rally or challenge only earns its
 * connection later, when the recipient accepts (update).
 */
exports.onMatchConnection = onDocumentWritten(
  { document: 'matches/{id}', region: REGION },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return; // deleted

    const a = after.player_1_uid;
    const b = after.player_2_uid;
    if (!a || !b) return;

    // Score submissions are bookkeeping about a match, not a fixture of their own.
    if (after.category === 'score_submission') return;

    if (after.category === 'rally' || after.category === 'challenge') {
      // Only an ACCEPTED request earns contact access. An open request must not — otherwise
      // anyone could harvest a phone number by firing off a challenge nobody answers.
      if (after.status !== 'accepted') return;
      if (await linkPlayers(a, b, after.category)) {
        logger.info('connection created', { pair: pairId(a, b), reason: after.category });
      }
      return;
    }

    // Tournament fixture: both slots filled with real players. PLAYER_LOADING placeholders carry
    // no uid, so they never reach here.
    if (await linkPlayers(a, b, 'tournament')) {
      logger.info('connection created', { pair: pairId(a, b), reason: 'tournament' });
    }
  },
);
