/**
 * Courts and zones for the Cloud Functions: the one court slug and the zone roster. Same module
 * name and `courtKey` as Racquets-And-Strings. Helpers only (see notify.js for why).
 *
 * courts.json is the courtKey → zone roster, generated from
 * public/Tennis Courts Facilities - 4326.csv. Regenerate it if the CSV changes.
 */
const courts = require('../courts.json');

// Same normalization as src/utils/courtKey.ts — keep in sync.
const courtKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The zone a court belongs to, or '' when it isn't on the roster. */
const zoneOfCourt = (key) => courts[key] || '';

// zone -> [courtKey, …], built once from the roster.
const ZONE_COURTS = (() => {
  const m = {};
  for (const [key, zone] of Object.entries(courts)) (m[zone] = m[zone] || []).push(key);
  return m;
})();

/** Every court key in a zone ([] for an unknown zone). */
const courtsInZone = (zone) => ZONE_COURTS[zone] || [];

module.exports = { courtKey, zoneOfCourt, courtsInZone };
