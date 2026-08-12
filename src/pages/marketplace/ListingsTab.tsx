import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { MapPin, Package, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/Button';
import { ContactOpponentButton } from '../tournament/ContactOpponentButton';
import { fadeUp, staggerDelay } from '../../lib/motion';
import {
  Listing, ListingKind, STATUS_LABEL, deleteListing, formatListingPrice,
  setListingStatus, useImageUrl,
} from '../../features/marketplace/listingService';
import { ContactData } from '../../types';

const ListingPhoto: React.FC<{ path?: string; alt: string }> = ({ path, alt }) => {
  const url = useImageUrl(path);
  return (
    <div className="w-20 h-20 shrink-0 rounded-xl bg-fg/[0.06] overflow-hidden flex items-center justify-center">
      {url
        ? <img src={url} alt={alt} className="w-full h-full object-cover" />
        : <Package className="w-6 h-6 text-fg/70" />}
    </div>
  );
};

const ListingCard: React.FC<{
  listing: Listing;
  seller?: ContactData;
  isMine: boolean;
  signedIn: boolean;
  onEdit: () => void;
}> = ({ listing, seller, isMine, signedIn, onEdit }) => {
  const [busy, setBusy] = useState(false);
  const gone = listing.status !== 'available';
  const goneLabel = listing.kind === 'rent' ? 'rented' : 'sold';

  const mark = async (status: Listing['status']) => {
    setBusy(true);
    try { await setListingStatus(listing.id, status); } finally { setBusy(false); }
  };

  return (
    <div className={`rounded-2xl bg-tennis-surface/30 p-4 ${gone ? 'opacity-55' : ''}`}>
      <div className="flex gap-3">
        <ListingPhoto path={listing.photo_paths?.[0]} alt={listing.title} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-fg leading-snug">{listing.title}</p>
            <span className="shrink-0 text-base font-black text-fg whitespace-nowrap">
              {formatListingPrice(listing)}
            </span>
          </div>
          <p className="text-[11px] text-fg/70 mt-0.5">
            {listing.condition} · {listing.user_name || 'Member'}
            {gone && <span className="ml-1.5 text-clay font-bold">{STATUS_LABEL[listing.status]}</span>}
          </p>
          <p className="text-xs text-fg/70 mt-1.5 leading-relaxed line-clamp-3">{listing.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-fg/5">
        <span className="inline-flex items-center gap-1 min-w-0 text-[11px] text-fg/70">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{listing.pickup}</span>
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {isMine ? (
            <>
              <button type="button" aria-label="Edit listing" onClick={onEdit}
                className="p-2 rounded-lg bg-fg/5 text-fg/70 hover:text-fg transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <Button size="sm" variant="outline" isLoading={busy}
                onClick={() => mark(gone ? 'available' : (listing.kind === 'rent' ? 'rented' : 'sold'))}>
                {gone ? 'Relist' : `Mark ${goneLabel}`}
              </Button>
              <button type="button" aria-label="Delete listing" disabled={busy}
                onClick={() => { if (confirm('Delete this listing?')) { setBusy(true); deleteListing(listing.id).finally(() => setBusy(false)); } }}
                className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            /* Signed-out visitors can browse the board, but the seller's phone number and
               email stay behind a login. Deleting/editing is the poster's own action only —
               no one else, organizers included, can remove another member's listing. */
            !gone && signedIn && (
              <ContactOpponentButton
                name={listing.user_name || 'Member'}
                phone={seller?.phone}
                email={seller?.email}
                whatsappContact={seller?.whatsapp_contact}
                size="sm"
                variant="white"
              />
            )
          )}
        </div>
      </div>
    </div>
  );
};

// Listings arrive as props rather than being subscribed here: Marketplace already holds a
// listener per board (it needs both to resolve seller contacts), so subscribing again would
// open a second identical listener on the same query every time this tab mounted.
export const ListingsTab: React.FC<{
  kind: ListingKind;
  listings: Listing[];
  loading: boolean;
  sellers: Record<string, ContactData>;
  onEdit: (listing: Listing) => void;
}> = ({ kind, listings, loading, sellers, onEdit }) => {
  const { user } = useAuth();

  if (loading) {
    return <div className="h-32 bg-tennis-surface/30 rounded-3xl animate-pulse" />;
  }

  if (listings.length === 0) {
    return (
      <div className="rounded-3xl bg-tennis-surface/30 py-14 px-6 text-center">
        <Package className="w-7 h-7 text-fg/70 mx-auto mb-3" />
        <p className="text-sm font-bold text-fg">
          {kind === 'rent' ? 'Nothing up for rent yet' : 'Nothing for sale yet'}
        </p>
        {!user && (
          <p className="text-sm text-fg/70 mt-1.5">
            <Link to="/login" className="text-clay font-bold hover:underline">Log in</Link> to post something.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {listings.map((l, i) => (
        <motion.div key={l.id} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}>
          <ListingCard
            listing={l}
            seller={sellers[l.uid]}
            isMine={!!user && l.uid === user.uid}
            signedIn={!!user}
            onEdit={() => onEdit(l)}
          />
        </motion.div>
      ))}
    </div>
  );
};
