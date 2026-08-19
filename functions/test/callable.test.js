const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HttpsError } = require('firebase-functions/v2/https');
const { normalizeCouponCode, optionalTrimmedString, requireAuth, requireTrimmedString } = require('../lib/callable');

test('requireAuth returns the caller uid and rejects unauthenticated requests', () => {
  assert.equal(requireAuth({ auth: { uid: 'user_123' } }), 'user_123');

  assert.throws(
    () => requireAuth({ auth: null }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, 'unauthenticated');
      assert.equal(error.message, 'Sign in to continue.');
      return true;
    },
  );
});

test('requireTrimmedString trims surrounding whitespace and enforces presence', () => {
  assert.equal(requireTrimmedString('  value  ', 'Missing value.'), 'value');

  assert.throws(
    () => requireTrimmedString('   ', 'Missing value.'),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, 'invalid-argument');
      assert.equal(error.message, 'Missing value.');
      return true;
    },
  );
});

test('requireTrimmedString enforces maxLength after trimming', () => {
  assert.equal(requireTrimmedString('  a@b.co  ', 'Missing email.', { maxLength: 320 }), 'a@b.co');

  assert.throws(
    () =>
      requireTrimmedString(` ${'a'.repeat(321)} `, 'Missing email.', {
        maxLength: 320,
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, 'invalid-argument');
      assert.equal(error.message, 'Missing email.');
      return true;
    },
  );
});

test('coupon and optional string helpers normalize input without changing empty semantics', () => {
  assert.equal(normalizeCouponCode(' rs-ab12 '), 'RS-AB12');
  assert.equal(optionalTrimmedString('  note here  '), 'note here');
  assert.equal(optionalTrimmedString(null), '');
});
