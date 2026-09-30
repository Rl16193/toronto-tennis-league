/**
 * Who may act: organizers (per event, Racquets-And-Strings ADR-001) and service providers.
 * Helpers only (see notify.js for why).
 */
const admin = require('firebase-admin');
const { SUPER_ADMIN_UID } = require('./constants');

const db = () => admin.firestore();

/** An event's organizers (Racquets-And-Strings ADR-001): its creator and its `organizer_ids`. */
const eventOrganizerUids = (event) =>
  [...new Set([event && event.creator_id, ...((event && Array.isArray(event.organizer_ids)) ? event.organizer_ids : [])].filter(Boolean))];

/**
 * The one organizer check. For an event: the super admin, its creator or its `organizer_ids`.
 * With no event (a rally, rewards, claims): the super admin or any `event_creator` account.
 */
async function isOrganizer(uid, event = null) {
  if (uid === SUPER_ADMIN_UID) return true;
  if (event && event.creator_id) return eventOrganizerUids(event).includes(uid);
  const snap = await db().doc(`preferences/${uid}`).get();
  return snap.exists && snap.data().event_creator === true;
}

// A stringer or coach is a normal account with `stringer_id` / `coach_id` on their preferences
// doc naming the catalog entry they own. Same role-flag shape as `event_creator`.
async function providerIdFor(uid) {
  const snap = await db().doc(`preferences/${uid}`).get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (d.stringer === true && typeof d.stringer_id === 'string') return d.stringer_id;
  if (d.coach === true && typeof d.coach_id === 'string') return d.coach_id;
  return null;
}

/**
 * Every account holding a provider's role. They act on its bookings and receive its alerts. Only
 * the super admin can set these fields (firestore.rules locks them for owners).
 */
async function providerMemberUids(providerId) {
  if (typeof providerId !== 'string' || !providerId) return [];
  const [stringers, coaches] = await Promise.all([
    db().collection('preferences').where('stringer_id', '==', providerId).get(),
    db().collection('preferences').where('coach_id', '==', providerId).get(),
  ]);
  const uids = [
    ...stringers.docs.filter((d) => d.data().stringer === true),
    ...coaches.docs.filter((d) => d.data().coach === true),
  ].map((d) => d.id);
  return [...new Set(uids)];
}

module.exports = { eventOrganizerUids, isOrganizer, providerIdFor, providerMemberUids };
