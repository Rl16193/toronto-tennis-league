import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BadgeCheck, Check, ChevronDown, Copy, Flag, Pencil, Plus, Sparkles, Trash2, Users, X } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/Button';
import { Fab } from '../../components/Fab';
import { Sheet } from '../../components/Sheet';
import { Tree, TreeGroup } from '../../components/Tree';
import { ContactOpponentButton } from '../../components/ContactOpponentButton';
import { useContacts } from '../../features/contacts/useContacts';
import { fadeUp, tapScale } from '../../lib/motion';
import {
  CATEGORY_LABEL,
  GROUP_LESSON_CAPACITY,
  MIN_REWARD_COST,
  Provider,
  Redemption,
  Reward,
  ServiceCategory,
  useGroupLesson,
  useMyRedemptions,
  useProviderAvatars,
  useProviderRedemptions,
  useProviderRole,
  useRedeemablePoints,
  useServicesCatalog,
} from '../../features/services/useServices';
import {
  flagCoupon,
  joinGroupLesson,
  leaveGroupLesson,
  markCouponUsed,
  redeemReward,
  requestCancellation,
  serviceErrorMessage,
} from '../../features/services/servicesApi';
import { createOffer, deactivateOffer, updateOffer } from '../../features/services/adminApi';

// Services tab, offer form, and group-lesson card. Firestore reads live in features/services/.

// ─── Free monthly group lesson ───────────────────────────────────────────────────────────────────

const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
};

/**
 * The free monthly group lesson — 2-4 players, no points. Laid out like the round-robin group
 * cards: a header with the roster count, and an expandable player list.
 *
 * Spots reset on the 1st because the roster lives in a per-month document, so a new month is
 * simply a doc that doesn't exist yet. The coach who owns this offer sees names and gets a
 * Contact button per player; everyone else sees names only.
 */
