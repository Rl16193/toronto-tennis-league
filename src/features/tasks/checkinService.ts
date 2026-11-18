import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { haversineKm } from '../../utils/zones';
import { courtKey } from '../../utils/courtKey';
import { loadCourtList } from './courtList';
import type { CsvCourt } from '../../pages/courtmap/courtMapUtils';

// Court check-in ("passport"): the player must be physically near a court to stamp it. Location
// is only ever requested when this flow is actively used (never on page load).

export const CHECKIN_RADIUS_M = 400; // accepted as "here"
export const CHECKIN_NEARBY_M = 500; // shown as "nearby, but too far to check in"

export type NearbyCourt = CsvCourt & { distM: number };

// Toronto-local calendar day (YYYYMMDD) — the boundary the Matchday bonus counts against, and
// the dedup key so a player's repeat check-ins at one court on one day count once.
export function torontoDayKey(d: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

// What the player is at the court for — the visit's sub_category.
export const VISIT_TYPES = ['Practice', 'Rallies', 'Tournament', 'Other'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];
const VISIT_SUB: Record<VisitType, 'practice' | 'rally' | 'tournament' | 'other'> = {
  Practice: 'practice', Rallies: 'rally', Tournament: 'tournament', Other: 'other',
};

/**
 * A check-in: ONE visit per player per court per Toronto day, id `{uid}_{courtKey}_{YYYYMMDD}`, so
 * a repeat check-in the same day overwrites. Any visit to a court is "visited this court"; the
 * courtsVisited counter and zone tier are the server's (onCourtVisitAwardPoints). The rules require
 * the id pattern, dist_m ≤ 400 and a Timestamp created_at. Report fields carry typed empties.
 */
export async function checkIn(
  uid: string,
  name: string,
  court: CsvCourt,
  coords: { lat: number; lng: number; distM: number },
  visitType: VisitType,
): Promise<void> {
  const key = courtKey(court.dropdown);
  const now = Timestamp.now();
  await setDoc(doc(db, 'courts', `${uid}_${key}_${torontoDayKey()}`), {
    category: 'visit',
    sub_category: VISIT_SUB[visitType],
    uid,
    user_name: name,
    court_key: key,
    court_name: court.dropdown,
    zone: court.zone || '',
    created_at: now,
    updated_at: now,
    lat: coords.lat,
    lng: coords.lng,
    dist_m: Math.round(coords.distM),
    note: '',
    photo_paths: [],
    photos_meta: [],
    waiting_boards: 0,
    racquets_in_queue: 0,
    queue_time: '',
  });
}

// Most-checked-in courts over the last 30 days, from site_stats/court_counts (aggregateCourtCounts).
// Members can't read each other's visits, so this never queries `courts`.
export type TopCheckIn = { court: string; zone: string; count: number };
export async function getTopCheckIns(max = 5): Promise<TopCheckIn[]> {
  const [snap, list] = await Promise.all([getDoc(doc(db, 'site_stats', 'court_counts')), loadCourtList()]);
  const byKey = (snap.data()?.activity?.d30?.byKey ?? {}) as Record<string, { checkins?: number }>;
  const counts = new Map<string, TopCheckIn>();
  for (const c of list) {
    const n = byKey[courtKey(c.dropdown)]?.checkins ?? 0;
    if (n > 0 && !counts.has(c.dropdown)) counts.set(c.dropdown, { court: c.dropdown, zone: c.zone || '', count: n });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, max);
}

// One geolocation prompt, wrapped as a promise. Rejects with a friendly message on denial/error.
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Your browser doesn’t support location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error('Location permission was denied.'));
        else reject(new Error('Could not get your location. Please try again.'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

// Courts within CHECKIN_NEARBY_M, nearest first.
export async function findNearbyCourts(lat: number, lng: number): Promise<NearbyCourt[]> {
  const courts = await loadCourtList();
  return courts
    .map((c) => ({ ...c, distM: haversineKm(lat, lng, c.lat, c.lng) * 1000 }))
    .filter((c) => c.distM <= CHECKIN_NEARBY_M)
    .sort((a, b) => a.distM - b.distM);
}
