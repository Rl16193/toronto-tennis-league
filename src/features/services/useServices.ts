import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Booking, PINNED_PROVIDERS, Redemption, Reward, ServiceCategory,
} from './types';

export * from './types';

export interface Provider {
  id: string;
  name: string;
  area: string;
  certified?: boolean;
  /** Their member account, when they have one — used for the profile photo beside their name. */
  uid?: string;
  offers: Reward[];
}

/** The offer catalog, active offers only, grouped by category then provider. */
export function useServicesCatalog() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getDocs(query(collection(db, 'tasks'), where('type', '==', 'offer')))
      .then((snap) => {
        setRewards(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Reward, 'id'>) }))
            .filter((r) => r.active !== false)
            .sort((a, b) =>
              a.provider_name.localeCompare(b.provider_name) || (a.sort ?? 0) - (b.sort ?? 0)),
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
        uid: r.uid,
        offers: [r],
      });
      cats.set(category, list);
    });
    // Pinned providers first, in PINNED_PROVIDERS order; everyone else keeps catalog order.
    // Array.sort is stable, so equal ranks don't reshuffle. A distance search in ServicesElements
    // re-sorts on top of this and drops the pins entirely.
    const rank = (id: string) => {
      const at = PINNED_PROVIDERS.indexOf(id);
      return at === -1 ? PINNED_PROVIDERS.length : at;
    };
    cats.forEach((list) => list.sort((a, b) => rank(a.id) - rank(b.id)));
    return cats;
  }, [rewards]);

  return { rewards, byCategory, loading, reload: () => setReloadKey((k) => k + 1) };
}

/**
 * Provider profile photos, keyed by uid. One `users/{uid}` read per linked provider (a handful,
 * publicly readable), cached for the session so switching Marketplace tabs doesn't re-fetch.
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
 * The signed-in player's offers balance. earned = league + RS points; spent comes from
 * offers/{uid}, written only by Cloud Functions. Redeeming moves `spent` and nothing else, so the
 * earning counters and every leaderboard on them are untouched.
 * Mirrors readBalance() in functions/rewards.js — change one, change both. Takes the caller's
 * useTasks() result so a page that already shows task progress doesn't subscribe to it twice.
 */
export function useRedeemablePoints({ points: rsPoints, progressLoaded }: { points: number; progressLoaded: boolean }) {
  const { user, profile } = useAuth();
  const [spent, setSpent] = useState(0);
  const [spentLoaded, setSpentLoaded] = useState(false);

  useEffect(() => {
    if (!user) { setSpent(0); setSpentLoaded(true); return; }
    return onSnapshot(
      doc(db, 'offers', user.uid),
      (snap) => {
        const v = snap.exists() ? snap.data().pointsSpent : 0;
        setSpent(typeof v === 'number' ? v : 0);
        setSpentLoaded(true);
      },
      () => setSpentLoaded(true),
    );
  }, [user?.uid]);

  // Logged out: a flat zero balance, resolved immediately. useTasks() never flips
  // progressLoaded without a user, so deriving `loading` from it would leave signed-out
  // visitors on a permanent placeholder instead of showing them 0.
  if (!user) {
    return { earned: 0, leaguePoints: 0, rsPoints: 0, spent: 0, balance: 0, loading: false };
  }

  const leaguePoints = profile?.stats?.leaguePoints26 ?? 0;
  const earned = Math.max(0, Math.round(leaguePoints + rsPoints));
  return {
    earned,
    leaguePoints,
    rsPoints,
    spent,
    balance: earned - spent,
    loading: !progressLoaded || !spentLoaded,
  };
}

// Newest first, sorted here: an orderBy beside the equality filter would need a composite index.
const newestFirst = (a: Booking, b: Booking) => (b.created_at || '').localeCompare(a.created_at || '');

/** The signed-in member's bookings, live. */
export function useMyBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setBookings([]); setLoading(false); return; }
    return onSnapshot(
      query(collection(db, 'bookings'), where('uid', '==', user.uid)),
      (snap) => {
        setBookings(snap.docs.map((d) => d.data() as Booking).sort(newestFirst));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user?.uid]);

  return { bookings, loading };
}

/**
 * The provider id this account owns, if any. A stringer or coach is an ordinary account with
 * `stringer`/`coach` true and the matching id on preferences — same shape as `event_creator`.
 */
export function useProviderRole() {
  const { profile } = useAuth();
  const prefs = profile?.preferences as
    | { stringer?: boolean; stringer_id?: string; coach?: boolean; coach_id?: string }
    | undefined;
  if (prefs?.stringer === true && prefs.stringer_id) {
    return { providerId: prefs.stringer_id, role: 'stringer' as const };
  }
  if (prefs?.coach === true && prefs.coach_id) {
    return { providerId: prefs.coach_id, role: 'coach' as const };
  }
  return { providerId: null, role: null };
}

/** Bookings for a provider's own offers, live. */
export function useProviderBookings(providerId: string | null) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!providerId) { setBookings([]); setLoading(false); return; }
    return onSnapshot(
      query(collection(db, 'bookings'), where('provider_id', '==', providerId)),
      (snap) => {
        setBookings(snap.docs.map((d) => d.data() as Booking).sort(newestFirst));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [providerId]);

  return { bookings, loading };
}

/** A provider's own catalog offers, inactive ones included, read once. */
export function useProviderOffers(providerId: string | null) {
  const [offers, setOffers] = useState<Reward[]>([]);

  useEffect(() => {
    if (!providerId) { setOffers([]); return; }
    let alive = true;
    getDocs(query(collection(db, 'tasks'), where('provider_id', '==', providerId)))
      .then((snap) => {
        if (!alive) return;
        setOffers(
          snap.docs
            .filter((d) => d.data().type === 'offer')
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Reward, 'id'>) }))
            .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
        );
      })
      .catch(() => { /* the service rail just stays empty */ });
    return () => { alive = false; };
  }, [providerId]);

  return offers;
}

/** Redemptions needing an organizer decision — flagged by a provider or cancel-requested. */
export function usePendingRedemptionReviews(enabled: boolean) {
  const [items, setItems] = useState<Redemption[]>([]);

  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    return onSnapshot(
      query(collection(db, 'redemptions'), where('status', 'in', ['flagged', 'cancel_requested'])),
      (snap) => setItems(snap.docs.map((d) => d.data() as Redemption)),
      () => setItems([]),
    );
  }, [enabled]);

  return items;
}
