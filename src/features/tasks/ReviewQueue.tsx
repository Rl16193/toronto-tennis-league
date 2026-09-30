import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { TaskClaim } from './claimService';
import { reviewClaim } from './claimService';
import type { Redemption } from '../services/types';
import { markCouponUsed, reviewRedemption, serviceErrorMessage } from '../services/servicesApi';

const CLAIM_LABEL: Record<TaskClaim['type'], string> = {
  volunteer: 'Volunteered',
  ambassador: 'Invited a player',
  host: 'Hosted a meetup',
};

/**
 * Volunteer/ambassador/host claims waiting for approval, plus reward coupons needing a decision —
 * a provider flagged one, or a member asked to cancel one. Photo reports auto-approve, so they are
 * never here.
 *
 * Presentation only. The Organizer Dash owns both listeners, so its single "Needs you" count can
 * include these, and renders this inside that group — which is why there is no card, no heading
 * and no collapsing here. Rows match the dash idiom.
 */
export const ReviewQueue: React.FC<{ claims: TaskClaim[]; coupons: Redemption[] }> = ({ claims, coupons }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (claims.length === 0 && coupons.length === 0) return null;

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id); setError('');
    try { await fn(); } catch (err) { setError(serviceErrorMessage(err)); } finally { setBusy(null); }
  };

  const yes = 'p-2 rounded-lg bg-badge-win/15 text-badge-win hover:bg-badge-win/25 disabled:opacity-50 shrink-0';
  const no = 'p-2 rounded-lg bg-badge-loss/15 text-badge-loss hover:bg-badge-loss/25 disabled:opacity-50 shrink-0';

  return (
    <>
      {claims.map((c) => (
        <div key={c.id} className="rounded-2xl bg-fg/5 p-3">
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="min-w-0 truncate text-sm font-bold text-fg">{c.user_name} — {CLAIM_LABEL[c.type]}</p>
              <p className="mt-0.5 truncate text-xs text-fg/70">
                {c.type === 'volunteer' && c.event_title}
                {c.type === 'ambassador' && c.invitee_name}
                {c.type === 'host' && [c.meetup_title, c.meetup_date].filter(Boolean).join(' · ')}
              </p>
              {c.note && <p className="truncate text-xs text-fg/70">{c.note}</p>}
            </div>
            <button disabled={busy === c.id} onClick={() => run(c.id, () => reviewClaim(c.id, true))}
              className={yes} aria-label={`Approve ${c.user_name}'s claim`}>
              <Check className="w-4 h-4" />
            </button>
            <button disabled={busy === c.id} onClick={() => run(c.id, () => reviewClaim(c.id, false))}
              className={no} aria-label={`Reject ${c.user_name}'s claim`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      {/* A cancel request approves into a refund; a flag is resolved by burning the coupon (it was
          used) or declining, which puts it back to active. A coupon whose booking was cancelled
          only asks for a refund, and declining keeps its points. */}
      {coupons.map((r) => {
        const cancelling = r.status === 'cancel_requested';
        const booking = !!r.booking_id;
        return (
          <div key={r.code} className="rounded-2xl bg-fg/5 p-3">
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="min-w-0 truncate text-sm font-bold text-fg">
                  <span className="font-mono tracking-wider">{r.code}</span> — {booking ? 'refund requested' : cancelling ? 'cancel requested' : 'flagged'}
                </p>
                <p className="mt-0.5 truncate text-xs text-fg/70">{r.user_name} · {r.offer} · {r.stringer_name}</p>
                {(r.cancel_reason || r.flag_note) && (
                  <p className="truncate text-xs text-fg/70">{r.cancel_reason || r.flag_note}</p>
                )}
              </div>
              <button
                disabled={busy === r.code}
                onClick={() => run(r.code, () => (
                  cancelling ? reviewRedemption({ code: r.code, approve: true }) : markCouponUsed({ code: r.code })
                ))}
                className={yes}
                aria-label={booking ? 'Approve the refund' : cancelling ? 'Approve cancellation and refund' : 'Mark coupon used'}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                disabled={busy === r.code}
                onClick={() => run(r.code, () => reviewRedemption({ code: r.code, approve: false }))}
                className={no}
                aria-label={booking ? 'Decline the refund' : 'Decline, leave the coupon active'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-fg/70">
              {booking
                ? `Approving returns ${r.points_cost} points. Declining keeps them spent.`
                : cancelling
                  ? `Approving refunds ${r.points_cost} points. Declining leaves the coupon active.`
                  : 'Approving marks it used. Declining puts it back to active.'}
            </p>
          </div>
        );
      })}

      {error && <p role="alert" className="text-xs text-badge-loss">{error}</p>}
    </>
  );
};
