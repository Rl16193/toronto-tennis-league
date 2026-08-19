/**
 * Opponent connections — the server-side record of "these two may see each other's contacts".
 *
 * `contacts/{uid}` is readable only by the owner or by someone holding a connection, and a
 * connection is only ever created here, never by a client. Earned by an accepted rally or
 * challenge (either direction), or by being drawn against each other in a tournament match.
 *
 * Doc id is the two uids sorted and joined with `__`, so a pair yields exactly one doc.
 * firestore.rules recomputes the same id with its own pairId() — the two MUST stay in sync or
 * every contact read starts failing.
 *
 * Connections are permanent: revoking on match completion would strand people mid-arrangement.
 * Deployment is environment-gated. Follow docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md;
 * do not use a bare Firebase deploy command from this checkout.
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const { REGION } = require('./lib/constants');
const { safeId } = require('./lib/logging');
const db = () => admin.firestore();

const publicContactFields = (contact = {}) => ({
  email: contact.email || '',
  phone: contact.phone || '',
  preferred_mode_of_contact: contact.preferred_mode_of_contact || '',
  whatsapp_contact: contact.whatsapp_contact || '',
  whatsapp_same_as_phone: contact.whatsapp_same_as_phone === true,
  contactable: contact.contactable !== false,
});

/** Order-independent pair id. Must match pairId() in firestore.rules exactly. */
const pairId = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);

/** Idempotent — `create` on an existing doc throws ALREADY_EXISTS, avoiding a read per match write. */
async function linkPlayers(a, b, reason) {
  if (!a || !b || a === b) return false;
  try {
    await db()
      .collection('connections')
      .doc(pairId(a, b))
      .create({
        uids: [a, b].sort(),
        reason,
        created_at: new Date().toISOString(),
      });
    return true;
  } catch (err) {
    if (err.code === 6 || err.code === 'already-exists') return false; // already linked
    logger.error('linkPlayers failed', { a: safeId(a), b: safeId(b), reason, err: err.message });
    return false;
  }
}

exports.linkPlayers = linkPlayers;
exports.pairId = pairId;

/**
 * Marketplace sellers are a separate consent case: posting a listing IS an invitation to be
 * contacted by a stranger. Rules can't ask "does this user have a listing", so this marker doc
 * answers it — one per seller, present only while they have a listing. Without it, locking
 * `contacts` to opponents removes the Contact button from every listing on the board.
 */
exports.onListingContact = onDocumentWritten({ document: 'listings/{id}', region: REGION }, async (event) => {
  const uid = event.data?.after?.data()?.uid || event.data?.before?.data()?.uid;
  if (!uid) return;

  const remaining = await db().collection('listings').where('uid', '==', uid).limit(1).get();
  const ref = db().collection('public_contacts').doc(uid);

  if (remaining.empty) {
    await ref.delete().catch(() => {
      /* already gone */
    });
    logger.info('public_contacts cleared', { uid: safeId(uid) });
    return;
  }
  const contact = await db().collection('contacts').doc(uid).get();
  await ref.set({
    uid,
    reason: 'listing',
    ...publicContactFields(contact.data()),
    updated_at: new Date().toISOString(),
  });
});

/** Keep an existing listing projection current without copying private account metadata. */
exports.onContactProjection = onDocumentWritten({ document: 'contacts/{uid}', region: REGION }, async (event) => {
  const ref = db().collection('public_contacts').doc(event.params.uid);
  const marker = await ref.get();
  if (!marker.exists) return;
  const after = event.data?.after?.data();
  if (!after) return ref.delete();
  await ref.set({ ...publicContactFields(after), updated_at: new Date().toISOString() }, { merge: true });
});

exports.publicContactFields = publicContactFields;

/**
 * `onDocumentWritten`, not created/updated separately: a tournament match arrives already
 * populated (create) while a rally or challenge earns its connection later, on accept (update).
 */
exports.onMatchConnection = onDocumentWritten({ document: 'matches/{id}', region: REGION }, async (event) => {
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
      logger.info('connection created', { pair: safeId(pairId(a, b)), reason: after.category });
    }
    return;
  }

  // Tournament fixture: both slots filled with real players. PLAYER_LOADING placeholders carry
  // no uid, so they never reach here.
  if (await linkPlayers(a, b, 'tournament')) {
    logger.info('connection created', { pair: safeId(pairId(a, b)), reason: 'tournament' });
  }
});
