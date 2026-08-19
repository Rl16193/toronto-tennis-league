const { HttpsError } = require('firebase-functions/v2/https');

const allowedStatuses = Object.freeze({
  use: new Set(['active', 'flagged']),
  flag: new Set(['active']),
  cancelRequest: new Set(['active']),
  reviewApprove: new Set(['cancel_requested']),
  reviewDecline: new Set(['flagged', 'cancel_requested']),
});

const messages = Object.freeze({
  use: 'That coupon is not available for redemption.',
  flag: 'Only an active coupon can be flagged.',
  cancelRequest: 'Only an active coupon can be cancelled.',
  reviewApprove: 'Only a pending cancellation can be approved.',
  reviewDecline: 'That coupon has no pending review.',
});

/**
 * Keep coupon state transitions explicit. The organizer UI intentionally resolves a flagged
 * coupon through markCouponUsed, while only a pending cancellation may refund points.
 */
function assertCouponStatus(status, transition) {
  const allowed = allowedStatuses[transition];
  if (!allowed) throw new Error(`Unknown redemption transition: ${transition}`);
  if (!allowed.has(status)) throw new HttpsError('failed-precondition', messages[transition]);
}

module.exports = { assertCouponStatus };
