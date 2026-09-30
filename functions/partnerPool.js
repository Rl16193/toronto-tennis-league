/**
 * Doubles partner pool (ported from Racquets-And-Strings). A doubles player who joins without a
 * partner is listed at partner_pool/{eventId}/members/{uid}; players in the same pool can see
 * each other's contact details so they can pair up. The client writes only its own membership;
 * the contact card each member exposes to the pool is written here, never by a client.
 *
 * Deploy: firebase deploy --only functions:onPartnerPoolJoin,functions:onPartnerPoolLeave
 */
const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const { REGION } = require('./lib/constants');
const { notify } = require('./lib/notify');

const db = () => admin.firestore();

// Only the channels a pool member needs to arrange a partnership; blanks are left out.
function contactCard(contact = {}) {
  const card = {};
  ['email', 'phone', 'whatsapp_contact'].forEach((k) => {
    if (typeof contact[k] === 'string' && contact[k].trim()) card[k] = contact[k].trim();
  });
  if (Array.isArray(contact.preferred_mode_of_contact)) card.preferred_mode_of_contact = contact.preferred_mode_of_contact;
  if (contact.whatsapp_same_as_phone === true && card.phone) card.whatsapp_same_as_phone = true;
  return card;
}

exports.onPartnerPoolJoin = onDocumentCreated(
  { document: 'partner_pool/{eventId}/members/{uid}', region: REGION },
  async (event) => {
    const member = event.data?.data();
    const { eventId, uid } = event.params;
    if (!member || member.uid !== uid) return;
    const [contactSnap, eventSnap, sameCategory] = await Promise.all([
      db().doc(`contacts/${uid}`).get(),
      db().doc(`events/${eventId}`).get(),
      db().collection(`partner_pool/${eventId}/members`).where('category', '==', member.category).get(),
    ]);
    await db().doc(`partner_pool/${eventId}/contacts/${uid}`).set(contactCard(contactSnap.data() || {}));
    const title = eventSnap.exists ? eventSnap.data().title : '';
    const others = sameCategory.docs.map((d) => d.id).filter((id) => id !== uid);
    await notify(others, {
      type: 'partner_pool_joined',
      title: 'A new player is looking for a doubles partner',
      body: `${member.name || 'A player'} joined the partner pool for ${title || 'your event'}.`,
      link: `/tournament?event=${eventId}`,
    }).catch(() => {});
  },
);

exports.onPartnerPoolLeave = onDocumentDeleted(
  { document: 'partner_pool/{eventId}/members/{uid}', region: REGION },
  async (event) => {
    const { eventId, uid } = event.params;
    await db().doc(`partner_pool/${eventId}/contacts/${uid}`).delete().catch(() => {});
  },
);
