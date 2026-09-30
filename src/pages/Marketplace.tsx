import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { SegmentedControl } from '../components/SegmentedControl';
import { Fab } from '../components/Fab';
import { fadeUp } from '../lib/motion';
import { useContacts } from '../features/contacts/useContacts';
import { ServicesTab } from './services/ServicesElements';
import { ListingForm, ListingsTab } from './marketplace/MarketplaceElements';
import { Listing, ListingKind, useListings } from '../features/marketplace/listingService';

// Marketplace hub: Services (curated, admin-seeded) plus two member-posted boards.
type Tab = 'services' | 'rent' | 'trade';

// URL param values are kept as-is; `trade` is the sell board.
const KIND_FOR: Record<'rent' | 'trade', ListingKind> = { rent: 'rent', trade: 'sell' };

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
  // The poster's contact details, so Contact offers their real channels. Each read is caught on
  // its own: one member's denied read must not hide every seller's Contact button.
  const sellers = useContacts(sellerIds);
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
