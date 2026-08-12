import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { CATEGORY_LABEL, Provider, Reward, ServiceCategory } from '../../features/services/useServices';
import { createOffer, updateOffer } from '../../features/services/adminApi';

// Compact field chrome, matching Add an Event: one size for every field in the sheet.
const fieldCls =
  'w-full rounded-xl bg-tennis-dark/70 border border-fg/10 px-3.5 py-2.5 text-sm text-fg ' +
  'placeholder-fg/30 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20';
const labelCls = 'block text-[11px] font-bold uppercase tracking-widest text-fg/50 mb-1.5';

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
    editingReward?.brands ? editingReward.brands.split(',').map((b) => b.trim()).filter(Boolean) : [],
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
    getDocs(collection(db, 'users')).then((snap) => {
      setCandidates(snap.docs.map((d) => ({ uid: d.id, name: (d.data().name as string) || '' })));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkSearch]);

  const linkMatches = linkSearch.trim().length < 2 ? [] : candidates
    .filter((c) => c.name.toLowerCase().includes(linkSearch.trim().toLowerCase()))
    .slice(0, 6);

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

    const name = isEditing ? editingReward!.provider_name
      : providerMode === 'existing' ? providersInCategory.find((p) => p.id === providerId)?.name || ''
      : providerName.trim();
    if (!name) { setError('Choose a provider, or enter a new provider name.'); return; }
    if (!offer.trim()) { setError('Enter an offer title.'); return; }
    if (!Number.isFinite(priceNum) || priceNum < 0) { setError('Enter a valid price.'); return; }
    if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > priceNum) { setError('Discount must be between 0 and the price.'); return; }
    if (!Number.isFinite(pointsNum) || pointsNum <= 0) { setError('Enter the points required.'); return; }
    if (!isEditing && providerMode === 'new' && !area.trim()) { setError('Enter the new provider\'s area.'); return; }
    if (isEditing && !area.trim()) { setError('Enter the provider\'s area.'); return; }

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
          area: providerMode === 'existing'
            ? (providersInCategory.find((p) => p.id === providerId)?.area || '')
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
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-2.5">{error}</div>
        )}

        <div>
          <label className={labelCls}>Type</label>
          <div className="flex gap-2">
            {(['stringing', 'coaching', 'others'] as ServiceCategory[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCategory(c); setProviderId(''); }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  category === c ? 'bg-clay border-clay text-white' : 'bg-tennis-dark/70 text-fg/60 border-fg/10 hover:border-fg/30'
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
                <input className={fieldCls} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <input className={fieldCls} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {category === 'coaching' && (
                <label className="flex items-center gap-2 text-sm text-fg/70 cursor-pointer">
                  <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} className="accent-clay" />
                  Certified
                </label>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={() => setProviderMode('existing')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    providerMode === 'existing' ? 'bg-clay border-clay text-white' : 'bg-tennis-dark/70 text-fg/60 border-fg/10'
                  }`}>
                  Existing
                </button>
                <button type="button" onClick={() => setProviderMode('new')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    providerMode === 'new' ? 'bg-clay border-clay text-white' : 'bg-tennis-dark/70 text-fg/60 border-fg/10'
                  }`}>
                  New provider
                </button>
              </div>

              {providerMode === 'existing' ? (
                <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className={fieldCls}>
                  <option value="">Select a provider…</option>
                  {providersInCategory.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <div className="space-y-2">
                  <input className={fieldCls} placeholder="Provider name" value={providerName} onChange={(e) => setProviderName(e.target.value)} />
                  <input className={fieldCls} placeholder="Area (e.g. Downtown Toronto)" value={area} onChange={(e) => setArea(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={fieldCls} placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <input className={fieldCls} placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  {category === 'coaching' && (
                    <label className="flex items-center gap-2 text-sm text-fg/70 cursor-pointer">
                      <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} className="accent-clay" />
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
              <button type="button" onClick={() => { setLinkUid(''); setLinkName(''); setLinkSearch(''); }}
                className="text-fg/40 hover:text-fg"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="relative">
              <input className={fieldCls} placeholder="Search by name…" value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} />
              {linkMatches.length > 0 && (
                <div className="mt-1.5 rounded-xl border border-fg/10 bg-tennis-dark/95 overflow-hidden">
                  {linkMatches.map((c) => (
                    <button key={c.uid} type="button"
                      onClick={() => { setLinkUid(c.uid); setLinkName(c.name); setLinkSearch(''); }}
                      className="w-full text-left px-3.5 py-2 text-sm text-fg/80 hover:bg-clay/20 transition-colors">
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
          <input className={fieldCls} placeholder="Mid-level Strings Replacement" value={offer} onChange={(e) => setOffer(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>Brands</label>
          {brands.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {brands.map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.06] pl-2.5 pr-1.5 py-1 text-[11px] text-fg/70">
                  {b}
                  <button type="button" onClick={() => setBrands(brands.filter((x) => x !== b))} className="text-fg/40 hover:text-fg">
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
            <input type="number" inputMode="decimal" min="1" step="1" value={pointsCost}
              onChange={(e) => setPointsCost(e.target.value)} placeholder="15" className={fieldCls} />
          </div>
        </div>
        {discountedPrice !== null && (
          <p className="text-[11px] text-fg/40">Shown to members as ${discountedPrice} with {pointsCost || '—'} points, off a ${priceNum} regular price.</p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="clay" isLoading={saving} className="flex-1">{isEditing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Sheet>
  );
};
