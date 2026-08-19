const assert = require('node:assert/strict');
const { test } = require('node:test');
const { earnedRsPoints } = require('../lib/points');
const { emailDeliveryDecision } = require('../lib/emailDelivery');

test('earnedRsPoints combines setup, completed tiers, and server bonus points', () => {
  assert.equal(earnedRsPoints(null), 0);
  assert.equal(earnedRsPoints({ setupComplete: true, play5: true, bonusPoints: 3 }), 30);
  assert.equal(earnedRsPoints({ setupComplete: false, play5: false, play10: true }), 5);
  assert.equal(earnedRsPoints({ setupComplete: true, play5: true, unknown: true }), 27);
});

test('email delivery blocks emulators and non-production by default', () => {
  assert.deepEqual(
    emailDeliveryDecision({
      projectId: 'rands-local',
      recipient: 'test@example.invalid',
      emulator: true,
    }),
    { deliver: false, reason: 'emulator' },
  );
  assert.deepEqual(
    emailDeliveryDecision({
      projectId: 'rands-staging',
      recipient: 'test@example.invalid',
    }),
    { deliver: false, reason: 'non-production-disabled' },
  );
});

test('email delivery requires an exact allowlist in non-production', () => {
  const base = { projectId: 'rands-staging', recipient: 'qa@example.invalid', enabled: true };
  assert.deepEqual(emailDeliveryDecision({ ...base, allowlist: [] }), {
    deliver: false,
    reason: 'recipient-not-allowlisted',
  });
  assert.deepEqual(emailDeliveryDecision({ ...base, allowlist: ['qa@example.invalid'] }), {
    deliver: true,
    reason: 'non-production-allowlisted',
  });
});

test('production delivery remains explicit by project identity', () => {
  assert.deepEqual(
    emailDeliveryDecision({
      projectId: 'toronto-tennis-league',
      recipient: 'member@example.invalid',
    }),
    { deliver: true, reason: 'production' },
  );
});
