/**
 * Signup-time email lookup.
 *
 * The signup email gate has to answer "is this address already registered?" BEFORE anyone is
 * signed in. It used to do that with an unauthenticated query against `users` — which is exactly
 * why phone numbers and emails sitting in that world-readable collection were a problem. Those
 * fields now live in `contacts`, which requires a sign-in, so the check moves here: the Admin SDK
 * bypasses rules, and the callable returns only two booleans, never any member data.
 *
 * Deliberately minimal surface. It confirms whether an address is taken (which a signup form
 * reveals anyway by failing) and nothing else — no names, no uids, no other fields.
 *
 * Deploy with: firebase deploy --only functions
 */
const { onCall } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { REGION } = require('./lib/constants');
const { requireTrimmedString } = require('./lib/callable');

const db = () => admin.firestore();

exports.checkSignupEmail = onCall({ region: REGION }, async (request) => {
  const email = requireTrimmedString(request.data && request.data.email, 'An email address is required.', {
    maxLength: 320,
  });

  const [primary, secondary] = await Promise.all([
    db().collection('contacts').where('email', '==', email).limit(1).get(),
    db().collection('contacts').where('secondary_email', '==', email).limit(1).get(),
  ]);

  return { exists: !primary.empty, secondary: !secondary.empty };
});
