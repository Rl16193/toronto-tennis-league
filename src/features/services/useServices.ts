import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../tasks/useTasks';
import { normalizeProvider } from '../../lib/firestoreNormalization';
import { ProviderRecord, Redemption, Reward, ServiceCategory } from './types';

export * from './types';

export interface Provider {
  id: string;
  name: string;
  area: string;
  phone?: string;
  email?: string;
  certified?: boolean;
  /** Their member account, when they have one — used for the profile photo beside their name. */
  uid?: string;
  offers: Reward[];
  roles?: ProviderRecord['roles'];
}

/** The services catalog, active entries only, grouped by category then provider. */
export function useServicesCatalog() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'services'), where('active', '==', true))).catch(() => null),
      getDocs(query(collection(db, 'tasks'), where('type', '==', 'offer'))).catch(() => null),
      getDocs(collection(db, 'providers')).catch(() => null),
    ])
      .then(([serviceSnap, legacySnap, providerSnap]) => {
        const providerMap = new Map<string, ProviderRecord>();
        providerSnap?.docs.forEach((d) => {
          const provider = normalizeProvider(d.id, d.data());
          if (provider) providerMap.set(d.id, provider);
        });
        const docs = serviceSnap?.docs.length ? serviceSnap.docs : legacySnap?.docs || [];
        setRewards(
          docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Reward, 'id'>) }))
            .filter((r) => r.active !== false)
            .map((r) => {
              const provider = providerMap.get(r.provider_id);
              return provider
                ? {
                    ...r,
                    provider_name: provider.name || r.provider_name,
                    area: provider.area || r.area,
                    uid: provider.member_uid || r.uid,
                  }
                : r;
            })
            .sort((a, b) => a.provider_name.localeCompare(b.provider_name) || (a.sort ?? 0) - (b.sort ?? 0)),
        );
      })
      .catch(() => {
        /* catalog unreadable — the page shows its empty state */
      })
      .finally(() => setLoading(false));
  }, [reloadKey]);

  // category → providers → offers. One Contact button per provider, so the phone number isn't
  // repeated on every offer row.
  const byCategory = useMemo(() => {
    const cats = new Map<ServiceCategory, Provider[]>();
    rewards.forEach((r) => {
      const category = r.category ?? 'stringing';
      const list = cats.get(category) ?? [];
      const existing = list.find((p) => p.id === r.provider_id);
      if (existing) {
        existing.offers.push(r);
        return;
      }
      list.push({
        id: r.provider_id,
        name: r.provider_name,
        area: r.area,
        phone: r.contact_phone,
        email: r.contact_email,
        certified: r.certified,
        uid: r.uid,
        offers: [r],
      });
      cats.set(category, list);
    });
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
  const [avatars, setAvatars] = useState<Record<string, string>>(() => Object.fromEntries(avatarCache));

  useEffect(() => {
    const missing = (key ? key.split(',') : []).filter((u) => !avatarCache.has(u));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((u) => getDoc(doc(db, 'users', u)).then((s) => [u, s.data()?.avatar as string | undefined] as const)),
    )
      .then((entries) => {
        entries.forEach(([u, url]) => {
          if (url) avatarCache.set(u, url);
        });
        if (!cancelled) setAvatars(Object.fromEntries(avatarCache));
      })
      .catch(() => {
        /* no photo — the row falls back to an initial */
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return avatars;
}

/**
 * The signed-in player's offers balance. earned = league + RS points; spent comes from
 * offers/{uid}, written only by Cloud Functions. Redeeming moves `spent` and nothing else, so the
 * earning counters and every leaderboard on them are untouched.
 * Mirrors readBalance() in functions/rewards.js — change one, change both.
 */
export function useRedeemablePoints() {
  const { user, profile } = useAuth();
  const { points: rsPoints, progressLoaded } = useTasks();
  const [spent, setSpent] = useState(0);
  const [spentLoaded, setSpentLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setSpent(0);
      setSpentLoaded(true);
      return;
    }
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

/** The signed-in player's own coupons, newest first. */
export function useMyRedemptions() {
  const { user } = useAuth();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRedemptions([]);
      setLoading(false);
      return;
    }
    return onSnapshot(
      query(collection(db, 'redemptions'), where('uid', '==', user.uid)),
      (snap) => {
        setRedemptions(
          snap.docs
            .map((d) => d.data() as Redemption)
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user?.uid]);

  return { redemptions, loading };
}

/**
 * The provider id this account owns, if any. Provider rows are authoritative; the preferences
 * lookup is a read-only compatibility fallback for accounts not yet bootstrapped.
 */
export function useProviderRole() {
  const { user, profile } = useAuth();
  const [provider, setProvider] = useState<ProviderRecord | null>(null);

  useEffect(() => {
    if (!user) {
      setProvider(null);
      return;
    }
    return onSnapshot(
      query(collection(db, 'providers'), where('member_uid', '==', user.uid)),
      (snap) => {
        const record = snap.docs.map((d) => normalizeProvider(d.id, d.data())).find(Boolean) || null;
        setProvider(record);
      },
      () => setProvider(null),
    );
  }, [user?.uid]);

  // Keep the legacy projection as a read-only compatibility fallback while providers is rolled
  // out. It cannot grant write access because Rules and Functions consult providers first.
  if (!provider) {
    const prefs = profile?.preferences as
      { stringer?: boolean; stringer_id?: string; coach?: boolean; coach_id?: string } | undefined;
    if (prefs?.stringer === true && prefs.stringer_id)
      return { providerId: prefs.stringer_id, role: 'stringer' as const };
    if (prefs?.coach === true && prefs.coach_id) return { providerId: prefs.coach_id, role: 'coach' as const };
  }
  const role =
    provider?.roles.find(
      (candidate): candidate is 'stringer' | 'coach' => candidate === 'stringer' || candidate === 'coach',
    ) || null;
  return { providerId: provider?.id || null, role };
}

/** Coupons issued against the signed-in provider's own offers. */
export function useProviderRedemptions() {
  const { providerId, role } = useProviderRole();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!providerId) {
      setRedemptions([]);
      setLoading(false);
      return;
    }
    // Sorted client-side rather than with orderBy: pairing orderBy with the id filter would
    // need a composite index, and this project ships no firestore.indexes.json.
    return onSnapshot(
      query(collection(db, 'redemptions'), where('stringer_id', '==', providerId)),
      (snap) => {
        setRedemptions(
          snap.docs
            .map((d) => d.data() as Redemption)
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [providerId]);

  return { providerId, role, redemptions, loading };
}

/** Redemptions needing an organizer decision — flagged by a provider or cancel-requested. */
export function usePendingRedemptionReviews(enabled: boolean) {
  const [items, setItems] = useState<Redemption[]>([]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'redemptions'), where('status', 'in', ['flagged', 'cancel_requested'])),
      (snap) => setItems(snap.docs.map((d) => d.data() as Redemption)),
      () => setItems([]),
    );
  }, [enabled]);

  return items;
}
