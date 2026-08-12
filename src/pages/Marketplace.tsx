import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { SegmentedControl } from '../components/SegmentedControl';
import { Fab } from '../components/Fab';
import { fadeUp } from '../lib/motion';
import { ContactData } from '../types';
import { ServicesTab } from './services/ServicesElements';
import { ListingForm, ListingsTab } from './marketplace/MarketplaceElements';
import { Listing, ListingKind, useListings } from '../features/marketplace/listingService';

// Marketplace hub: Services (curated, admin-seeded) plus two member-posted boards.
type Tab = 'services' | 'rent' | 'trade';

// URL param values are kept as-is; `trade` is the sell board.
const KIND_FOR: Record<'rent' | 'trade', ListingKind> = { rent: 'rent', trade: 'sell' };

/**
 * Contact details for everyone with a listing on screen, so the Contact button can offer the
 * poster's real phone/WhatsApp/email rather than making them retype it per listing. One lazy
 * `users/{id}` read per unique seller, same pattern as the Profile page's opponent lookups.
 */
function useSellers(userIds: string[]) {
  const [sellers, setSellers] = useState<Record<string, ContactData>>({});
  const key = [...new Set(userIds)].sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    const missing = ids.filter((id) => id && !sellers[id]);
    if (missing.length === 0) return;
    // `contacts`, not `users` — and it's sign-in gated, so a logged-out visitor resolves nothing
    // and simply sees no Contact button (which is the intended behaviour anyway).
    Promise.all(missing.map((id) =>
      getDoc(doc(db, 'contacts', id)).then((s) => [id, s.data() as ContactData | undefined] as const)))
      .then((entries) => {
        const found = entries.filter((e): e is [string, ContactData] => !!e[1]);
        if (found.length) setSellers((prev) => ({ ...prev, ...Object.fromEntries(found) }));
      })
      .catch(() => { /* Contact just falls back to hidden if we can't resolve them */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return sellers;
}

export const Marketplace: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(
    initial === 'rent' || initial === 'trade' ? initial : 'services',
  );
  const [formKind, setFormKind] = useState<ListingKind | null>(null);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);

  useEffect(() => { document.title = 'Marketplace · Racquets & Strings'; }, []);

  // Both boards are subscribed here rather than inside ListingsTab — the seller lookup needs to
  // span both, and holding the listeners at this level means switching tabs doesn't tear down
  // and re-open them. ListingsTab receives the rows as props rather than subscribing again.
  //
  // A board only starts listening once it's been opened at least once: Services is the default
  // tab, so opening /marketplace used to fire two `listings` queries nobody had asked for.
  const [openedBoards, setOpenedBoards] = useState<Set<Tab>>(
    () => new Set(initial === 'rent' || initial === 'trade' ? [initial as Tab] : []),
  );
  // A useState initializer only runs on mount, so arriving at /marketplace?tab=rent from a link
  // while this page is ALREADY mounted (Notifications and Tasks both do that) left the board
  // permanently unsubscribed. Keep the tab and the opened set in step with the URL instead.
  useEffect(() => {
    if (tab === 'services') return;
    setOpenedBoards((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab]);
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'rent' || t === 'trade') setTab(t);
  }, [searchParams]);
  const { listings: rentListings, loading: rentLoading } = useListings('rent', openedBoards.has('rent'));
  const { listings: sellListings, loading: sellLoading } = useListings('sell', openedBoards.has('trade'));
  const sellerIds = useMemo(
    () => [...rentListings, ...sellListings].map((l) => l.uid),
    [rentListings, sellListings],
  );
  const sellers = useSellers(sellerIds);
  const board = tab === 'rent'
    ? { listings: rentListings, loading: rentLoading }
    : { listings: sellListings, loading: sellLoading };

  const onChange = (next: Tab) => {
    setTab(next);
    if (next !== 'services') setOpenedBoards((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    setSearchParams(next === 'services' ? {} : { tab: next }, { replace: true });
  };

  const isBoard = tab === 'rent' || tab === 'trade';

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      <h1 className="sr-only">Marketplace</h1>

      <SegmentedControl<Tab>
        options={[
          { value: 'services', label: 'Services' },
          { value: 'rent', label: 'Rent' },
          { value: 'trade', label: 'Buy/Sell' },
        ]}
        value={tab}
        onChange={onChange}
        className="mb-5"
      />

      {tab === 'services' ? (
        <ServicesTab />
      ) : (
        <motion.div key={tab} {...fadeUp}>
          <ListingsTab
            kind={KIND_FOR[tab]}
            listings={board.listings}
            loading={board.loading}
            sellers={sellers}
            onEdit={setEditingListing}
          />
        </motion.div>
      )}

      {/* Post a listing — same floating button as the Events page. Signed-in members only;
          logged-out visitors can browse the boards but see no FAB. */}
      {isBoard && user && (
        <Fab
          ariaLabel={tab === 'rent' ? 'Rent out equipment' : 'Sell equipment'}
          onClick={() => setFormKind(KIND_FOR[tab])}
        >
          <Plus className="w-6 h-6" />
        </Fab>
      )}

      <AnimatePresence>
        {editingListing ? (
          <ListingForm kind={editingListing.kind} editingListing={editingListing} onClose={() => setEditingListing(null)} />
        ) : formKind && <ListingForm kind={formKind} onClose={() => setFormKind(null)} />}
      </AnimatePresence>
    </div>
  );
};
