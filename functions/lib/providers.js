const admin = require('firebase-admin');

/**
 * Provider identity is server-owned. A provider row describes roles and the linked member uid;
 * it is deliberately separate from the public preferences projection.
 */
async function providerForUid(uid) {
  const snap = await admin.firestore().collection('providers').where('member_uid', '==', uid).limit(10).get();
  return snap.docs.find((doc) => Array.isArray(doc.data().roles) && doc.data().roles.length > 0) || null;
}

async function providerIdForRole(uid, role) {
  const doc = await providerForUid(uid);
  if (!doc) return null;
  const data = doc.data();
  return data.roles.includes(role) ? doc.id : null;
}

module.exports = { providerForUid, providerIdForRole };
