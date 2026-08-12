import React, { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import {
  CONDITIONS, Listing, ListingDraft, ListingKind, MAX_LISTING_PHOTOS,
  createListing, emptyDraft, updateListing, useImageUrl,
} from '../../features/marketplace/listingService';

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
      <button type="button" aria-label="Remove photo" onClick={onRemove}
        className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-tennis-dark/80 text-fg hover:text-fg">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
};

// Shared field chrome — compact enough to keep the whole form on one or two phone screens.
const fieldCls =
  'w-full rounded-xl bg-tennis-dark/70 px-3.5 py-2.5 text-sm text-fg ' +
  'placeholder-fg/30 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20';
const labelCls = 'block text-[11px] font-bold uppercase tracking-widest text-fg/70 mb-1.5';

export const ListingForm: React.FC<{ kind: ListingKind; editingListing?: Listing; onClose: () => void }> = ({ kind, editingListing, onClose }) => {
  const { user, profile } = useAuth();
  const [draft, setDraft] = useState<ListingDraft>(() => (editingListing ? draftFromListing(editingListing) : emptyDraft(kind)));
  const [keepPhotoPaths, setKeepPhotoPaths] = useState<string[]>(() => editingListing?.photo_paths ?? []);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const maxNewPhotos = MAX_LISTING_PHOTOS - keepPhotoPaths.length;

  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    set('files', [...draft.files, ...Array.from(list)].slice(0, Math.max(0, maxNewPhotos)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true); setError(''); setProgress(0);
    const msg = editingListing
      ? await updateListing(editingListing.id, user.uid, draft, keepPhotoPaths, setProgress)
      : await createListing(user.uid, profile?.user.name || '', draft, setProgress);
    setSaving(false);
    if (msg) { setError(msg); return; }
    onClose();
  };

  return (
    <Sheet
      onClose={onClose}
      title={editingListing ? 'Edit listing' : (kind === 'rent' ? 'Rent out equipment' : 'Sell equipment')}
      maxWidthClassName="max-w-md"
    >
      <form onSubmit={submit} className="p-5 pt-2 space-y-3.5">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-2.5">{error}</div>
        )}

        <div>
          <label className={labelCls} htmlFor="l-title">Title</label>
          <input id="l-title" value={draft.title} onChange={(e) => set('title', e.target.value)}
            className={fieldCls} placeholder="Wilson Pro Staff 97" />
        </div>

        <div>
          <label className={labelCls} htmlFor="l-desc">Description</label>
          <textarea id="l-desc" value={draft.description} onChange={(e) => set('description', e.target.value)}
            rows={3} className={fieldCls} placeholder="Grip size, age, any wear worth mentioning." />
        </div>

        {/* Photos — optional. Uploads are scanned by the same moderation the court photos use. */}
        <div>
          <label className={labelCls}>Photos <span className="text-fg/70 normal-case tracking-normal font-medium">(up to {MAX_LISTING_PHOTOS})</span></label>
          <div className="flex flex-wrap gap-2">
            {keepPhotoPaths.map((path) => (
              <ExistingPhoto key={path} path={path}
                onRemove={() => setKeepPhotoPaths((paths) => paths.filter((p) => p !== path))} />
            ))}
            {draft.files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-lg bg-fg/[0.06] pl-2.5 pr-1.5 py-1.5 text-[11px] text-fg/70 max-w-[9rem]">
                <span className="truncate">{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`}
                  onClick={() => set('files', draft.files.filter((_, j) => j !== i))}
                  className="shrink-0 text-fg/70 hover:text-fg">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {draft.files.length < maxNewPhotos && (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-fg/20 px-3 py-1.5 text-[11px] font-bold text-fg/70 hover:border-clay/40 hover:text-fg transition-colors">
                <ImagePlus className="w-3.5 h-3.5" />Add photo
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {/* Two-up: both are short values, so pairing them saves a full row on a phone. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="l-cond">Condition</label>
            <select id="l-cond" value={draft.condition}
              onChange={(e) => set('condition', e.target.value as ListingDraft['condition'])}
              className={fieldCls}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="l-price">Price</label>
            <input id="l-price" type="number" inputMode="decimal" min="0" step="1"
              value={draft.price} onChange={(e) => set('price', e.target.value)}
              className={fieldCls} placeholder="40" />
          </div>
        </div>

        {kind === 'rent' && (
          <div>
            <label className={labelCls} htmlFor="l-dur">Rental length</label>
            <input id="l-dur" value={draft.duration} onChange={(e) => set('duration', e.target.value)}
              className={fieldCls} placeholder="2 weeks" />
            <p className="text-[11px] text-fg/70 mt-1">
              Shown as “{draft.price ? `$${draft.price}` : '$40'} for {draft.duration.trim() || '2 weeks'}”.
            </p>
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="l-pickup">Pickup</label>
          <input id="l-pickup" value={draft.pickup} onChange={(e) => set('pickup', e.target.value)}
            className={fieldCls} placeholder="Enter Location" />
        </div>

        {saving && progress > 0 && progress < 100 && (
          <div className="h-1 rounded-full bg-fg/10 overflow-hidden">
            <div className="h-full bg-clay transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="clay" isLoading={saving} className="flex-1">{editingListing ? 'Save' : 'Post'}</Button>
        </div>
      </form>
    </Sheet>
  );
};
