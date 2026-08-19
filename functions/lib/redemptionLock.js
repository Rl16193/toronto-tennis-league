const nodeCrypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const OPEN_REDEMPTION_STATUSES = Object.freeze(['active', 'flagged', 'cancel_requested']);
const TERMINAL_REDEMPTION_STATUSES = Object.freeze(['used', 'cancelled']);

const lockIdFor = (uid, rewardId) =>
  nodeCrypto
    .createHash('sha256')
    .update(`${String(uid)}:${String(rewardId)}`)
    .digest('hex');

const isOpenRedemptionStatus = (status) => OPEN_REDEMPTION_STATUSES.includes(status);
const isTerminalRedemptionStatus = (status) => TERMINAL_REDEMPTION_STATUSES.includes(status);

/**
 * Checks the one-open-coupon sentinel inside the caller's Firestore transaction. The caller must
 * perform this read before its other reads and call writeRedemptionLock only after all reads; that
 * ordering obeys Firestore's transaction rule while still making simultaneous redemptions contend
 * on the same document.
 */
const assertRedemptionLockAvailable = async (tx, lockRef) => {
  const snap = await tx.get(lockRef);
  if (snap.exists && !isTerminalRedemptionStatus(snap.data().status)) {
    throw new HttpsError('already-exists', 'You already have an open coupon for this offer.');
  }
};

const writeRedemptionLock = (tx, lockRef, data) => tx.set(lockRef, data, { merge: true });

module.exports = {
  OPEN_REDEMPTION_STATUSES,
  TERMINAL_REDEMPTION_STATUSES,
  isOpenRedemptionStatus,
  isTerminalRedemptionStatus,
  lockIdFor,
  assertRedemptionLockAvailable,
  writeRedemptionLock,
};
