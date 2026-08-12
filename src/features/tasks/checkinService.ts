import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
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

// Shared by logAttendance/checkIn below — both stamp a player's presence at a court, just to
// different id-schemes (deterministic {uid}_{courtKey} vs {uid}_{courtKey}_{day}) with one extra
// field each. `type` discriminates the doc's kind inside the consolidated `courts` collection.
const baseVisitDoc = (uid: string, name: string, court: CsvCourt, coords: { lat: number; lng: number; distM: number }) => ({
  uid,
  type: 'attendance' as const,
  user_name: name,
  court_key: courtKey(court.dropdown),
  court_name: court.dropdown,
  zone: court.zone,
  lat: coords.lat,
  lng: coords.lng,
  dist_m: Math.round(coords.distM),
  created_at: new Date().toISOString(),
});

// Append-only daily attendance (distinct from the once-forever passport). Deterministic id
// `{uid}_{courtKey}_{day}` so a second check-in the same day at the same court just overwrites —
// Matchday counts distinct players, so one entry per player per court per day is what we want.
export async function logAttendance(
  uid: string,
  name: string,
  court: CsvCourt,
  coords: { lat: number; lng: number; distM: number },
  visitType: VisitType,
): Promise<void> {
  const day = torontoDayKey();
  const id = `${uid}_${courtKey(court.dropdown)}_${day}`;
  await setDoc(doc(db, 'courts', id), {
    ...baseVisitDoc(uid, name, court, coords),
    day,
    match_type: visitType,
  });
}

// What the player is at the court for — captured on check-in so we know the kind of activity.
export const VISIT_TYPES = ['Practice', 'Friendlies', 'Tournament', 'Other'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

// Most-checked-in courts, computed from a bounded window of recent attendance (newest 300 rows).
// Best-effort "what's busy lately" list for the check-in start screen — not an all-time tally.
export type TopCheckIn = { court: string; zone: string; count: number };
export async function getTopCheckIns(max = 5): Promise<TopCheckIn[]> {
  // Newest 300 docs in `courts`, then narrowed to attendance in memory. `courts` now also holds
  // check-ins and photo reports; the single-field `created_at` index keeps this query free of a
  // composite index, and filtering 300 rows in JS is cheap for a best-effort "what's busy" list.
  const snap = await getDocs(query(collection(db, 'courts'), orderBy('created_at', 'desc'), limit(300)));
  const counts = new Map<string, TopCheckIn>();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.type !== 'attendance') return;
    const court = (data.court_name as string) || '';
    if (!court) return;
    const cur = counts.get(court) ?? { court, zone: (data.zone as string) || '', count: 0 };
    cur.count += 1;
    counts.set(court, cur);
  });
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

// Has this player already checked in at this court?
export async function hasCheckedIn(uid: string, court: CsvCourt): Promise<boolean> {
  const snap = await getDoc(doc(db, 'courts', `${uid}_${courtKey(court.dropdown)}`));
  return snap.exists();
}

// Stamp the passport. Deterministic doc id (uid_courtKey) — firestore.rules deny overwriting an
// existing check-in, so this can only ever count once per player per court.
export async function checkIn(
  uid: string,
  name: string,
  court: CsvCourt,
  coords: { lat: number; lng: number; distM: number },
  visitType: VisitType,
): Promise<void> {
  const id = `${uid}_${courtKey(court.dropdown)}`;
  await setDoc(doc(db, 'courts', id), {
    ...baseVisitDoc(uid, name, court, coords),
    type: 'check-in',
    visit_type: visitType,
  });
}

// "Visit every court in your zone" is now decided server-side in functions/taskPoints.js
// (awardZoneCompleteIfDone), triggered by the courts check-in write above. It used to be computed
// here and written straight to task_progress, but that field carries points and the rules
// allowlist rejects owner writes to it, so the award never actually landed.
