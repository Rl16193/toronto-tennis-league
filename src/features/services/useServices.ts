import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { toMillis } from '../../utils/eventDates';
import { isProviderProfile } from '../../utils/eventTypes';
import {
  Booking, BookingRow, PINNED_PROVIDERS, Reward, ServiceCategory,
} from './types';

export * from './types';

export interface Provider {
  /** The provider's uid — also their member account, for the profile photo beside their name. */
  id: string;
  name: string;
  area: string;
  certified?: boolean;
  offers: Reward[];
}

const asReward = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as Omit<Reward, 'id'>) });

/** The offer catalog, active offers only, grouped by category then provider. */
export function useServicesCatalog() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getDocs(query(collection(db, 'services'), where('active', '==', true)))
      .then((snap) => {
        setRewards(
          snap.docs
            .map(asReward)
            .sort((a, b) =>
              a.provider_name.localeCompare(b.provider_name) || toMillis(a.created_at) - toMillis(b.created_at)),
        );
      })
      .catch(() => { /* catalog unreadable — the page shows its empty state */ })
      .finally(() => setLoading(false));
  }, [reloadKey]);

  // category → providers → offers. One Contact button per provider, so contacts aren't repeated
  // on every offer row. The details themselves come from `contacts/{uid}`, never from the offer.
  const byCategory = useMemo(() => {
    const cats = new Map<ServiceCategory, Provider[]>();
    rewards.forEach((r) => {
      const category = r.category ?? 'stringing';
      const list = cats.get(category) ?? [];
      const existing = list.find((p) => p.id === r.provider_id);
      if (existing) { existing.offers.push(r); return; }
      list.push({
        id: r.provider_id,
        name: r.provider_name,
        area: r.area,
        certified: r.certified,
        offers: [r],
      });
      cats.set(category, list);
    });
    // Pinned providers first, in PINNED_PROVIDERS order; everyone else keeps catalog order.
    // Array.sort is stable, so equal ranks don't reshuffle. A distance search in ServicesElements
    // re-sorts on top of this and drops the pins entirely.
    const rank = (p: Provider) => {
      const at = PINNED_PROVIDERS.findIndex((pin) => p.offers.some((o) => o.id.startsWith(`${pin}-`)));
      return at === -1 ? PINNED_PROVIDERS.length : at;
    };
    cats.forEach((list) => list.sort((a, b) => rank(a) - rank(b)));
    return cats;
  }, [rewards]);

  return { rewards, byCategory, loading, reload: () => setReloadKey((k) => k + 1) };
}

/**
 * Provider profile photos, keyed by uid. One `users/{uid}` read per provider (a handful, publicly
 * readable), cached for the session so switching Marketplace tabs doesn't re-fetch.
 */
const avatarCache = new Map<string, string>();

export function useProviderAvatars(uids: (string | undefined)[]): Record<string, string> {
  const key = [...new Set(uids.filter((u): u is string => !!u))].sort().join(',');
  const [avatars, setAvatars] = useState<Record<string, string>>(
    () => Object.fromEntries(avatarCache),
  );

  useEffect(() => {
    const missing = (key ? key.split(',') : []).filter((u) => !avatarCache.has(u));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((u) => getDoc(doc(db, 'users', u)).then((s) => [u, s.data()?.avatar as string | undefined] as const)))
      .then((entries) => {
        entries.forEach(([u, url]) => { if (url) avatarCache.set(u, url); });
        if (!cancelled) setAvatars(Object.fromEntries(avatarCache));
      })
      .catch(() => { /* no photo — the row falls back to an initial */ });
    return () => { cancelled = true; };
  }, [key]);

  return avatars;
}

/**
 * The signed-in player's redeemable balance: lifetime league points + RS points − points spent.
 * Lifetime league = Σ league_seasons.season_points + leaguePoints − leaguePointsPrev × 0.5 (the half
 * carried into this season is spendable once). pointsSpent is on stats, written only by the server.
 * Mirrors readBalance() in functions/rewards.js — change one, change both. Takes the caller's
 * useTasks() result so a page that already reads stats/{uid} doesn't subscribe to it twice.
 */
