import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Check, X, ChevronDown } from 'lucide-react';
import { db } from '../../lib/firebase';
import type { TaskClaim } from './claimService';
import { reviewClaim } from './claimService';
import { usePendingRedemptionReviews } from '../services/useServices';
import { markCouponUsed, reviewRedemption, serviceErrorMessage } from '../services/servicesApi';

const CLAIM_LABEL: Record<TaskClaim['type'], string> = {
  volunteer: 'Volunteered',
  ambassador: 'Invited a player',
  host: 'Hosted a meetup',
};

type Section = 'claims' | 'coupons';

// Organizer-only: volunteer/ambassador/host claims waiting for approval, plus reward coupons
// that need a decision — a stringer flagged one, or a player asked to cancel one. Photo reports
// ("Submit a Photo") no longer need review — they auto-approve at creation.
export const ReviewQueue: React.FC<{ defaultOpen?: 'claims' | null }> = ({ defaultOpen }) => {
  const [claims, setClaims] = useState<TaskClaim[]>([]);
  const [open, setOpen] = useState<Section | null>(defaultOpen ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const coupons = usePendingRedemptionReviews(true);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'task_claims'), where('status', '==', 'pending')), (snap) =>
      setClaims(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskClaim))));
    return () => unsub();
  }, []);

  useEffect(() => { if (defaultOpen) setOpen(defaultOpen); }, [defaultOpen]);

  if (claims.length === 0 && coupons.length === 0) return null;

  const approveClaim = async (id: string) => { setBusy(id); try { await reviewClaim(id, true); } finally { setBusy(null); } };
  const rejectClaim = async (id: string) => { setBusy(id); try { await reviewClaim(id, false); } finally { setBusy(null); } };

  const runCoupon = async (code: string, fn: () => Promise<unknown>) => {
    setBusy(code); setError('');
    try { await fn(); } catch (err) { setError(serviceErrorMessage(err)); } finally { setBusy(null); }
  };

  return (
    <div className="rounded-3xl border border-amber-400/30 bg-amber-400/5 p-5 mb-3 space-y-3">
      <p className="text-xs font-bold text-badge uppercase tracking-widest">Needs your review</p>

      {error && <p className="text-xs text-badge-loss">{error}</p>}

      {claims.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(open === 'claims' ? null : 'claims')}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-fg">{claims.length} task{claims.length > 1 ? 's' : ''} need approval</span>
            <ChevronDown className={`w-4 h-4 text-fg/70 transition-transform ${open === 'claims' ? 'rotate-180' : ''}`} />
          </button>
          {open === 'claims' && (
            <div className="mt-2 space-y-2">
              {claims.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-tennis-surface/40 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg truncate">{c.user_name} — {CLAIM_LABEL[c.type]}</p>
                    <p className="text-xs text-fg/70 truncate">
                      {c.type === 'volunteer' && c.event_title}
                      {c.type === 'ambassador' && c.invitee_name}
                      {c.type === 'host' && [c.meetup_title, c.meetup_date].filter(Boolean).join(' · ')}
                    </p>
                    {c.note && <p className="text-xs text-fg/70 truncate">{c.note}</p>}
                  </div>
                  <button disabled={busy === c.id} onClick={() => approveClaim(c.id)} className="p-2 rounded-lg bg-green-500/15 text-badge-win hover:bg-green-500/25" aria-label="Approve">
                    <Check className="w-4 h-4" />
                  </button>
                  <button disabled={busy === c.id} onClick={() => rejectClaim(c.id)} className="p-2 rounded-lg bg-red-500/15 text-badge-loss hover:bg-red-500/25" aria-label="Reject">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reward coupons. A cancel request approves into a refund; a flag is resolved by either
          burning the coupon (it was used) or declining, which puts it back to active. */}
      {coupons.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(open === 'coupons' ? null : 'coupons')}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-fg">{coupons.length} coupon{coupons.length > 1 ? 's' : ''} need a decision</span>
            <ChevronDown className={`w-4 h-4 text-fg/70 transition-transform ${open === 'coupons' ? 'rotate-180' : ''}`} />
          </button>
          {open === 'coupons' && (
            <div className="mt-2 space-y-2">
              {coupons.map((r) => {
                const cancelling = r.status === 'cancel_requested';
                return (
                  <div key={r.code} className="rounded-2xl bg-tennis-surface/40 px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg truncate">
                          <span className="font-mono tracking-wider">{r.code}</span> — {cancelling ? 'cancel requested' : 'flagged'}
                        </p>
                        <p className="text-xs text-fg/70 truncate">{r.user_name} · {r.offer} · {r.stringer_name}</p>
                        {(r.cancel_reason || r.flag_note) && (
                          <p className="text-xs text-fg/70 truncate">{r.cancel_reason || r.flag_note}</p>
                        )}
                      </div>
                      <button
                        disabled={busy === r.code}
                        onClick={() => runCoupon(r.code, () => (
                          cancelling
                            ? reviewRedemption({ code: r.code, approve: true })
                            : markCouponUsed({ code: r.code })
                        ))}
                        className="p-2 rounded-lg bg-green-500/15 text-badge-win hover:bg-green-500/25 disabled:opacity-50"
                        aria-label={cancelling ? 'Approve cancellation and refund' : 'Mark coupon used'}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        disabled={busy === r.code}
                        onClick={() => runCoupon(r.code, () => reviewRedemption({ code: r.code, approve: false }))}
                        className="p-2 rounded-lg bg-red-500/15 text-badge-loss hover:bg-red-500/25 disabled:opacity-50"
                        aria-label="Decline, leave the coupon active"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[11px] text-fg/70 mt-1.5">
                      {cancelling
                        ? `Approving refunds ${r.points_cost} points. Declining leaves the coupon active.`
                        : 'Approving marks it used. Declining puts it back to active.'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
