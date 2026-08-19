import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ImagePlus, MapPin, Package, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { ContactOpponentButton } from '../../components/ContactOpponentButton';
import { fadeUp, staggerDelay } from '../../lib/motion';
import {
  CONDITIONS,
  Listing,
  ListingDraft,
  ListingKind,
  MAX_LISTING_PHOTOS,
  STATUS_LABEL,
  createListing,
  deleteListing,
  emptyDraft,
  formatListingPrice,
  setListingStatus,
  updateListing,
  useImageUrl,
} from '../../features/marketplace/listingService';
import { ContactData } from '../../types';

// Marketplace boards and the post/edit form. Firestore access lives in listingService.ts.

// ─── Listing board ────────────────────────────────────────────────────────────────────────────

const ListingPhoto: React.FC<{ path?: string; alt: string }> = ({ path, alt }) => {
  const url = useImageUrl(path);
  return (
    <div className="w-20 h-20 shrink-0 rounded-xl bg-fg/[0.06] overflow-hidden flex items-center justify-center">
      {url ? (
        <img src={url} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <Package className="w-6 h-6 text-fg/70" />
      )}
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
    try {
      await setListingStatus(listing.id, status);
    } finally {
      setBusy(false);
    }
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
              <button
                type="button"
                aria-label="Edit listing"
                onClick={onEdit}
                className="p-2 rounded-lg bg-fg/5 text-fg/70 hover:text-fg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <Button
                size="sm"
                variant="outline"
                isLoading={busy}
                onClick={() => mark(gone ? 'available' : listing.kind === 'rent' ? 'rented' : 'sold')}
              >
                {gone ? 'Relist' : `Mark ${goneLabel}`}
              </Button>
              <button
                type="button"
                aria-label="Delete listing"
                disabled={busy}
                onClick={() => {
                  if (confirm('Delete this listing?')) {
                    setBusy(true);
                    deleteListing(listing.id).finally(() => setBusy(false));
                  }
                }}
                className="p-2 rounded-lg bg-red-500/10 text-badge-loss hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            /* Seller contact stays behind a login. Edit/delete is the poster's action only —
               not even organizers can remove another member's listing. */
            !gone &&
            signedIn && (
              <ContactOpponentButton
                name={listing.user_name || 'Member'}
                phone={seller?.phone}
                email={seller?.email}
                whatsappContact={seller?.whatsapp_contact}
                preferred={seller?.preferred_mode_of_contact}
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

// Listings come in as props — Marketplace already holds a listener per board, so subscribing
// here would open a second identical listener on every mount.
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
            <Link to="/login" className="text-clay font-bold hover:underline">
              Log in
            </Link>{' '}
            to post something.
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

// ─── Post / edit form ─────────────────────────────────────────────────────────────────────────

const draftFromListing = (listing: Listing): ListingDraft => ({
  kind: listing.kind,
  title: listing.title,
  description: listing.description,
  condition: listing.condition,
  price: String(listing.price),
  pickup: listing.pickup,
  duration: listing.duration || '',
  files: [],
});

const ExistingPhoto: React.FC<{ path: string; onRemove: () => void }> = ({ path, onRemove }) => {
  const url = useImageUrl(path);
  return (
    <span className="relative inline-block w-16 h-16 rounded-lg overflow-hidden bg-fg/[0.06]">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      <button
        type="button"
        aria-label="Remove photo"
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-tennis-dark/80 text-fg hover:text-fg"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
};

// Shared field chrome, sized to keep the form within one or two phone screens.
const fieldCls =
  'w-full rounded-xl bg-tennis-dark/70 px-3.5 py-2.5 text-sm text-fg ' +
  'placeholder-fg/30 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20';
const labelCls = 'block text-[11px] font-bold uppercase tracking-widest text-fg/70 mb-1.5';

export const ListingForm: React.FC<{ kind: ListingKind; editingListing?: Listing; onClose: () => void }> = ({
  kind,
  editingListing,
  onClose,
}) => {
  const { user, profile } = useAuth();
  const [draft, setDraft] = useState<ListingDraft>(() =>
    editingListing ? draftFromListing(editingListing) : emptyDraft(kind),
  );
  const [keepPhotoPaths, setKeepPhotoPaths] = useState<string[]>(() => editingListing?.photo_paths ?? []);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const maxNewPhotos = MAX_LISTING_PHOTOS - keepPhotoPaths.length;

  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    set('files', [...draft.files, ...Array.from(list)].slice(0, Math.max(0, maxNewPhotos)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    setProgress(0);
    const msg = editingListing
      ? await updateListing(editingListing.id, user.uid, draft, keepPhotoPaths, setProgress)
      : await createListing(user.uid, profile?.user.name || '', draft, setProgress);
    setSaving(false);
    if (msg) {
      setError(msg);
      return;
    }
    onClose();
  };

  return (
    <Sheet
      onClose={onClose}
      title={editingListing ? 'Edit listing' : kind === 'rent' ? 'Rent out equipment' : 'Sell equipment'}
      maxWidthClassName="max-w-md"
    >
      <form onSubmit={submit} className="p-5 pt-2 space-y-3.5">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-badge-loss text-sm px-4 py-2.5">
            {error}
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="l-title">
            Title
          </label>
          <input
            id="l-title"
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            className={fieldCls}
            placeholder="Wilson Pro Staff 97"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="l-desc">
            Description
          </label>
          <textarea
            id="l-desc"
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className={fieldCls}
            placeholder="Grip size, age, any wear worth mentioning."
          />
        </div>

        {/* Optional. Uploads go through the same moderation as court photos. */}
        <div>
          <label className={labelCls}>
            Photos{' '}
            <span className="text-fg/70 normal-case tracking-normal font-medium">(up to {MAX_LISTING_PHOTOS})</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {keepPhotoPaths.map((path) => (
              <ExistingPhoto
                key={path}
                path={path}
                onRemove={() => setKeepPhotoPaths((paths) => paths.filter((p) => p !== path))}
              />
            ))}
            {draft.files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-fg/[0.06] pl-2.5 pr-1.5 py-1.5 text-[11px] text-fg/70 max-w-[9rem]"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() =>
                    set(
                      'files',
                      draft.files.filter((_, j) => j !== i),
                    )
                  }
                  className="shrink-0 text-fg/70 hover:text-fg"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {draft.files.length < maxNewPhotos && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-fg/20 px-3 py-1.5 text-[11px] font-bold text-fg/70 hover:border-clay/40 hover:text-fg transition-colors"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Add photo
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Paired two-up — both are short values, saving a row on a phone. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="l-cond">
              Condition
            </label>
            <select
              id="l-cond"
              value={draft.condition}
              onChange={(e) => set('condition', e.target.value as ListingDraft['condition'])}
              className={fieldCls}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="l-price">
              Price
            </label>
            <input
              id="l-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={draft.price}
              onChange={(e) => set('price', e.target.value)}
              className={fieldCls}
              placeholder="40"
            />
          </div>
        </div>

        {kind === 'rent' && (
          <div>
            <label className={labelCls} htmlFor="l-dur">
              Rental length
            </label>
            <input
              id="l-dur"
              value={draft.duration}
              onChange={(e) => set('duration', e.target.value)}
              className={fieldCls}
              placeholder="2 weeks"
            />
            <p className="text-[11px] text-fg/70 mt-1">
              Shown as “{draft.price ? `$${draft.price}` : '$40'} for {draft.duration.trim() || '2 weeks'}”.
            </p>
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="l-pickup">
            Pickup
          </label>
          <input
            id="l-pickup"
            value={draft.pickup}
            onChange={(e) => set('pickup', e.target.value)}
            className={fieldCls}
            placeholder="Enter Location"
          />
        </div>

        {saving && progress > 0 && progress < 100 && (
          <div className="h-1 rounded-full bg-fg/10 overflow-hidden">
            <div className="h-full bg-clay transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="clay" isLoading={saving} className="flex-1">
            {editingListing ? 'Save' : 'Post'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
};
