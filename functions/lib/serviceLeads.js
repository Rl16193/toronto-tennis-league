/**
 * The shared first step of booking or redeeming a service (same module name as
 * Racquets-And-Strings): check the service can be booked, find the provider's account, refuse your
 * own service, and share contacts both ways. Helpers only (see notify.js for why).
 */
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertBookable } = require('./bookingState');
const { providerMemberUids } = require('./roles');
const { linkPlayers } = require('../connections');

/**
 * Returns { service, providerUids, userName } for member `uid` opening a job on catalog entry
 * `serviceId`. `ownMessage` is shown when the member is the provider.
 */
async function recordServiceLead(uid, serviceId, ownMessage) {
  const db = admin.firestore();
  const service = assertBookable(await db.doc(`services/${serviceId}`).get());
  const providerUids = await providerMemberUids(service.provider_id);
  if (providerUids.length === 0) throw new HttpsError('failed-precondition', 'This provider isn’t taking bookings yet.');
  if (providerUids.includes(uid)) throw new HttpsError('failed-precondition', ownMessage);
  const userSnap = await db.doc(`users/${uid}`).get();
  const userName = userSnap.exists ? (userSnap.data().name || '') : '';
  await Promise.all(providerUids.map((p) => linkPlayers(uid, p, 'booking')));
  return { service, providerUids, userName };
}

module.exports = { recordServiceLead };
