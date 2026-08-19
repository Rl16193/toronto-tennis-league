const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HttpsError } = require('firebase-functions/v2/https');
const { assertCouponStatus } = require('../lib/redemptionState');

test('coupon state transitions allow only the intended redemption paths', () => {
  assert.doesNotThrow(() => assertCouponStatus('active', 'use'));
  assert.doesNotThrow(() => assertCouponStatus('flagged', 'use'));
  assert.doesNotThrow(() => assertCouponStatus('active', 'flag'));
  assert.doesNotThrow(() => assertCouponStatus('active', 'cancelRequest'));
  assert.doesNotThrow(() => assertCouponStatus('cancel_requested', 'reviewApprove'));
  assert.doesNotThrow(() => assertCouponStatus('flagged', 'reviewDecline'));
  assert.doesNotThrow(() => assertCouponStatus('cancel_requested', 'reviewDecline'));
});

test('coupon state transitions reject reuse, disputed cancellation, and invalid refunds', () => {
  for (const [status, transition] of [
    ['used', 'use'],
    ['cancel_requested', 'use'],
    ['used', 'flag'],
    ['flagged', 'cancelRequest'],
    ['cancel_requested', 'cancelRequest'],
    ['flagged', 'reviewApprove'],
    ['active', 'reviewDecline'],
    ['used', 'reviewDecline'],
  ]) {
    assert.throws(
      () => assertCouponStatus(status, transition),
      (error) => error instanceof HttpsError && error.code === 'failed-precondition',
      `${status} should not support ${transition}`,
    );
  }
});