export const GroupLessonCard: React.FC = () => {
  const { user } = useAuth();
  const { month, players, joined, loading } = useGroupLesson();
  const { role } = useProviderRole();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isCoach = role === 'coach';
  const spotsLeft = Math.max(0, GROUP_LESSON_CAPACITY - players.length);
  const full = spotsLeft === 0;

  // Only the coach needs these, and only once the roster is expanded.
  const rosterIds = isCoach && open ? players.map((p) => p.uid) : [];
  const rosterContacts = useContacts(rosterIds);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(serviceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-clay/[0.06] border border-clay/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg leading-snug">30 min group lesson</p>
          <p className="text-[11px] text-fg/70 mt-0.5">Free · 2–4 players · {monthLabel(month)}</p>
        </div>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-clay border border-clay/45 rounded-full px-2 py-0.5">
          Free
        </span>
      </div>

      {error && <p className="text-xs text-badge-loss mt-2">{error}</p>}

      <div className="flex items-center justify-between gap-2.5 mt-3.5 pt-3 border-t border-clay/20">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-fg/70 hover:text-fg transition-colors"
          aria-expanded={open}
        >
          <Users className="w-3.5 h-3.5" />
          {loading ? '—' : `${players.length}/${GROUP_LESSON_CAPACITY} joined`}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* The coach runs the session, so they get the roster rather than a Join button. */}
        {!isCoach &&
          (joined ? (
            <Button size="sm" variant="outline" onClick={() => act(() => leaveGroupLesson({}))} isLoading={busy}>
              Leave
            </Button>
          ) : (
            <Button
              size="sm"
              variant="clay"
              disabled={full || !user || busy}
              isLoading={busy}
              onClick={() => act(() => joinGroupLesson({}))}
            >
              {full ? 'Full' : !user ? 'Log in to join' : 'Join'}
            </Button>
          ))}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-clay/20 space-y-1.5">
              {players.length === 0 ? (
                <p className="text-xs text-fg/70">No one has joined yet. All {GROUP_LESSON_CAPACITY} spots are open.</p>
              ) : (
                players.map((p) => (
                  <div key={p.uid} className="flex items-center gap-2 min-h-[32px]">
                    <span className="min-w-0 flex-1 text-sm text-fg truncate">
                      {p.name || 'Player'}
                      {user?.uid === p.uid && <span className="ml-1 text-clay text-[10px]">(you)</span>}
                    </span>
                    {/* Contact details are resolved live from `contacts/{uid}` rather than being
                        snapshotted onto the roster — group_lessons is world-readable, so storing
                        them there exposed every player's phone and email to signed-out visitors. */}
                    {isCoach && (
                      <ContactOpponentButton
                        name={p.name || 'Player'}
                        phone={rosterContacts[p.uid]?.phone}
                        email={rosterContacts[p.uid]?.email}
                        whatsappContact={rosterContacts[p.uid]?.whatsapp_contact}
                        whatsappSameAsPhone={rosterContacts[p.uid]?.whatsapp_same_as_phone}
                        preferred={rosterContacts[p.uid]?.preferred_mode_of_contact}
                        size="sm"
                        variant="white"
                      />
                    )}
                  </div>
                ))
              )}
              {!full && players.length > 0 && (
                <p className="text-[11px] text-fg/70 pt-1">
                  {spotsLeft} spot{spotsLeft === 1 ? '' : 's'} left this month.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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
  const [providerMode, setProviderMode] = useState<'existing' | 'new'>('existing');
  const [providerId, setProviderId] = useState(editingReward?.provider_id ?? '');
  const [providerName, setProviderName] = useState(editingReward?.provider_name ?? '');
  const [area, setArea] = useState(editingReward?.area ?? '');
  const [phone, setPhone] = useState(editingReward?.contact_phone ?? '');
  const [email, setEmail] = useState(editingReward?.contact_email ?? '');
  const [certified, setCertified] = useState(!!editingReward?.certified);

  const [offer, setOffer] = useState(editingReward?.offer ?? '');
  const [brandInput, setBrandInput] = useState('');
  const [brands, setBrands] = useState<string[]>(
    editingReward?.brands
      ? editingReward.brands
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean)
      : [],
  );
  const [totalPrice, setTotalPrice] = useState(editingReward ? String(editingReward.total_price) : '');
  const [discount, setDiscount] = useState(editingReward ? String(editingReward.discount) : '');
  const [pointsCost, setPointsCost] = useState(editingReward ? String(editingReward.points_cost) : '');

  const [linkSearch, setLinkSearch] = useState('');
  const [linkUid, setLinkUid] = useState(editingReward?.uid ?? '');
  const [linkName, setLinkName] = useState('');
  const [candidates, setCandidates] = useState<LinkCandidate[]>([]);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const providersInCategory = useMemo(() => byCategory.get(category) ?? [], [byCategory, category]);

  useEffect(() => {
    // Loaded once, lazily, only when the account-link picker is actually used — `users` is
    // world-readable, and this keeps the common (no linking) case free of an extra read.
    if (linkSearch.trim().length < 2 || candidates.length > 0) return;
    getDocs(collection(db, 'users'))
      .then((snap) => {
        setCandidates(snap.docs.map((d) => ({ uid: d.id, name: (d.data().name as string) || '' })));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkSearch]);

  const linkMatches =
    linkSearch.trim().length < 2
      ? []
      : candidates.filter((c) => c.name.toLowerCase().includes(linkSearch.trim().toLowerCase())).slice(0, 6);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const name = isEditing
      ? editingReward!.provider_name
      : providerMode === 'existing'
        ? providersInCategory.find((p) => p.id === providerId)?.name || ''
        : providerName.trim();
    if (!name) {
      setError('Choose a provider, or enter a new provider name.');
      return;
    }
    if (!offer.trim()) {
      setError('Enter an offer title.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('Enter a valid price.');
      return;
    }
    if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > priceNum) {
      setError('Discount must be between 0 and the price.');
      return;
    }
    if (!Number.isFinite(pointsNum) || pointsNum <= 0) {
      setError('Enter the points required.');
      return;
    }
    if (!isEditing && providerMode === 'new' && !area.trim()) {
      setError("Enter the new provider's area.");
      return;
    }
    if (isEditing && !area.trim()) {
      setError("Enter the provider's area.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateOffer(editingReward!.id, editingReward!.provider_id, {
          category,
          providerName: name,
          area: area.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          certified,
          offer: offer.trim(),
          brands: brands.length > 0 ? brands.join(', ') : undefined,
          totalPrice: priceNum,
          discount: discountNum,
          pointsCost: pointsNum,
          linkUid: linkUid || undefined,
        });
      } else {
        await createOffer({
          category,
          providerId: providerMode === 'existing' ? providerId : undefined,
          providerName: name,
          area:
            providerMode === 'existing'
              ? providersInCategory.find((p) => p.id === providerId)?.area || ''
              : area.trim(),
          phone: providerMode === 'new' ? phone.trim() || undefined : undefined,
          email: providerMode === 'new' ? email.trim() || undefined : undefined,
          certified: providerMode === 'new' ? certified : undefined,
          offer: offer.trim(),
          brands: brands.length > 0 ? brands.join(', ') : undefined,
          totalPrice: priceNum,
          discount: discountNum,
          pointsCost: pointsNum,
          linkUid: linkUid || undefined,
        });
      }
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
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-badge-loss text-sm px-4 py-2.5">
            {error}
          </div>
        )}

        <div>
          <label className={labelCls}>Type</label>
          <div className="flex gap-2">
            {(['stringing', 'coaching', 'others'] as ServiceCategory[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                  setProviderId('');
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  category === c
                    ? 'bg-clay border-clay text-white'
                    : 'bg-tennis-dark/70 text-fg/60 border-fg/10 hover:border-fg/30'
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Provider</label>
          {isEditing ? (
            // Editing keeps the offer under the same provider row — only its details change.
            <div className="space-y-2">
              <p className="text-sm font-bold text-fg">{editingReward!.provider_name}</p>
              <input className={fieldCls} placeholder="Area" value={area} onChange={(e) => setArea(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={fieldCls}
                  placeholder="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <input
                  className={fieldCls}
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {category === 'coaching' && (
                <label className="flex items-center gap-2 text-sm text-fg/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={certified}
                    onChange={(e) => setCertified(e.target.checked)}
                    className="accent-clay"
                  />
                  Certified
                </label>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setProviderMode('existing')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    providerMode === 'existing'
                      ? 'bg-clay border-clay text-white'
                      : 'bg-tennis-dark/70 text-fg/60 border-fg/10'
                  }`}
                >
                  Existing
                </button>
                <button
                  type="button"
                  onClick={() => setProviderMode('new')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    providerMode === 'new'
                      ? 'bg-clay border-clay text-white'
                      : 'bg-tennis-dark/70 text-fg/60 border-fg/10'
                  }`}
                >
                  New provider
                </button>
              </div>

              {providerMode === 'existing' ? (
                <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className={fieldCls}>
                  <option value="">Select a provider…</option>
                  {providersInCategory.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    className={fieldCls}
                    placeholder="Provider name"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                  />
                  <input
                    className={fieldCls}
                    placeholder="Area (e.g. Downtown Toronto)"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className={fieldCls}
                      placeholder="Phone (optional)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <input
                      className={fieldCls}
                      placeholder="Email (optional)"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  {category === 'coaching' && (
                    <label className="flex items-center gap-2 text-sm text-fg/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={certified}
                        onChange={(e) => setCertified(e.target.checked)}
                        className="accent-clay"
                      />
                      Certified
                    </label>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className={labelCls}>Link to an account</label>
          {linkUid ? (
            <div className="flex items-center justify-between rounded-xl bg-fg/5 px-3.5 py-2.5">
              <span className="text-sm text-fg font-semibold">{linkName || 'Linked account'}</span>
              <button
                type="button"
                onClick={() => {
                  setLinkUid('');
                  setLinkName('');
                  setLinkSearch('');
                }}
                className="text-fg/70 hover:text-fg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                className={fieldCls}
                placeholder="Search by name…"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
              />
              {linkMatches.length > 0 && (
                <div className="mt-1.5 rounded-xl border border-fg/10 bg-tennis-dark/95 overflow-hidden">
                  {linkMatches.map((c) => (
                    <button
                      key={c.uid}
                      type="button"
                      onClick={() => {
                        setLinkUid(c.uid);
                        setLinkName(c.name);
                        setLinkSearch('');
                      }}
                      className="w-full text-left px-3.5 py-2 text-sm text-fg/80 hover:bg-clay/20 transition-colors"
                    >
                      {c.name || '(no name)'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Offer title</label>
          <input
            className={fieldCls}
            placeholder="Mid-level Strings Replacement"
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Brands</label>
          {brands.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {brands.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.06] pl-2.5 pr-1.5 py-1 text-[11px] text-fg/70"
                >
                  {b}
                  <button
                    type="button"
                    onClick={() => setBrands(brands.filter((x) => x !== b))}
                    className="text-fg/70 hover:text-fg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className={fieldCls}
              placeholder="Add a brand…"
              value={brandInput}
              onChange={(e) => setBrandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addBrand();
                }
              }}
            />
            <Button
              type="button"
              variant="clay"
              className="px-3 shrink-0"
              onClick={addBrand}
              disabled={!brandInput.trim()}
            >
              Add
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Price</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
              placeholder="40"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Discount</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="5"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Points</label>
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="1"
              value={pointsCost}
              onChange={(e) => setPointsCost(e.target.value)}
              placeholder="15"
              className={fieldCls}
            />
          </div>
        </div>
        {discountedPrice !== null && (
          <p className="text-[11px] text-fg/70">
            Shown to members as ${discountedPrice} with {pointsCost || '—'} points, off a ${priceNum} regular price.
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="clay" isLoading={saving} className="flex-1">
            {isEditing ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
};

// ─── The Services tab ────────────────────────────────────────────────────────────────────────────

// Admin/provider operations remain backlog until a server-authoritative callable exists. The
// checked-in Rules intentionally reject direct catalog and role writes, so no mutation controls
// are exposed even to the legacy super-admin UID.
const ADMIN_OFFER_MANAGEMENT_AVAILABLE = false;

const money = (n: number | null | undefined) => (typeof n === 'number' ? `$${n % 1 === 0 ? n : n.toFixed(2)}` : '—');

// ─── One offer ──────────────────────────────────────────────────────────────────────────────

// The regular price is the headline so members can compare providers at a glance and just book
// at full price if they'd rather not spend points. The discount is the secondary line.
const OfferCard: React.FC<{
  reward: Reward;
  balance: number;
  alreadyOpen: boolean;
  busy: boolean;
  onRedeem: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ reward, balance, alreadyOpen, busy, onRedeem, onEdit, onDelete }) => {
  const affordable = balance >= reward.points_cost;

  return (
    <div className="rounded-2xl bg-fg/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-fg leading-snug">{reward.offer}</p>
        <div className="flex items-center gap-2 shrink-0">
          {onEdit && (
            <button
              type="button"
              aria-label="Edit offer"
              onClick={onEdit}
              className="text-fg/70 hover:text-fg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label="Remove offer"
              onClick={onDelete}
              className="text-fg/70 hover:text-badge-loss transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-xl font-black text-fg leading-none">{money(reward.total_price)}</span>
        </div>
      </div>

      {reward.brands && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {reward.brands
            .split(',')
            .map((b) => b.trim())
            .filter(Boolean)
            .map((b) => (
              <span key={b} className="text-[11px] font-medium text-fg/70 bg-fg/[0.06] rounded-full px-2.5 py-0.5">
                {b}
              </span>
            ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2.5 mt-3.5 pt-3 border-t border-fg/5">
        <span className="text-xs text-fg/70">
          {money(reward.discounted_price)} with {reward.points_cost} points
        </span>
        <Button
          size="sm"
          variant="clay"
          onClick={onRedeem}
          disabled={!affordable || alreadyOpen || busy}
          isLoading={busy}
        >
          {alreadyOpen ? 'Coupon open' : `Redeem a ${money(reward.discount)} discount`}
        </Button>
      </div>
      {!affordable && !alreadyOpen && (
        <p className="text-[11px] text-fg/70 mt-2">
          Needs {reward.points_cost} points. You can also book at the regular price above.
        </p>
      )}
    </div>
  );
};

// ─── Provider photo ─────────────────────────────────────────────────────────────────────────

// The provider's own uploaded profile photo, resolved through the uid stamped on their offers.
// Falls back to their initial, so a provider without a member account (or without a photo) still
// gets the same round marker and the rows stay aligned.
const ProviderAvatar: React.FC<{ name: string; src?: string }> = ({ name, src }) =>
  src ? (
    <img src={src} alt="" loading="lazy" className="w-6 h-6 rounded-full object-cover shrink-0 bg-fg/10" />
  ) : (
    <span className="w-6 h-6 rounded-full shrink-0 bg-fg/10 text-fg/70 text-[11px] font-black flex items-center justify-center">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );

// ─── One issued coupon (player's view) ──────────────────────────────────────────────────────

const CouponCard: React.FC<{ r: Redemption; onCancel: (code: string) => void; busy: boolean }> = ({
  r,
  onCancel,
  busy,
}) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(r.code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* clipboard blocked — the code is on screen anyway */
      });
  };

  const label = r.status === 'cancel_requested' ? 'Cancelling' : r.status === 'flagged' ? 'Flagged' : 'Active';

  return (
    <div className="rounded-2xl bg-clay/[0.08] border border-clay/45 p-4">
      <div className="flex items-center justify-between gap-2.5">
        <p className="text-sm font-bold text-fg leading-snug">{r.offer}</p>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide bg-clay text-white rounded-full px-2 py-0.5">
          {label}
        </span>
      </div>
      <p className="text-xs text-fg/70 mt-1">
        {r.stringer_name} · {money(r.discounted_price)}
      </p>

      <p className="mt-3.5 font-mono text-2xl tracking-[0.14em] text-clay">{r.code}</p>
      <p className="text-[11px] text-fg/70 mt-1.5">Show this code when you go in</p>

      {r.status === 'flagged' && r.flag_note && (
        <p className="text-[11px] text-badge/90 mt-2">Flagged: {r.flag_note}</p>
      )}

      <div className="flex gap-2 mt-3.5">
        <Button size="sm" variant="white" className="flex-1" onClick={copy}>
          {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
          {copied ? 'Copied' : 'Copy code'}
        </Button>
        {r.status === 'active' && (
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onCancel(r.code)} isLoading={busy}>
            Cancel
          </Button>
        )}
      </div>
      {r.status === 'cancel_requested' && (
        <p className="text-[11px] text-fg/70 mt-2">Waiting on the administrator to review your cancellation.</p>
      )}
    </div>
  );
};

// ─── Provider's own coupon list (stringer or coach) ─────────────────────────────────────────

const ProviderPanel: React.FC = () => {
  const { providerId, redemptions, loading } = useProviderRedemptions();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!providerId) return null;

  const open = redemptions.filter((r) => r.status === 'active' || r.status === 'cancel_requested');
  const recent = redemptions.filter((r) => r.status === 'used').slice(0, 5);

  const run = async (code: string, fn: () => Promise<unknown>) => {
    setBusy(code);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(serviceErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-3xl border border-amber-400/30 bg-amber-400/5 p-5 mb-5">
      <p className="text-xs font-bold text-badge uppercase tracking-widest mb-3">Your shop</p>

      {error && <p className="text-xs text-badge-loss mb-2.5">{error}</p>}

      {loading ? (
        <div className="h-14 bg-fg/5 rounded-2xl animate-pulse" />
      ) : open.length === 0 ? (
        <p className="text-sm text-fg/70">No open coupons right now.</p>
      ) : (
        <div className="space-y-2">
          {open.map((r) => (
            <div key={r.code} className="rounded-2xl bg-tennis-surface/40 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg truncate">{r.user_name}</p>
                  <p className="font-mono text-xs text-fg/70 tracking-wider mt-0.5">
                    {r.code} · {r.offer}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <motion.button
                    type="button"
                    onClick={() => run(r.code, () => markCouponUsed({ code: r.code }))}
                    disabled={busy === r.code}
                    whileTap={tapScale.whileTap}
                    transition={tapScale.transition}
                    className="p-2.5 rounded-xl bg-green-500/15 text-badge-win hover:bg-green-500/25 transition-colors disabled:opacity-50"
                    aria-label={`Mark ${r.code} used`}
                  >
                    <Check className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => run(r.code, () => flagCoupon({ code: r.code }))}
                    disabled={busy === r.code}
                    whileTap={tapScale.whileTap}
                    transition={tapScale.transition}
                    className="px-3 py-2.5 rounded-xl bg-amber-500/15 text-badge hover:bg-amber-500/25 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Dispute
                  </motion.button>
                </div>
              </div>
              {r.status === 'cancel_requested' && (
                <p className="text-[11px] text-fg/70 mt-1.5">
                  Player asked to cancel. An administrator is reviewing it.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <p className="text-[11px] text-fg/70 mt-3">Recently used: {recent.map((r) => r.code).join(', ')}</p>
      )}
    </div>
  );
};

// ─── The tab ────────────────────────────────────────────────────────────────────────────────

export const ServicesTab: React.FC = () => {
  const { user } = useAuth();
  const { rewards, byCategory, loading: catalogLoading, reload: reloadCatalog } = useServicesCatalog();
  const [showAddService, setShowAddService] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canManageOffers = ADMIN_OFFER_MANAGEMENT_AVAILABLE;
  const providerAvatars = useProviderAvatars(rewards.map((r) => r.uid));
  const { balance, loading: balanceLoading } = useRedeemablePoints();
  const { redemptions } = useMyRedemptions();
  // Multiple categories/providers can be open at once here — unlike the Tree elsewhere in the
  // app (Tournament draws, Leaderboard divisions), which stays single-open. This page only.
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(['stringing']));
  const [openProviders, setOpenProviders] = useState<Set<string>>(new Set());
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
    setter((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const openCoupons = redemptions.filter(
    (r) => r.status === 'active' || r.status === 'flagged' || r.status === 'cancel_requested',
  );
  const openRewardIds = new Set(openCoupons.map((r) => r.reward_id));

  const pct = Math.min(100, (Math.max(0, balance) / MIN_REWARD_COST) * 100);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(serviceErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const removeOffer = async (reward: Reward) => {
    if (!confirm(`Remove "${reward.offer}"? It'll no longer be shown, but existing coupons for it still work.`)) return;
    setDeletingId(reward.id);
    setError('');
    try {
      await deactivateOffer(reward.id);
      reloadCatalog();
    } catch {
      setError('Could not remove that offer. Try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const categories: ServiceCategory[] = ['stringing', 'coaching', 'others'];

  return (
    <div>
      {/* Balance. Earned/spent totals deliberately omitted — what matters here is what you can
          spend right now, and the Tasks page already tracks earning. */}
      <motion.div {...fadeUp} className="flex items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-3xl font-black text-clay leading-none">{balanceLoading ? '—' : balance}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-fg/70 mt-1.5">Redeemable points</p>
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
          <Link to="/login" className="text-clay font-bold hover:underline">
            Join or Log in
          </Link>{' '}
          to redeem points or avail the services.
        </p>
      )}

      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 text-badge-loss text-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <ProviderPanel />

      {openCoupons.length > 0 && (
        <div className="space-y-2.5 mb-5">
          {openCoupons.map((r) => (
            <CouponCard
              key={r.code}
              r={r}
              onCancel={(code) => run(code, () => requestCancellation({ code }))}
              busy={busyId === r.code}
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
        <Tree>
          {categories.map((cat) => {
            const providers: Provider[] = byCategory.get(cat) ?? [];
            if (providers.length === 0) return null;
            const offerCount = providers.reduce((n, p) => n + p.offers.length, 0);
            return (
              <TreeGroup
                key={cat}
                id={cat}
                label={CATEGORY_LABEL[cat]}
                right={`${offerCount} offer${offerCount === 1 ? '' : 's'}`}
                open={openCategories.has(cat)}
                onToggle={toggleSet(setOpenCategories)}
              >
                {providers.map((p) => (
                  <TreeGroup
                    key={p.id}
                    id={`${cat}:${p.id}`}
                    level={1}
                    open={openProviders.has(`${cat}:${p.id}`)}
                    onToggle={toggleSet(setOpenProviders)}
                    label={
                      <span className="flex items-center gap-2">
                        <ProviderAvatar name={p.name} src={p.uid ? providerAvatars[p.uid] : undefined} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            {p.name}
                            {p.certified && <BadgeCheck className="w-3.5 h-3.5 text-clay shrink-0" />}
                          </span>
                          <span className="block text-[11px] font-medium text-fg/70 mt-0.5">{p.area}</span>
                        </span>
                      </span>
                    }
                    // Signed-out visitors can browse the catalogue but don't get providers'
                    // phone numbers and emails handed to them.
                    right={
                      user ? (
                        <ContactOpponentButton
                          name={p.name}
                          phone={p.phone}
                          email={p.email}
                          size="sm"
                          variant="white"
                        />
                      ) : undefined
                    }
                    bodyClassName="px-5 space-y-2.5"
                  >
                    {/* The free monthly group lesson is Archie's offer — lives under his name. */}
                    {p.id === 'archie' && <GroupLessonCard />}
                    {p.offers.map((r) => (
                      <OfferCard
                        key={r.id}
                        reward={r}
                        balance={balance}
                        alreadyOpen={openRewardIds.has(r.id)}
                        busy={busyId === r.id}
                        onRedeem={() => run(r.id, () => redeemReward({ rewardId: r.id }))}
                        onEdit={canManageOffers ? () => setEditingReward(r) : undefined}
                        onDelete={canManageOffers && deletingId !== r.id ? () => removeOffer(r) : undefined}
                      />
                    ))}
                  </TreeGroup>
                ))}
              </TreeGroup>
            );
          })}
        </Tree>
      )}

      {canManageOffers && (
        <Fab ariaLabel="Add a service" onClick={() => setShowAddService(true)}>
          <Plus className="w-6 h-6" />
        </Fab>
      )}

      {(showAddService || editingReward) && (
        <AddServiceForm
          byCategory={byCategory}
          editingReward={editingReward ?? undefined}
          onClose={() => {
            setShowAddService(false);
            setEditingReward(null);
          }}
          onCreated={reloadCatalog}
        />
      )}
    </div>
  );
};