export function useRedeemablePoints({ points: rsPoints, progressLoaded, stats }: {
  points: number;
  progressLoaded: boolean;
  stats?: { leaguePoints?: number; leaguePointsPrev?: number; pointsSpent?: number } | null;
}) {
  const { user, profile } = useAuth();
  const [pastSeasons, setPastSeasons] = useState(0);
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);

  useEffect(() => {
    if (!user) { setPastSeasons(0); setSeasonsLoaded(true); return; }
    let alive = true;
    setSeasonsLoaded(false);
    getDocs(query(collection(db, 'league_seasons'), where('uid', '==', user.uid)))
      .then((snap) => {
        if (!alive) return;
        setPastSeasons(snap.docs.reduce((n, d) => n + (typeof d.data().season_points === 'number' ? d.data().season_points : 0), 0));
      })
      .catch(() => { if (alive) setPastSeasons(0); })
      .finally(() => { if (alive) setSeasonsLoaded(true); });
    return () => { alive = false; };
  }, [user?.uid]);

  // Logged out: a flat zero balance, resolved immediately. useTasks() never flips
  // progressLoaded without a user, so deriving `loading` from it would leave signed-out
  // visitors on a permanent placeholder instead of showing them 0.
  if (!user) {
    return { earned: 0, leaguePoints: 0, rsPoints: 0, spent: 0, balance: 0, loading: false };
  }

  // The live stats doc when the caller has it (it moves on every redeem); the profile copy otherwise.
  const s = stats ?? profile?.stats;
  const leaguePoints = pastSeasons + (s?.leaguePoints ?? 0) - (s?.leaguePointsPrev ?? 0) * 0.5;
  const spent = s?.pointsSpent ?? 0;
  const earned = Math.max(0, Math.round(leaguePoints + rsPoints));
  return {
    earned,
    leaguePoints,
    rsPoints,
    spent,
    balance: earned - spent,
    loading: !progressLoaded || !seasonsLoaded,
  };
}

// ─── Booking labels ─────────────────────────────────────────────────────────────────────────

// A booking stores only service_id: the offer title and provider name are read from the service,
// once per service for the session.
const serviceCache = new Map<string, Reward | null>();

/** Loads any service not yet cached; returns a version that changes when the cache grows. */
function useServiceLookup(serviceIds: string[]): number {
  const key = [...new Set(serviceIds.filter(Boolean))].sort().join(',');
  const [version, bump] = useState(0);
  useEffect(() => {
    const missing = (key ? key.split(',') : []).filter((id) => !serviceCache.has(id));
    if (missing.length === 0) return;
    let alive = true;
    Promise.all(missing.map((id) => getDoc(doc(db, 'services', id))
      .then((s) => serviceCache.set(id, s.exists() ? asReward(s) : null))
      .catch(() => serviceCache.set(id, null))))
      .then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [key]);
  return version;
}

/** Bookings with their offer title and provider name. */
function useBookingRows(bookings: Booking[]): BookingRow[] {
  const version = useServiceLookup(bookings.map((b) => b.service_id));
  return useMemo(() => bookings.map((b) => {
    const s = serviceCache.get(b.service_id);
    return { ...b, offer: s?.offer || 'Booking', providerName: s?.provider_name || 'the provider' };
  }), [bookings, version]);
}

// Newest first, sorted here: an orderBy beside the equality filter would need a composite index.
const newestFirst = (a: Booking, b: Booking) => toMillis(b.created_at) - toMillis(a.created_at);
const asBooking = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as Omit<Booking, 'id'>) });

/** Live bookings matching one equality filter, newest first, labelled. */
function useBookingsWhere(field: 'uid' | 'provider_id' | null, value: string | null | undefined) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!field || !value) { setBookings([]); setLoading(false); return; }
    return onSnapshot(
      query(collection(db, 'bookings'), where(field, '==', value)),
      (snap) => {
        setBookings(snap.docs.map(asBooking).sort(newestFirst));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [field, value]);

  return { bookings: useBookingRows(bookings), loading };
}

/** The signed-in member's bookings, live. */
export function useMyBookings() {
  const { user } = useAuth();
  return useBookingsWhere('uid', user?.uid);
}

/** The signed-in provider's id (their uid) and role, or nulls for everyone else. */
export function useProviderRole() {
  const { profile } = useAuth();
  if (!profile || !isProviderProfile(profile)) return { providerId: null, role: null };
  return { providerId: profile.id, role: profile.roles.includes('stringer') ? 'stringer' as const : 'coach' as const };
}

/** Bookings for a provider's own offers, live. */
export function useProviderBookings(providerId: string | null) {
  return useBookingsWhere(providerId ? 'provider_id' : null, providerId);
}

/** A provider's own catalog offers, inactive ones included, read once. */
export function useProviderOffers(providerId: string | null) {
  const [offers, setOffers] = useState<Reward[]>([]);

  useEffect(() => {
    if (!providerId) { setOffers([]); return; }
    let alive = true;
    getDocs(query(collection(db, 'services'), where('provider_id', '==', providerId)))
      .then((snap) => {
        if (!alive) return;
        setOffers(snap.docs.map(asReward).sort((a, b) => toMillis(a.created_at) - toMillis(b.created_at)));
      })
      .catch(() => { /* the service rail just stays empty */ });
    return () => { alive = false; };
  }, [providerId]);

  return offers;
}

/** Cancelled bookings paid by points, waiting on an organizer's refund decision. */
export function usePendingRefunds(enabled: boolean) {
  const [items, setItems] = useState<Booking[]>([]);

  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    return onSnapshot(
      query(collection(db, 'bookings'), where('status', '==', 'cancelled'), where('refund', '==', 'pending')),
      (snap) => setItems(snap.docs.map(asBooking).sort(newestFirst)),
      () => setItems([]),
    );
  }, [enabled]);

  return useBookingRows(items);
}
