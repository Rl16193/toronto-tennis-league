import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Check, X, ChevronDown } from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import type { TaskClaim } from './claimService';
import { reviewClaim, reviewPhotoReport } from './claimService';

interface PhotoReport {
  id: string;
  type: 'condition' | 'waitingBoard' | 'queue';
  court_name: string;
  user_name: string;
  photo_path: string;
  note?: string;
  status: string;
}

const CLAIM_LABEL: Record<TaskClaim['type'], string> = {
  volunteer: 'Volunteered',
  ambassador: 'Invited a player',
  host: 'Hosted a meetup',
};

const PhotoThumb: React.FC<{ path: string }> = ({ path }) => {
  const [url, setUrl] = useState('');
  useEffect(() => { getDownloadURL(ref(storage, path)).then(setUrl).catch(() => {}); }, [path]);
  if (!url) return <div className="w-14 h-14 rounded-xl bg-white/5 shrink-0" />;
  return <img src={url} alt="Submitted" className="w-14 h-14 rounded-xl object-cover shrink-0" />;
};

// Organizer-only: everything waiting for approval — photo reports and volunteer/ambassador/host
// claims — in one place, matching what the pending-review notification links to.
export const ReviewQueue: React.FC<{ defaultOpen?: 'photos' | 'claims' | null }> = ({ defaultOpen }) => {
  const [photos, setPhotos] = useState<PhotoReport[]>([]);
  const [claims, setClaims] = useState<TaskClaim[]>([]);
  const [open, setOpen] = useState<'photos' | 'claims' | null>(defaultOpen ?? null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const unsub1 = onSnapshot(query(collection(db, 'court_reports'), where('status', '==', 'pending')), (snap) =>
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PhotoReport))));
    const unsub2 = onSnapshot(query(collection(db, 'task_claims'), where('status', '==', 'pending')), (snap) =>
      setClaims(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskClaim))));
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => { if (defaultOpen) setOpen(defaultOpen); }, [defaultOpen]);

  if (photos.length === 0 && claims.length === 0) return null;

  const approvePhoto = async (id: string) => { setBusy(id); try { await reviewPhotoReport(id, true); } finally { setBusy(null); } };
  const rejectPhoto = async (id: string) => { setBusy(id); try { await reviewPhotoReport(id, false); } finally { setBusy(null); } };
  const approveClaim = async (id: string) => { setBusy(id); try { await reviewClaim(id, true); } finally { setBusy(null); } };
  const rejectClaim = async (id: string) => { setBusy(id); try { await reviewClaim(id, false); } finally { setBusy(null); } };

  return (
    <div className="rounded-3xl border border-amber-400/30 bg-amber-400/5 p-5 mb-3 space-y-3">
      <p className="text-xs font-bold text-amber-300 uppercase tracking-widest">Needs your review</p>

      {photos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(open === 'photos' ? null : 'photos')}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-white">{photos.length} photo{photos.length > 1 ? 's' : ''} to review</span>
            <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open === 'photos' ? 'rotate-180' : ''}`} />
          </button>
          {open === 'photos' && (
            <div className="mt-2 space-y-2">
              {photos.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-tennis-surface/40 px-3 py-2.5">
                  <PhotoThumb path={p.photo_path} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{p.court_name}</p>
                    <p className="text-xs text-white/50 truncate">{p.type === 'condition' ? 'Suggested improvement' : 'Waiting board'} · {p.user_name}</p>
                    {p.note && <p className="text-xs text-white/40 truncate">{p.note}</p>}
                  </div>
                  <button disabled={busy === p.id} onClick={() => approvePhoto(p.id)} className="p-2 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25" aria-label="Approve">
                    <Check className="w-4 h-4" />
                  </button>
                  <button disabled={busy === p.id} onClick={() => rejectPhoto(p.id)} className="p-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25" aria-label="Reject">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {claims.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(open === 'claims' ? null : 'claims')}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-white">{claims.length} task{claims.length > 1 ? 's' : ''} need approval</span>
            <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open === 'claims' ? 'rotate-180' : ''}`} />
          </button>
          {open === 'claims' && (
            <div className="mt-2 space-y-2">
              {claims.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-tennis-surface/40 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{c.user_name} — {CLAIM_LABEL[c.type]}</p>
                    <p className="text-xs text-white/50 truncate">
                      {c.type === 'volunteer' && c.event_title}
                      {c.type === 'ambassador' && c.invitee_name}
                      {c.type === 'host' && [c.meetup_title, c.meetup_date].filter(Boolean).join(' · ')}
                    </p>
                    {c.note && <p className="text-xs text-white/40 truncate">{c.note}</p>}
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
