import { ZoneName } from './zones';

/**
 * Courts and sites per zone, shown to players when they pick a zone to move to — the number of
 * courts is the practical reason to prefer one zone over another.
 *
 * A static table rather than a runtime calculation: deriving it needs the full facilities CSV
 * (~174 rows) parsed and every row run through `getZone`, which is a lot of work for a number
 * that only moves when the City publishes new court data.
 *
 * REGENERATE when `public/Tennis Courts Facilities - 4326.csv` or the zone boundaries in
 * `zones.ts` change — sum the CSV's `Courts` column per `getZone(lat, lng)`.
 * Last generated: 580 courts across 174 sites.
 */
export const ZONE_COURT_COUNTS: Record<ZoneName, { courts: number; sites: number }> = {
  'York West': { courts: 72, sites: 28 },
  Etobicoke: { courts: 87, sites: 28 },
  'Etobicoke - Lakeshore': { courts: 72, sites: 24 },
  'North York': { courts: 118, sites: 34 },
  'Downtown - Midtown': { courts: 77, sites: 17 },
  'North Scarborough': { courts: 84, sites: 24 },
  'East York and South Scarborough': { courts: 70, sites: 19 },
};

export const totalCourtsIn = (zone: string): number => ZONE_COURT_COUNTS[zone as ZoneName]?.courts ?? 0;
