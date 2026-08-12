import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { BadgeCheck, Check, Copy, Flag, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/Button';
import { Fab } from '../../components/Fab';
import { Tree, TreeGroup } from '../../components/Tree';
import { ContactOpponentButton } from '../tournament/ContactOpponentButton';
import { fadeUp, tapScale } from '../../lib/motion';
import {
  CATEGORY_LABEL, MIN_REWARD_COST, Provider, Redemption, Reward, ServiceCategory,
  useMyRedemptions, useProviderAvatars, useProviderRedemptions, useRedeemablePoints, useServicesCatalog,
} from '../../features/services/useServices';
import {
  flagCoupon, markCouponUsed, redeemReward, requestCancellation, serviceErrorMessage,
} from '../../features/services/servicesApi';
import { GroupLessonCard } from './GroupLessonCard';
import { AddServiceForm } from './AddServiceForm';
import { deactivateOffer } from '../../features/services/adminApi';

// Only the app owner can add/edit the Services catalog — matches firestore.rules isSuperAdmin().
const SUPER_ADMIN_UID = '7PvfzNtDmsOq5GLMieId7QRT7wH3';

const money = (n: number | null | undefined) =>
  typeof n === 'number' ? `$${n % 1 === 0 ? n : n.toFixed(2)}` : '—';

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
            <button type="button" aria-label="Edit offer" onClick={onEdit} className="text-fg/40 hover:text-fg transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button type="button" aria-label="Remove offer" onClick={onDelete} className="text-fg/40 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-xl font-black text-fg leading-none">{money(reward.total_price)}</span>
        </div>
      </div>

      {reward.brands && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {reward.brands.split(',').map((b) => b.trim()).filter(Boolean).map((b) => (
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

// ─── One issued coupon (player's view) ──────────────────────────────────────────────────────

const CouponCard: React.FC<{ r: Redemption; onCancel: (code: string) => void; busy: boolean }> = ({ r, onCancel, busy }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(r.code)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => { /* clipboard blocked — the code is on screen anyway */ });
  };

  const label = r.status === 'cancel_requested' ? 'Cancelling'
    : r.status === 'flagged' ? 'Flagged' : 'Active';

  return (
    <div className="rounded-2xl bg-clay/[0.08] border border-clay/45 p-4">
      <div className="flex items-center justify-between gap-2.5">
        <p className="text-sm font-bold text-fg leading-snug">{r.offer}</p>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide bg-clay text-white rounded-full px-2 py-0.5">
          {label}
        </span>
      </div>
      <p className="text-xs text-fg/70 mt-1">{r.stringer_name} · {money(r.discounted_price)}</p>

      <p className="mt-3.5 font-mono text-2xl tracking-[0.14em] text-clay">{r.code}</p>
      <p className="text-[11px] text-fg/70 mt-1.5">Show this code when you go in</p>

      {r.status === 'flagged' && r.flag_note && (
        <p className="text-[11px] text-amber-300/90 mt-2">Flagged: {r.flag_note}</p>
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
        <p className="text-[11px] text-fg/70 mt-2">Waiting on the organizer to review your cancellation.</p>
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
    setBusy(code); setError('');
    try { await fn(); } catch (err) { setError(serviceErrorMessage(err)); } finally { setBusy(null); }
  };

  return (
    <div className="rounded-3xl border border-amber-400/30 bg-amber-400/5 p-5 mb-5">
      <p className="text-xs font-bold text-amber-300 uppercase tracking-widest mb-3">Your shop</p>

      {error && <p className="text-xs text-red-400 mb-2.5">{error}</p>}

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
                  <p className="font-mono text-xs text-fg/70 tracking-wider mt-0.5">{r.code} · {r.offer}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <motion.button
                    type="button"
                    onClick={() => run(r.code, () => markCouponUsed({ code: r.code }))}
                    disabled={busy === r.code}
                    whileTap={tapScale.whileTap}
                    transition={tapScale.transition}
                    className="p-2.5 rounded-xl bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50"
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
                    className="px-3 py-2.5 rounded-xl bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold"
                  >
                    <Flag className="w-3.5 h-3.5" />Dispute
                  </motion.button>
                </div>
              </div>
              {r.status === 'cancel_requested' && (
                <p className="text-[11px] text-fg/70 mt-1.5">Player asked to cancel. An organizer is reviewing it.</p>
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
  const isSuperAdmin = user?.uid === SUPER_ADMIN_UID;
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const openCoupons = redemptions.filter(
    (r) => r.status === 'active' || r.status === 'flagged' || r.status === 'cancel_requested');
  const openRewardIds = new Set(openCoupons.map((r) => r.reward_id));

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
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 mb-4">
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
                    right={user
                      ? <ContactOpponentButton name={p.name} phone={p.phone} email={p.email} size="sm" variant="white" />
                      : undefined}
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
                        onEdit={isSuperAdmin ? () => setEditingReward(r) : undefined}
                        onDelete={isSuperAdmin && deletingId !== r.id ? () => removeOffer(r) : undefined}
                      />
                    ))}
                  </TreeGroup>
                ))}
              </TreeGroup>
            );
          })}
        </Tree>
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
