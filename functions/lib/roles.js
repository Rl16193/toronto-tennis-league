/**
 * Who may act: organizers (per event, Racquets-And-Strings ADR-001) and service providers.
 * Roles live on `providers/{uid}.roles` (stringer | coach | organizer); the doc id is the member's uid.
 * Helpers only (see notify.js for why).
 */
const admin = require('firebase-admin');
const { SUPER_ADMIN_UID } = require('./constants');

const db = () => admin.firestore();

/** An event's managers: `organizer_ids`, the creator first. */
const eventOrganizerUids = (event) =>
  [...new Set(((event && Array.isArray(event.organizer_ids)) ? event.organizer_ids : []).filter(Boolean))];

/** The roles a member holds, [] when they have no providers doc. */
async function rolesOf(uid) {
  if (!uid) return [];
  const snap = await db().doc(`providers/${uid}`).get();
  return snap.exists && Array.isArray(snap.data().roles) ? snap.data().roles : [];
}

/**
 * The one organizer check. For an event: the super admin or anyone in its `organizer_ids`.
 * With no event (a rally, rewards, claims): the super admin or any member with the organizer role.
 */
async function isOrganizer(uid, event = null) {
  if (uid === SUPER_ADMIN_UID) return true;
  if (event) return eventOrganizerUids(event).includes(uid);
  return (await rolesOf(uid)).includes('organizer');
}

/** A stringer or coach is identified by their own uid; null when the member provides nothing. */
async function providerIdFor(uid) {
  const roles = await rolesOf(uid);
  return roles.includes('stringer') || roles.includes('coach') ? uid : null;
}

/** The accounts acting for a provider: the provider's own account (the id is the uid). */
async function providerMemberUids(providerId) {
  if (typeof providerId !== 'string' || !providerId) return [];
  const roles = await rolesOf(providerId);
  return roles.includes('stringer') || roles.includes('coach') ? [providerId] : [];
}

module.exports = { eventOrganizerUids, isOrganizer, providerIdFor, providerMemberUids, rolesOf };
