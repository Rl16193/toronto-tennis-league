const { HttpsError } = require('firebase-functions/v2/https');

function requireAuth(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  return uid;
}

function requireTrimmedString(value, message, { maxLength } = {}) {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', message);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpsError('invalid-argument', message);
  }
  if (typeof maxLength === 'number' && trimmed.length > maxLength) {
    throw new HttpsError('invalid-argument', message);
  }

  return trimmed;
}

function optionalTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCouponCode(value) {
  return requireTrimmedString(value, 'Missing coupon code.').toUpperCase();
}

module.exports = {
  normalizeCouponCode,
  optionalTrimmedString,
  requireAuth,
  requireTrimmedString,
};
