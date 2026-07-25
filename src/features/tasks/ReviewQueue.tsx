import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Check, X, ChevronDown } from 'lucide-react';
import { db } from '../../lib/firebase';
import type { TaskClaim } from './claimService';
import { reviewClaim } from './claimService';

const CLAIM_LABEL: Record<TaskClaim['type'], string> = {
  volunteer: 'Volunteered',
  ambassador: 'Invited a player',
  host: 'Hosted a meetup',
};

// Organizer-only: volunteer/ambassador/host claims waiting for approval. Photo reports
// ("Submit a Photo") no longer need review — they auto-approve at creation.
export const ReviewQueue: React.FC<{ defaultOpen?: 'claims' | null }> = ({ defaultOpen }) => {
  const [claims, setClaims] = useState<TaskClaim[]>([]);
  const [open, setOpen] = useState<'claims' | null>(defaultOpen ?? null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'task_claims'), where('status', '==', 'pending')), (snap) =>
      setClaims(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskClaim))));
    return () => unsub();
  }, []);

  useEffect(() => { if (defaultOpen) setOpen(defaultOpen); }, [defaultOpen]);

  if (claims.length === 0) return null;

  const approveClaim = async (id: string) => { setBusy(id); try { await reviewClaim(id, true); } finally { setBusy(null); } };
  const rejectClaim = async (id: string) => { setBusy(id); try { await reviewClaim(id, false); } finally { setBusy(null); } };

  return (
    <div className="rounded-3xl border border-amber-400/30 bg-amber-400/5 p-5 mb-3 space-y-3">
      <p className="text-xs font-bold text-amber-300 uppercase tracking-widest">Needs your review</p>

      {claims.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(open === 'claims' ? null : 'claims')}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-fg">{claims.length} task{claims.length > 1 ? 's' : ''} need approval</span>
            <ChevronDown className={`w-4 h-4 text-fg/40 transition-transform ${open === 'claims' ? 'rotate-180' : ''}`} />
          </button>
          {open === 'claims' && (
            <div className="mt-2 space-y-2">
              {claims.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-tennis-surface/40 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg truncate">{c.user_name} — {CLAIM_LABEL[c.type]}</p>
                    <p className="text-xs text-fg/50 truncate">
                      {c.type === 'volunteer' && c.event_title}
                      {c.type === 'ambassador' && c.invitee_name}
                      {c.type === 'host' && [c.meetup_title, c.meetup_date].filter(Boolean).join(' · ')}
                    </p>
                    {c.note && <p className="text-xs text-fg/40 truncate">{c.note}</p>}
                  </div>
                  <button disabled={busy === c.id} onClick={() => approveClaim(c.id)} className="p-2 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25" aria-label="Approve">
                    <Check className="w-4 h-4" />
                  </button>
                  <button disabled={busy === c.id} onClick={() => rejectClaim(c.id)} className="p-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25" aria-label="Reject">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
