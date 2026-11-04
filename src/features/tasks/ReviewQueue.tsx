import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { TaskClaim } from './claimService';
import { reviewClaim } from './claimService';
import type { BookingRow } from '../services/types';
import { reviewRedemption, serviceErrorMessage } from '../services/servicesApi';

const CLAIM_LABEL: Record<TaskClaim['category'], string> = {
  volunteer: 'Volunteered',
  ambassador: 'Invited a player',
  host: 'Hosted a meetup',
};

/**
 * Volunteer/ambassador/host claims waiting for approval, plus cancelled bookings paid by points
 * whose refund an organizer decides. Photo reports auto-approve, so they are never here.
 *
 * Presentation only. The Organizer Dash owns both listeners, so its single "Needs you" count can
 * include these, and renders this inside that group — which is why there is no card, no heading
 * and no collapsing here. Rows match the dash idiom.
 */
export const ReviewQueue: React.FC<{ claims: TaskClaim[]; coupons: BookingRow[] }> = ({ claims, coupons }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (claims.length === 0 && coupons.length === 0) return null;

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id); setError('');
    try { await fn(); } catch (err) { setError(serviceErrorMessage(err)); } finally { setBusy(null); }
  };

  const yes = 'p-2 rounded-2xl bg-badge-win/15 text-badge-win hover:bg-badge-win/25 disabled:opacity-50 shrink-0';
  const no = 'p-2 rounded-2xl bg-badge-loss/15 text-badge-loss hover:bg-badge-loss/25 disabled:opacity-50 shrink-0';

  return (
    <>
      {claims.map((c) => (
        <div key={c.id} className="rounded-2xl bg-fg/5 p-3">
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="min-w-0 truncate text-sm font-bold text-fg">{c.user_name} — {CLAIM_LABEL[c.category]}</p>
              <p className="mt-0.5 truncate text-xs text-fg/70">
                {c.category === 'volunteer' && c.event_title}
                {c.category === 'ambassador' && c.invitee_name}
                {c.category === 'host' && [c.meetup_title, c.meetup_date].filter(Boolean).join(' · ')}
              </p>
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

      {/* Approving returns the points; declining keeps them spent (functions/rewards.js). */}
      {coupons.map((b) => (
        <div key={b.id} className="rounded-2xl bg-fg/5 p-3">
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="min-w-0 truncate text-sm font-bold text-fg">
                <span className="font-mono tracking-wider">{b.redemption_code}</span> — refund requested
              </p>
              <p className="mt-0.5 truncate text-xs text-fg/70">{b.user_name} · {b.offer} · {b.providerName}</p>
              {b.cancel_reason && <p className="truncate text-xs text-fg/70">{b.cancel_reason}</p>}
            </div>
            <button
              disabled={busy === b.id}
              onClick={() => run(b.id, () => reviewRedemption({ code: b.redemption_code, approve: true }))}
              className={yes}
              aria-label="Approve the refund"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              disabled={busy === b.id}
              onClick={() => run(b.id, () => reviewRedemption({ code: b.redemption_code, approve: false }))}
              className={no}
              aria-label="Decline the refund"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-1.5 text-xs text-fg/70">Approving returns {b.points} points. Declining keeps them spent.</p>
        </div>
      ))}

      {error && <p role="alert" className="text-xs text-badge-loss">{error}</p>}
    </>
  );
};
