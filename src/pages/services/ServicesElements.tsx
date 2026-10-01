import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  BadgeCheck, MapPin, Pencil, Plus, Search, Sparkles, Trash2, X,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/Button';
import { field } from '../../components/Input';
import { Fab } from '../../components/Fab';
import { Sheet } from '../../components/Sheet';
import { Tree, TreeGroup } from '../../components/Tree';
import { ContactOpponentButton } from '../../components/ContactOpponentButton';
import { useContacts } from '../../features/contacts/useContacts';
import { fadeUp } from '../../lib/motion';
import {
  BookingRow, CATEGORY_IMAGE, CATEGORY_LABEL, GROUP_LESSON_CAPACITY, MIN_REWARD_COST, OPEN_BOOKING_STATUSES, Provider,
  Reward, ServiceCategory, areaCoords, bookingStage, isGroupLesson, useMyBookings, useProviderAvatars,
  useProviderRole, useRedeemablePoints, useServicesCatalog,
} from '../../features/services/useServices';
import { useTasks } from '../../features/tasks/useTasks';
import { geocodeQuery } from '../courtmap/courtMapUtils';
import { haversineKm } from '../../utils/zones';
import {
  bookService, cancelBooking, redeemReward, serviceErrorMessage,
} from '../../features/services/servicesApi';
import { createOffer, deactivateOffer, updateOffer } from '../../features/services/servicesApi';
import { SUPER_ADMIN_UID } from '../../utils/eventTypes';

// Services tab and offer form. Firestore reads live in features/services/.

// ─── Add / edit an offer (super-admin only) ──────────────────────────────────────────────────────

// Compact field chrome, matching Add an Event: one size for every field in the sheet.
const fieldCls =
  'w-full rounded-xl bg-tennis-dark/70 border border-fg/10 px-3.5 py-2.5 text-sm text-fg ' +
  'placeholder-fg/70 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20';
const labelCls = 'block text-[11px] font-bold uppercase tracking-widest text-fg/70 mb-1.5';

type LinkCandidate = { uid: string; name: string };

