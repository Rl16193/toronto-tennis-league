export const ZONE_NAMES = [
  'York West',
  'Etobicoke',
  'Etobicoke - Lakeshore',
  'North York',
  'Downtown - Midtown',
  'North Scarborough',
  'East York and South Scarborough',
] as const;

export type ZoneName = typeof ZONE_NAMES[number];

export function getZone(lat: number, lng: number): ZoneName {
  if (lng < -79.435) {
    if (lat > 43.722) return 'York West';
    if (lat > 43.653) return 'Etobicoke';
    return 'Etobicoke - Lakeshore';
  } else if (lng <= -79.345) {
    return lat > 43.710 ? 'North York' : 'Downtown - Midtown';
  } else {
    return lat > 43.755 ? 'North Scarborough' : 'East York and South Scarborough';
  }
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MARGIN_KM = 2.0;

export function getZoneWithBorderCheck(
  lat: number,
  lng: number,
): { primary: ZoneName; adjacent: ZoneName | null } {
  const primary = getZone(lat, lng);

  // Vertical boundary at lon = -79.435
  if (haversineKm(lat, lng, lat, -79.435) <= MARGIN_KM) {
    const other = getZone(lat, lng < -79.435 ? lng + 0.01 : lng - 0.01);
    if (other !== primary) return { primary, adjacent: other };
  }

  // Vertical boundary at lon = -79.345
  if (haversineKm(lat, lng, lat, -79.345) <= MARGIN_KM) {
    const other = getZone(lat, lng <= -79.345 ? lng + 0.01 : lng - 0.01);
    if (other !== primary) return { primary, adjacent: other };
  }

  // Horizontal boundaries — west column only (lon < -79.435)
  if (lng < -79.435) {
    for (const bl of [43.722, 43.653] as const) {
      if (haversineKm(lat, lng, bl, lng) <= MARGIN_KM) {
        const other = getZone(lat > bl ? bl - 0.005 : bl + 0.005, lng);
        if (other !== primary) return { primary, adjacent: other };
      }
    }
  }

  // Horizontal boundary — central column (lon -79.435 to -79.345)
  if (lng >= -79.435 && lng <= -79.345) {
    if (haversineKm(lat, lng, 43.710, lng) <= MARGIN_KM) {
      const other = getZone(lat > 43.710 ? 43.705 : 43.715, lng);
      if (other !== primary) return { primary, adjacent: other };
    }
  }

  // Horizontal boundary — east column (lon > -79.345)
  if (lng > -79.345) {
    if (haversineKm(lat, lng, 43.755, lng) <= MARGIN_KM) {
      const other = getZone(lat > 43.755 ? 43.750 : 43.760, lng);
      if (other !== primary) return { primary, adjacent: other };
    }
  }

  return { primary, adjacent: null };
}
