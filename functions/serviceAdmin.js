const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { REGION, SUPER_ADMIN_UID } = require('./lib/constants');
const { requireAuth, requireTrimmedString } = require('./lib/callable');
const { providerForUid } = require('./lib/providers');

const db = () => admin.firestore();
const categories = new Set(['stringing', 'coaching', 'others']);

async function authorizedProvider(uid, providerId, adminOnly = false) {
  if (uid === SUPER_ADMIN_UID) return true;
  if (adminOnly) return false;
  const provider = await providerForUid(uid);
  return !!provider && provider.id === providerId;
}

const cleanNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
};

exports.upsertService = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : db().collection('services').doc().id;
  const category = String(data.category || 'others');
  const providerId = requireTrimmedString(data.provider_id, 'Provider is required.');
  if (!categories.has(category)) throw new HttpsError('invalid-argument', 'Invalid service category.');
  if (!(await authorizedProvider(uid, providerId)))
    throw new HttpsError('permission-denied', 'You cannot edit this provider.');
  const providerSnap = await db().doc(`providers/${providerId}`).get();
  const provider = providerSnap.exists ? providerSnap.data() : {};
  const offer = requireTrimmedString(data.offer, 'Service description is required.');
  await db()
    .doc(`services/${id}`)
    .set(
      {
        id,
        category,
        provider_id: providerId,
        provider_name: provider.name || String(data.provider_name || '').trim(),
        area: String(data.area || provider.area || '')
          .trim()
          .slice(0, 120),
        contact_phone: String(data.phone || '')
          .trim()
          .slice(0, 40),
        contact_email: String(data.email || '')
          .trim()
          .slice(0, 160),
        certified: data.certified === true,
        offer,
        brands: String(data.brands || '')
          .trim()
          .slice(0, 240),
        total_price: cleanNumber(data.total_price),
        discount: cleanNumber(data.discount),
        points_cost: Math.round(cleanNumber(data.points_cost)),
        active: data.active !== false,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
  return { ok: true, id };
});

exports.deactivateService = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const id = requireTrimmedString(request.data?.id, 'Service is required.');
  const ref = db().doc(`services/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Service not found.');
  if (!(await authorizedProvider(uid, snap.data().provider_id)))
    throw new HttpsError('permission-denied', 'You cannot edit this provider.');
  await ref.update({ active: false, updated_at: new Date().toISOString() });
  return { ok: true };
});