export const AddServiceForm: React.FC<{
  byCategory: Map<ServiceCategory, Provider[]>;
  editingReward?: Reward;
  onClose: () => void;
  onCreated: () => void;
}> = ({ byCategory, editingReward, onClose, onCreated }) => {
  const isEditing = !!editingReward;
  const [category, setCategory] = useState<ServiceCategory>(editingReward?.category ?? 'stringing');
  // Every provider is a member. Searching a name here IS choosing the provider: saving flags their
  // account (a coach/stringer role on providers/{uid}). There is no unlinked-provider path, so there
  // is no separate "link an account" step either.
  const [providerUid, setProviderUid] = useState(editingReward?.provider_id ?? '');
  const [memberName, setMemberName] = useState('');
  // The business name, when it differs from the member's own — "TIVORYX" for Karan Tiwari.
  // Blank means they trade under their own name.
  const [alias, setAlias] = useState(editingReward?.provider_name ?? '');
  const [area, setArea] = useState(editingReward?.area ?? '');
  const [certified, setCertified] = useState(!!editingReward?.certified);
  // Coaching only. A group lesson is booked like any offer and grouped by the coach on their dash.
  // Capacity defaults to 4 when ticked and 1 when not; it is a guide to group size, never a limit.
  const [groupLesson, setGroupLesson] = useState(!!editingReward && isGroupLesson(editingReward));
  const [capacity, setCapacity] = useState(editingReward?.capacity ? String(editingReward.capacity) : '');
  const [duration, setDuration] = useState(editingReward?.duration ?? '');

  const [offer, setOffer] = useState(editingReward?.offer ?? '');
  const [brandInput, setBrandInput] = useState('');
  const [brands, setBrands] = useState<string[]>(
    editingReward?.brands ? editingReward.brands.split(',').map((b) => b.trim()).filter(Boolean) : [],
  );
  const [totalPrice, setTotalPrice] = useState(editingReward ? String(editingReward.total_price) : '');
  const [discount, setDiscount] = useState(editingReward ? String(editingReward.discount) : '');
  const [pointsCost, setPointsCost] = useState(editingReward ? String(editingReward.points_cost) : '');

  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<LinkCandidate[]>([]);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const providersInCategory = useMemo(() => byCategory.get(category) ?? [], [byCategory, category]);

  useEffect(() => {
    // Loaded once, lazily, only after two characters are typed — `users` is world-readable, and
    // this keeps opening the form free of a full-collection read.
    if (search.trim().length < 2 || candidates.length > 0) return;
    getDocs(collection(db, 'users')).then((snap) => {
      setCandidates(snap.docs.map((d) => ({ uid: d.id, name: (d.data().name as string) || '' })));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const memberMatches = search.trim().length < 2 ? [] : candidates
    .filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 6);

  const pickedLabel = memberName || (isEditing ? editingReward!.provider_name : '');

  const addBrand = () => {
    const b = brandInput.trim();
    if (!b || brands.includes(b)) return;
    setBrands([...brands, b]);
    setBrandInput('');
  };

  const priceNum = Number(totalPrice);
  const discountNum = Number(discount) || 0;
  const pointsNum = Number(pointsCost);
  const discountedPrice = Number.isFinite(priceNum) ? Math.max(0, priceNum - discountNum) : null;
  // No discount and no points is a plain regular-price service — it carries a pill and Book alone.
  const regularPriceOnly = discountNum === 0 && pointsNum === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // The alias is what members see; without one they see the member's own name.
    const name = alias.trim() || pickedLabel;
    if (!providerUid) { setError('Search for the provider by name and pick their account.'); return; }
    if (!name) { setError('Enter the provider\'s name or business name.'); return; }
    if (!offer.trim()) { setError('Enter an offer title.'); return; }
    if (!Number.isFinite(priceNum) || priceNum < 0) { setError('Enter a valid price.'); return; }
    if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > priceNum) { setError('Discount must be between 0 and the price.'); return; }
    // 0 is allowed: an offer with no discount and no points is a plain regular-price service.
    if (!Number.isFinite(pointsNum) || pointsNum < 0) { setError('Points cannot be negative.'); return; }
    if (!area.trim()) { setError('Enter the provider\'s area.'); return; }

    // Coaching always states a capacity so the pill has something to show: 1 for a private lesson,
    // the group default when the box is ticked, or whatever was typed.
    const capacityNum = category !== 'coaching' ? 0
      : capacity.trim() ? Math.max(1, Math.round(Number(capacity)))
      : groupLesson ? GROUP_LESSON_CAPACITY : 1;

    // Brands are a stringing idea: empty for the other two, so switching an offer to coaching
    // clears what it used to carry.
    const input = {
      category,
      providerUid,
      providerName: name,
      businessName: alias.trim(),
      area: area.trim(),
      certified: category === 'coaching' && certified,
      offer: offer.trim(),
      brands: category === 'stringing' ? brands.join(', ') : '',
      totalPrice: priceNum,
      discount: discountNum,
      pointsCost: pointsNum,
      groupLesson: category === 'coaching' && groupLesson,
      capacity: capacityNum,
      duration: category === 'coaching' ? duration.trim() : '',
    };
    setSaving(true);
    try {
      if (isEditing) await updateOffer(editingReward!.id, input);
      else await createOffer(input);
      onCreated();
      onClose();
    } catch {
      setError(`Could not ${isEditing ? 'save' : 'add'} the service. Please try again.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={isEditing ? 'Edit service' : 'Add a service'} maxWidthClassName="max-w-md">
      <form onSubmit={submit} className="p-5 pt-2 space-y-3">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-badge-loss text-sm px-4 py-2.5">{error}</div>
        )}

        <div>
          <label className={labelCls}>Type</label>
          <div className="flex gap-2">
            {(['stringing', 'coaching', 'others'] as ServiceCategory[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  category === c ? 'bg-clay border-clay text-white' : 'bg-tennis-dark/70 text-fg/70 border-fg/10 hover:border-fg/30'
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Provider</label>
          {/* One field: the provider IS a member. Picking them here links the account and flags
              it as a coach/stringer on save, so there is no separate link step and no way to add
              a provider nobody can book. */}
          {providerUid ? (
            <div className="flex items-center justify-between rounded-xl bg-fg/5 px-3.5 py-2.5">
              <span className="text-sm text-fg font-semibold">{pickedLabel || 'Linked account'}</span>
              <button type="button" aria-label="Choose a different provider"
                onClick={() => { setProviderUid(''); setMemberName(''); setSearch(''); }}
                className="text-fg/70 hover:text-fg"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="relative">
              <input className={fieldCls} placeholder="Search members by name…" value={search}
                onChange={(e) => setSearch(e.target.value)} />
              {memberMatches.length > 0 && (
                <div className="mt-1.5 rounded-xl border border-fg/10 bg-tennis-dark/95 overflow-hidden">
                  {memberMatches.map((c) => (
                    <button key={c.uid} type="button"
                      onClick={() => {
                        setProviderUid(c.uid);
                        setMemberName(c.name);
                        setSearch('');
                        // A second offer keeps the area already entered for that provider rather
                        // than asking for it again.
                        const already = providersInCategory.find((p) => p.id === c.uid);
                        if (already && !area.trim()) setArea(already.area);
                      }}
                      className="w-full text-left px-3.5 py-2 text-sm text-fg hover:bg-clay/20 transition-colors">
                      {c.name || '(no name)'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Business name</label>
          <input className={fieldCls} placeholder={pickedLabel ? `Optional — defaults to ${pickedLabel}` : 'Optional'}
            value={alias} onChange={(e) => setAlias(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>Area</label>
          <input className={fieldCls} placeholder="e.g. Downtown Toronto" value={area}
            onChange={(e) => setArea(e.target.value)} />
        </div>

        {category === 'coaching' && (
          <label className="flex items-center gap-2 text-sm text-fg/70 cursor-pointer">
            <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} className="accent-clay" />
            Certified
          </label>
        )}

        <div>
          <label className={labelCls}>Offer title</label>
          <input className={fieldCls} placeholder="Mid-level Strings Replacement" value={offer} onChange={(e) => setOffer(e.target.value)} />
        </div>

        {/* Coaching only. Group lesson bookings are grouped by the coach on their dash; capacity
            and duration are shown to members as pills beside the price. */}
        {category === 'coaching' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
              <input
                type="checkbox"
                checked={groupLesson}
                onChange={(e) => {
                  setGroupLesson(e.target.checked);
                  // Only fill a sensible default — never overwrite a number already typed.
                  if (!capacity) setCapacity(e.target.checked ? '4' : '1');
                }}
                className="accent-clay"
              />
              Group lesson
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Capacity</label>
                <input type="number" inputMode="numeric" min="1" step="1" value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder={groupLesson ? '4' : '1'} className={fieldCls} />
              </div>
              <div>
                <label className={labelCls}>Duration</label>
                <input className={fieldCls} placeholder="1 hr" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Stringing only — a coach has no brands to list. */}
        {category === 'stringing' && (
        <div>
          <label className={labelCls}>Brands</label>
          {brands.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {brands.map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.06] pl-2.5 pr-1.5 py-1 text-[11px] text-fg/70">
                  {b}
                  <button type="button" onClick={() => setBrands(brands.filter((x) => x !== b))} className="text-fg/70 hover:text-fg">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input className={fieldCls} placeholder="Add a brand…" value={brandInput} onChange={(e) => setBrandInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBrand(); } }} />
            <Button type="button" variant="clay" className="px-3 shrink-0" onClick={addBrand} disabled={!brandInput.trim()}>Add</Button>
          </div>
        </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Price</label>
            <input type="number" inputMode="decimal" min="0" step="1" value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)} placeholder="40" className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Discount</label>
            <input type="number" inputMode="decimal" min="0" step="1" value={discount}
              onChange={(e) => setDiscount(e.target.value)} placeholder="5" className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Points</label>
            <input type="number" inputMode="decimal" min="0" step="1" value={pointsCost}
              onChange={(e) => setPointsCost(e.target.value)} placeholder="0" className={fieldCls} />
          </div>
        </div>
        {discountedPrice !== null && (
          <p className="text-[11px] text-fg/70">
            {regularPriceOnly
              ? priceNum === 0
                ? 'Shown to members as Free — Book only, nothing to redeem.'
                : `Shown to members at $${priceNum} as a regular price — Book only, nothing to redeem.`
              : `Shown to members as $${discountedPrice} with ${pointsCost || '—'} points, off a $${priceNum} regular price.`}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="clay" isLoading={saving} className="flex-1">{isEditing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Sheet>
  );
};

// ─── The Services tab ────────────────────────────────────────────────────────────────────────────

// Every pill on an offer card wears this: clay on a clay wash, one size.
const pillCls = 'text-[11px] font-bold text-clay bg-clay/10 rounded-full px-2.5 py-0.5';

const money = (n: number | null | undefined) =>
  typeof n === 'number' ? `$${n % 1 === 0 ? n : n.toFixed(2)}` : '—';

// ─── One offer ──────────────────────────────────────────────────────────────────────────────

// The regular price is the headline so members can compare providers at a glance and just book
// at full price if they'd rather not spend points. The discount is the secondary line.
const OfferCard: React.FC<{
  reward: Reward;
  balance: number;
  signedIn: boolean;
  /** The provider can take the job (a linked account) and it isn't your own offer. */
  bookable: boolean;
  /** You already have an open booking for this offer. */
  booked: boolean;
  busy: 'book' | 'redeem' | null;
  onBook: () => void;
  onRedeem: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ reward, balance, signedIn, bookable, booked, busy, onBook, onRedeem, onEdit, onDelete }) => {
  const affordable = balance >= reward.points_cost;
  // A group lesson takes one redeemed booking at a time (functions/lib/bookingState.js).
  const redeemTaken = isGroupLesson(reward) && !!reward.redeem_booking_id;
  // Nothing to redeem: no discount and no points. The card says so and offers Book alone.
  const regularPriceOnly = reward.discount === 0 && reward.points_cost === 0;
  const pills = [
    ...(reward.brands ? reward.brands.split(',').map((b) => b.trim()).filter(Boolean) : []),
    ...(reward.capacity ? [reward.capacity === 1 ? 'Private' : `Up to ${reward.capacity}`] : []),
    ...(reward.duration ? [reward.duration] : []),
  ];

  return (
    <div className="rounded-2xl bg-fg/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-fg leading-snug">{reward.offer}</p>
        <div className="flex items-center gap-2 shrink-0">
          {onEdit && (
            <button type="button" aria-label="Edit offer" onClick={onEdit} className="text-fg/70 hover:text-fg transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button type="button" aria-label="Remove offer" onClick={onDelete} className="text-fg/70 hover:text-badge-loss transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-xl font-black text-fg leading-none">{money(reward.total_price)}</span>
        </div>
      </div>

      {/* Brands for stringing; capacity and duration for coaching — same pill row either way, and
          the price pill leads it. Every pill is clay: they are the card's accents, not captions. */}
      {(regularPriceOnly || pills.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {regularPriceOnly && (
            <span className={pillCls}>{reward.total_price === 0 ? 'Free' : 'Regular price'}</span>
          )}
          {pills.map((b) => <span key={b} className={pillCls}>{b}</span>)}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2.5 mt-3.5 pt-3 border-t border-fg/5">
        <span className="text-xs text-fg/70">
          {regularPriceOnly
            ? 'No points needed'
            : `${money(reward.discounted_price)} with ${reward.points_cost} points`}
        </span>
        {/* Book pays the regular price; Redeem spends points. Both send the job to the provider.
            A signed-out visitor gets the way in rather than a disabled Book they can't explain. */}
        {bookable && (!signedIn ? (
          <Link to="/login">
            <Button size="sm" variant="white">Log in to book</Button>
          </Link>
        ) : booked ? (
          <Button size="sm" variant="white" disabled>Booked</Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="white" onClick={onBook} disabled={!!busy} isLoading={busy === 'book'}>
              Book
            </Button>
            {!regularPriceOnly && (
              <Button
                size="sm"
                variant="clay"
                onClick={onRedeem}
                disabled={!affordable || redeemTaken || !!busy}
                isLoading={busy === 'redeem'}
              >
                {`Redeem a ${money(reward.discount)} discount`}
              </Button>
            )}
          </div>
        ))}
      </div>
      {bookable && !booked && signedIn && !regularPriceOnly && (redeemTaken ? (
        <p className="text-xs text-fg/70 mt-2">
          The discount for this lesson has been redeemed.
        </p>
      ) : !affordable && (
        <p className="text-xs text-fg/70 mt-2">
          Needs {reward.points_cost} points to redeem. Book pays the regular price.
        </p>
      ))}
    </div>
  );
};

// ─── Provider photo ─────────────────────────────────────────────────────────────────────────

// The provider's own uploaded profile photo (their id is their uid). Falls back to their initial,
// so a provider without a photo still gets the same round marker and the rows stay aligned.
const ProviderAvatar: React.FC<{ name: string; src?: string }> = ({ name, src }) => (
  src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="w-6 h-6 rounded-full object-cover shrink-0 bg-fg/10"
    />
  ) : (
    <span className="w-6 h-6 rounded-full shrink-0 bg-fg/10 text-fg/70 text-[11px] font-black flex items-center justify-center">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
);

// ─── One of the member's bookings ───────────────────────────────────────────────────────────

// Where the job is, in the member's words. The provider's side is ProviderDashElements.tsx.
const memberStep = (b: BookingRow) => {
  const stage = bookingStage(b);
  if (stage === 'new') return isGroupLesson(b) ? 'Waiting for the coach to add you to a group' : 'Waiting for the provider to confirm';
  if (stage === 'in_progress') {
    return isGroupLesson(b) ? 'You’re in the coach’s group lesson'
      : b.category === 'coaching' ? 'Lesson confirmed' : 'Your racquet is with the provider';
  }
  if (stage === 'cancelled' && b.refund === 'pending') {
    const who = b.cancelled_by !== 'provider' ? 'Cancelled' : b.lesson_group ? 'Class cancelled' : 'Declined';
    return `${who} · an organizer is reviewing your ${b.points} point refund`;
  }
  return '';
};

const BookingCard: React.FC<{ b: BookingRow; busy: boolean; onCancel: () => void }> = ({ b, busy, onCancel }) => {
  const [confirming, setConfirming] = useState(false);
  const stage = bookingStage(b);
  // A group lesson member may leave until the coach marks it done (functions/lib/bookingState.js).
  const cancellable = stage === 'new' || (isGroupLesson(b) && stage === 'in_progress');
  return (
    <div className="rounded-2xl bg-fg/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-fg">{b.offer}</p>
          <p className="mt-0.5 truncate text-xs text-fg/70">
            {[b.providerName, money(b.price), b.points ? `${b.points} points` : ''].filter(Boolean).join(' · ')}
          </p>
        </div>
        {cancellable && (confirming ? (
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant="outline" onClick={onCancel} isLoading={busy}>Yes, cancel</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Keep</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setConfirming(true)}>Cancel</Button>
        ))}
      </div>
      {stage === 'confirming' ? (
        <Link to="/profile?dash=player" className="mt-2 inline-block text-xs font-bold text-clay hover:underline">
          {b.category === 'coaching' ? 'Lesson marked done' : 'Ready for pickup'}. Confirm it on your Player Dash
        </Link>
      ) : (
        <p className="mt-2 text-xs text-fg/70">{memberStep(b)}</p>
      )}
      {cancellable && b.redemption_code && (
        <p className="mt-1 text-xs text-fg/70">
          Coupon <span className="font-mono tracking-wider text-fg">{b.redemption_code}</span>
        </p>
      )}
    </div>
  );
};

// ─── The tab ────────────────────────────────────────────────────────────────────────────────

// ─── Nearest-provider search ─────────────────────────────────────────────────────────────────────

type Origin = { label: string; lat: number; lng: number };

const kmLabel = (km: number) => (km < 1 ? 'under 1 km away' : `about ${Math.round(km)} km away`);

/** Distance from the searched address to a provider, or null when their area isn't recognised. */
const providerDistanceKm = (provider: Provider, origin: Origin | null): number | null => {
  if (!origin) return null;
  const at = areaCoords(provider.area);
  return at ? haversineKm(origin.lat, origin.lng, at.lat, at.lng) : null;
};

/**
 * Address bar above the category cards. What's typed goes through the same geocoder the Court Map
 * uses, and providers are then ordered by distance from it.
 *
 * The distance is NEIGHBOURHOOD resolution, not door to door: a provider stores an area rather
 * than a street address (see AREA_COORDS in features/services/types.ts). That is why the area name
 * is always shown beside the figure and the figure itself is rounded — neither should read as a
 * measurement the data can't support. A provider whose area isn't recognised sorts to the end
 * rather than being placed somewhere invented.
 */
const NearestSearch: React.FC<{
  origin: Origin | null;
  onOrigin: (origin: Origin | null) => void;
}> = ({ origin, onOrigin }) => {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true); setError('');
    try {
      const hit = await geocodeQuery(q);
      if (!hit) {
        setError('No match for that address. A street number or the nearest intersection usually finds it.');
        return;
      }
      onOrigin({ label: q, ...hit });
    } catch {
      setError('Address lookup is unavailable right now. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4">
      {/* Default flex alignment stretches the button to the input's height, so the two line up
          without pinning either to a fixed size. */}
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Your address or nearest intersection"
          aria-label="Find services near an address"
          className={field}
        />
        <Button type="submit" variant="primary" aria-label="Search" isLoading={busy} className="shrink-0 px-4">
          <Search className="w-4 h-4" />
        </Button>
      </form>

      {origin && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-fg/70">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-clay" />
          <span className="truncate">Nearest to {origin.label}</span>
          <button
            type="button"
            onClick={() => { setQuery(''); setError(''); onOrigin(null); }}
            className="ml-auto shrink-0 font-bold text-clay hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
          >
            Clear
          </button>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-badge-loss">{error}</p>}
    </div>
  );
};

export const ServicesTab: React.FC = () => {
  const { user } = useAuth();
  const { rewards, byCategory, loading: catalogLoading, reload: reloadCatalog } = useServicesCatalog();
  const [showAddService, setShowAddService] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isSuperAdmin = user?.uid === SUPER_ADMIN_UID;
  const providerAvatars = useProviderAvatars(rewards.map((r) => r.provider_id));
  const { balance, loading: balanceLoading } = useRedeemablePoints(useTasks());
  const { bookings } = useMyBookings();
  const { providerId } = useProviderRole();
  // Category is now a picture card rather than an accordion row, and exactly ONE can be chosen —
  // tapping the open one closes it and the panel below empties, which is the state the page opens
  // in. Providers below it can still be open several at a time, unlike the Tree elsewhere in the
  // app (Tournament draws, Leaderboard divisions), which stays single-open.
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);
  const [openProviders, setOpenProviders] = useState<Set<string>>(new Set());
  // A provider shows ONE offer until asked for the rest. A stringer with five price tiers used to
  // push every other provider off the screen, so the member had to scroll to learn who else there
  // was. Keyed by the same `${cat}:${id}` as openProviders.
  const [allOffersFor, setAllOffersFor] = useState<Set<string>>(new Set());
  // The address a member searched, if any. Unset is the normal state and keeps the pinned order.
  const [origin, setOrigin] = useState<Origin | null>(null);
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
    setter((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Open jobs, plus cancelled redeemed ones whose refund an organizer hasn't decided yet.
  const myBookings = bookings.filter((b) => OPEN_BOOKING_STATUSES.includes(b.status) || b.refund === 'pending');
  const bookedIds = new Set(
    bookings.filter((b) => OPEN_BOOKING_STATUSES.includes(b.status)).map((b) => b.service_id),
  );
  // A provider's phone and email are shown to a member with a LIVE booking with them — from the
  // moment they book, through the job, and after it completes — and to that provider's own
  // account. A cancelled or declined booking shows nothing: it is the one case where a member
  // once tapped Book but no arrangement exists, and it was leaking contacts for exactly that.
  const contactableProviderIds = new Set([
    ...bookings.filter((b) => b.status !== 'cancelled').map((b) => b.provider_id),
    providerId,
  ].filter(Boolean));
  // Read live from `contacts/{uid}`, never from the offer doc. The offer is world-readable, so a
  // number stored on it was fetchable before booking however the page chose to hide it; `contacts`
  // is permitted only once the booking has created the connection, so the gate is the rules'.
  const providerContacts = useContacts(
    [...new Set(rewards.filter((r) => contactableProviderIds.has(r.provider_id)).map((r) => r.provider_id))],
  );

  const pct = Math.min(100, (Math.max(0, balance) / MIN_REWARD_COST) * 100);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id); setError('');
    try { await fn(); } catch (err) { setError(serviceErrorMessage(err)); } finally { setBusyId(null); }
  };

  const removeOffer = async (reward: Reward) => {
    if (!confirm(`Remove "${reward.offer}"? It'll no longer be shown, but existing coupons for it still work.`)) return;
    setDeletingId(reward.id); setError('');
    try { await deactivateOffer(reward.id); reloadCatalog(); } catch { setError('Could not remove that offer. Try again.'); }
    finally { setDeletingId(null); }
  };

  const categories: ServiceCategory[] = ['stringing', 'coaching', 'others'];

  /**
   * Tapping a card opens it; tapping the open one closes it and empties the panel below.
   *
   * Selecting seeds every provider in that category as open, because choosing the category WAS
   * the picking step — leaving them collapsed would make it three taps to reach a price. They stay
   * individually collapsible afterwards.
   */
  const selectCategory = (cat: ServiceCategory) => {
    if (selectedCategory === cat) { setSelectedCategory(null); return; }
    setSelectedCategory(cat);
    setOpenProviders(new Set((byCategory.get(cat) ?? []).map((p) => `${cat}:${p.id}`)));
  };

  /**
   * Default order is the pinned one set in useServices. A searched address replaces it outright —
   * distance wins, and the pinned pair take their place in the ranking like everyone else.
   * Providers whose area can't be placed go last rather than being ranked on a guess.
   */
  const providersFor = (cat: ServiceCategory): Provider[] => {
    const list = byCategory.get(cat) ?? [];
    if (!origin) return list;
    return [...list].sort(
      (a, b) =>
        (providerDistanceKm(a, origin) ?? Infinity) - (providerDistanceKm(b, origin) ?? Infinity),
    );
  };

  return (
    <div>
      {/* Balance. Earned/spent totals deliberately omitted — what matters here is what you can
          spend right now, and the Tasks page already tracks earning. */}
      <motion.div {...fadeUp} className="flex items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-3xl font-black text-clay leading-none">{balanceLoading ? '—' : balance}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-fg/70 mt-1.5">
            Redeemable points
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-fg">Use points to get discounts</p>
        </div>
      </motion.div>

      <div className="h-1.5 rounded-full bg-fg/10 overflow-hidden mb-5">
        <div className="h-full rounded-full bg-clay transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {!user && (
        <p className="text-[11px] text-fg/70 mb-5 -mt-3">
          <Link to="/login" className="text-clay font-bold hover:underline">Join or Log in</Link>{' '}
          to redeem points or avail the services.
        </p>
      )}

      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 text-badge-loss text-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {providerId && (
        <p className="text-sm text-fg mb-5">
          Bookings for your services are on your{' '}
          <Link to="/profile?dash=provider" className="font-bold text-clay hover:underline">Provider Dash</Link>.
        </p>
      )}

      {myBookings.length > 0 && (
        <div className="space-y-2.5 mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-fg/70">Your bookings</p>
          {myBookings.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              busy={busyId === `cancel:${b.id}`}
              onCancel={() => run(`cancel:${b.id}`, () => cancelBooking({ bookingId: b.id }))}
            />
          ))}
        </div>
      )}

      {catalogLoading ? (
        <div className="h-40 bg-tennis-surface/30 rounded-3xl animate-pulse" />
      ) : byCategory.size === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 py-12 text-center">
          <Sparkles className="w-7 h-7 text-fg/70 mx-auto mb-3" />
          <p className="text-sm text-fg/70">No services available yet. Check back soon.</p>
        </div>
      ) : (
        <>
          {/* Category picker: one square picture card each, in a sideways scroll so a third
              category slots in without relaying the row out. A category needs BOTH offers and a
              picture to appear — "Others" has no picture and is deliberately absent, which does
              mean anything filed under it is unreachable from here. */}
          {/* Address search (NearestSearch) is off for now; render it here to bring it back. */}

          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {categories.map((cat) => {
              const providers: Provider[] = byCategory.get(cat) ?? [];
              if (providers.length === 0 || !CATEGORY_IMAGE[cat]) return null;
              const offerCount = providers.reduce((n, p) => n + p.offers.length, 0);
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => selectCategory(cat)}
                  aria-pressed={active}
                  className={`relative shrink-0 w-40 aspect-square rounded-2xl overflow-hidden text-left
                              transition-all focus-visible:outline-2 focus-visible:outline-offset-2
                              focus-visible:outline-clay ${active ? 'ring-2 ring-clay' : 'opacity-90 hover:opacity-100'}`}
                >
                  <img
                    src={CATEGORY_IMAGE[cat]}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover object-center"
                  />
                  {/* The label sits on the photo, so it needs its own darkening to stay readable
                      whatever the picture behind it happens to be. */}
                  <span className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-tennis-dark via-tennis-dark/75 to-transparent">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-clay truncate">{CATEGORY_LABEL[cat]}</span>
                      <span className="shrink-0 text-xs font-semibold text-fg/70">
                        {offerCount} offer{offerCount === 1 ? '' : 's'}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Nothing here until a card is chosen. */}
          {selectedCategory && (
            <Tree>
              {providersFor(selectedCategory).map((p) => {
                const cat = selectedCategory;
                const distKm = providerDistanceKm(p, origin);
                return (
                  <TreeGroup
                    key={p.id}
                    id={`${cat}:${p.id}`}
                    level={1}
                    open={openProviders.has(`${cat}:${p.id}`)}
                    onToggle={toggleSet(setOpenProviders)}
                    label={
                      <span className="flex items-center gap-2">
                        <ProviderAvatar name={p.name} src={providerAvatars[p.id]} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            {p.name}
                            {p.certified && <BadgeCheck className="w-3.5 h-3.5 text-clay shrink-0" />}
                          </span>
                          {/* Area always shows beside the distance: the figure is measured from
                              the neighbourhood centre, not the provider's door. */}
                          <span className="block text-[11px] font-medium text-fg/70 mt-0.5">
                            {p.area}
                            {distKm !== null && ` · ${kmLabel(distKm)}`}
                          </span>
                        </span>
                      </span>
                    }
                    // Contacts are shared by booking, so the catalogue shows a provider's phone and
                    // email only once this member has booked them (never to a signed-out visitor).
                    right={user && contactableProviderIds.has(p.id) && providerContacts[p.id]
                      ? (
                        <ContactOpponentButton
                          name={p.name}
                          phone={providerContacts[p.id]?.phone}
                          email={providerContacts[p.id]?.email}
                          whatsappContact={providerContacts[p.id]?.whatsapp_contact}
                          // Deliberately no `preferred`: a provider is offering a service, so every
                          // channel they have filled in is on, whatever they set for ordinary play.
                          size="sm"
                        />
                      )
                      : undefined}
                    bodyClassName="px-5 space-y-2.5"
                  >
                    {(allOffersFor.has(`${cat}:${p.id}`) ? p.offers : p.offers.slice(0, 1)).map((r) => (
                      <OfferCard
                        key={r.id}
                        reward={r}
                        balance={balance}
                        signedIn={!!user}
                        // Nobody books their own offer; bookService and redeemReward check it again.
                        bookable={r.provider_id !== user?.uid}
                        booked={bookedIds.has(r.id)}
                        busy={busyId === `book:${r.id}` ? 'book' : busyId === `redeem:${r.id}` ? 'redeem' : null}
                        onBook={() => run(`book:${r.id}`, () => bookService({ serviceId: r.id }))}
                        onRedeem={() => run(`redeem:${r.id}`, () => redeemReward({ rewardId: r.id }))}
                        onEdit={isSuperAdmin ? () => setEditingReward(r) : undefined}
                        onDelete={isSuperAdmin && deletingId !== r.id ? () => removeOffer(r) : undefined}
                      />
                    ))}
                    {p.offers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => toggleSet(setAllOffersFor)(`${cat}:${p.id}`)}
                        className="w-full min-h-11 rounded-2xl bg-fg/[0.03] text-xs font-bold text-clay hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                      >
                        {allOffersFor.has(`${cat}:${p.id}`)
                          ? 'Show less'
                          : `Show ${p.offers.length - 1} more offer${p.offers.length === 2 ? '' : 's'}`}
                      </button>
                    )}
                  </TreeGroup>
                );
              })}
            </Tree>
          )}
        </>
      )}

      {isSuperAdmin && (
        <Fab ariaLabel="Add a service" onClick={() => setShowAddService(true)}>
          <Plus className="w-6 h-6" />
        </Fab>
      )}

      {(showAddService || editingReward) && (
        <AddServiceForm
          byCategory={byCategory}
          editingReward={editingReward ?? undefined}
          onClose={() => { setShowAddService(false); setEditingReward(null); }}
          onCreated={reloadCatalog}
        />
      )}
    </div>
  );
};
