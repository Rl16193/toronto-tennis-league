/**
 * Argument checks shared by every callable (same module and names as Racquets-And-Strings).
 * Helpers only (see notify.js for why).
 */
const { HttpsError } = require('firebase-functions/v2/https');

function requireAuth(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  return uid;
}

function requireTrimmedString(value, message, options = {}) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) throw new HttpsError('invalid-argument', message);
  if (typeof options.maxLength === 'number' && trimmed.length > options.maxLength) {
    throw new HttpsError('invalid-argument', message);
  }
  return trimmed;
}

/** A Firestore document id taken from the caller: present, and no path separator. */
function requireDocId(value, message) {
  const id = requireTrimmedString(value, message);
  if (id.includes('/')) throw new HttpsError('invalid-argument', message);
  return id;
}

function normalizeCouponCode(value) {
  return requireTrimmedString(value, 'Missing coupon code.').toUpperCase();
}

module.exports = { normalizeCouponCode, requireAuth, requireDocId, requireTrimmedString };
