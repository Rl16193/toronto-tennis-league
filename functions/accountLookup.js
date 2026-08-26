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
 * reveals anyway by failing) and nothing else — no names, no uids, no other fields. Deployed
 * instances require a valid App Check token so this cannot be scraped as an open callable.
 * The Functions emulator bypasses App Check to keep synthetic local signup testing possible.
 *
 * Deployment is environment-gated. Follow docs/archive/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md;
 * do not use a bare Firebase deploy command from this checkout.
 */
const nodeCrypto = require('node:crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const { REGION } = require('./lib/constants');
const { requireTrimmedString } = require('./lib/callable');

const db = () => admin.firestore();

const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== 'true';
const LOOKUP_WINDOW_MS = 60_000;
const LOOKUP_LIMIT = 30;

const lookupActorKey = (request) => {
  const forwarded = request.rawRequest?.headers?.['x-forwarded-for'];
  const source = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.rawRequest?.ip || 'unknown')
    .split(',')[0]
    .trim();
  return nodeCrypto.createHash('sha256').update(source).digest('hex').slice(0, 32);
};

const enforceLookupRateLimit = async (request, now = Date.now()) => {
  const ref = db().collection('_account_lookup_rate_limits').doc(lookupActorKey(request));
  await db().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const prior = snapshot.data() || {};
    const windowStart = Number(prior.window_start_ms) || 0;
    const inWindow = now - windowStart < LOOKUP_WINDOW_MS;
    const count = inWindow ? Number(prior.count) || 0 : 0;
    if (count >= LOOKUP_LIMIT) throw new HttpsError('resource-exhausted', 'Please wait before checking another email.');
    tx.set(ref, {
      window_start_ms: inWindow ? windowStart : now,
      count: count + 1,
      expires_at: Timestamp.fromMillis(now + LOOKUP_WINDOW_MS * 2),
    });
  });
};

exports.checkSignupEmail = onCall({ region: REGION, enforceAppCheck }, async (request) => {
  await enforceLookupRateLimit(request);
  const email = requireTrimmedString(request.data && request.data.email, 'An email address is required.', {
    maxLength: 320,
  });

  const [primary, secondary] = await Promise.all([
    db().collection('contacts').where('email', '==', email).limit(1).get(),
    db().collection('contacts').where('secondary_email', '==', email).limit(1).get(),
  ]);

  return { exists: !primary.empty, secondary: !secondary.empty };
});
