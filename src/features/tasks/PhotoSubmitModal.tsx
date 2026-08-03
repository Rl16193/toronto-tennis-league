import React, { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, ImageUp, X } from 'lucide-react';
import { addDoc, collection } from 'firebase/firestore';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { loadCourtList } from './courtList';
import type { CsvCourt } from '../../pages/courtmap/courtMapUtils';
import { MAX_PHOTOS, ReportType, submitPhotoReport } from './photoReportService';

const TYPE_OPTIONS: { id: ReportType; label: string }[] = [
  { id: 'condition', label: 'Improvements/Poor Conditions' },
  { id: 'queue', label: 'Live Queue' },
  { id: 'waitingBoard', label: 'Waiting Board' },
];

// Static wait-time reference tables — keyed by "courts per waiting board" (a fixed property of
// the queue setup, not the court's total court count), not computed from the racquet count
// entered. Locations with 4+ courts share one board across 4 courts; smaller locations share one
// board across 2 courts.
type WaitBand = { range: string; wait: string };

const WAIT_TABLE_4: WaitBand[] = [
  { range: '1–4', wait: '10–40 mins' },
  { range: '5–8', wait: '40–70 mins' },
  { range: '>8', wait: '90 mins' },
];

const WAIT_TABLE_2: WaitBand[] = [
  { range: '1–2', wait: '10–40 mins' },
  { range: '3–4', wait: '40–70 mins' },
  { range: '4–5', wait: '70–100 mins' },
  { range: '>5', wait: "It's going to take a while" },
];

function queueWaitTable(numCourts: number): { courtsPerBoard: 2 | 4; bands: WaitBand[] } {
  return numCourts >= 4 ? { courtsPerBoard: 4, bands: WAIT_TABLE_4 } : { courtsPerBoard: 2, bands: WAIT_TABLE_2 };
}

// "Submit a Photo" — the single unified report flow (merges the former "Report"/"Submit a Photo"
// and "Suggest an Improvement" flows into one). Photo(s) + court + type + an optional note; no
// organizer review — every report auto-approves immediately (automated image moderation still
// runs and can remove an unsafe photo after the fact). Anonymous submitters are welcome;
// logged-out reporters may optionally leave an email to get updates.
export const PhotoSubmitModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user, profile } = useAuth();
  const [type, setType] = useState<ReportType>('condition');
  const [courtList, setCourtList] = useState<CsvCourt[]>([]);
  const [courts, setCourts] = useState<string[]>([]);
  const [court, setCourt] = useState('');
  const [courtSearch, setCourtSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [note, setNote] = useState('');
  const [racquetsInQueue, setRacquetsInQueue] = useState('');
  const [waitingBoards, setWaitingBoards] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    loadCourtList().then((list) => {
      setCourtList(list);
      setCourts([...new Set(list.map((c) => c.dropdown))].sort((a, b) => a.localeCompare(b)));
    });
  }, []);

  const courtMatches = useMemo(() => {
    const q = courtSearch.trim().toLowerCase();
    if (!q) return courts.slice(0, 8);
    return courts.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [courts, courtSearch]);

  const selectedCourtNumCourts = useMemo(
    () => courtList.find((c) => c.dropdown === court)?.numCourts ?? null,
    [courtList, court],
  );

  const waitTable = useMemo(
    () => (selectedCourtNumCourts != null ? queueWaitTable(selectedCourtNumCourts) : null),
    [selectedCourtNumCourts],
  );

  const addFiles = (picked: File[]) => {
    if (picked.length === 0) return;
    if (picked.find((f) => !f.type.startsWith('image/'))) { setError('Please choose image files only.'); return; }
    if (picked.find((f) => f.size > 5 * 1024 * 1024)) { setError('Each image must be under 5 MB.'); return; }
    setError('');
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!court) { setError('Please select a court.'); return; }
    if (!note.trim()) { setError('Please add a note.'); return; }
    if (type === 'queue' && !racquetsInQueue.trim()) { setError('Please enter the number of racquets in queue.'); return; }
    if (type === 'waitingBoard' && !waitingBoards.trim()) { setError('Please enter the number of waiting boards.'); return; }

    setSubmitting(true);
    setError('');
    try {
      await submitPhotoReport({
        uid: user?.uid ?? null,
        userName: profile?.user.name || '',
        type,
        courtName: court,
        files,
        note,
        ...(type === 'queue' && racquetsInQueue.trim() ? { racquetsInQueue: Number(racquetsInQueue) } : {}),
        ...(type === 'waitingBoard' && waitingBoards.trim() ? { waitingBoards: Number(waitingBoards) } : {}),
        onProgress: setProgress,
      });
      // Logged-out reporter left an email → add to the mailing list (best-effort, never blocks).
      if (!user && email.trim()) {
        addDoc(collection(db, 'mailing_list'), {
          email: email.trim(),
          source: 'submit_a_photo',
          created_at: new Date().toISOString(),
        }).catch(() => {});
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet onClose={onClose} title="Submit a Report" maxWidthClassName="max-w-md">
      <div className="p-6 pt-2 space-y-5">
        {success ? (
          <div className="text-center space-y-4 py-6">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-fg">Thanks!</h3>
              <p className="text-fg/60 text-sm">Your submission has been recorded.</p>
            </div>

            {!user && (
              <div className="text-left rounded-2xl bg-fg/[0.03] border border-fg/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-fg">Want to stay in the loop?</p>
                <p className="text-xs text-fg/50">Leave your email to hear about upcoming events. Totally optional.</p>
                <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3">{error}</div>
            )}

            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setType(o.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                    type === o.id ? 'bg-clay text-white border-clay' : 'bg-white text-ink border-fg hover:bg-white/90'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 relative">
              <p className="text-xs font-bold text-fg/50 uppercase tracking-widest">Select Court <span className="text-clay">*</span></p>
              <input
                type="text"
                placeholder="Search courts…"
                value={court || courtSearch}
                onChange={(e) => { setCourt(''); setCourtSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-2.5 text-sm text-fg placeholder-gray-500 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
              />
              {showDropdown && courtMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-10 max-h-48 overflow-y-auto rounded-2xl border border-fg/10 bg-tennis-dark/95 p-1 shadow-2xl">
                  {courtMatches.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onMouseDown={() => { setCourt(c); setCourtSearch(''); setShowDropdown(false); }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-fg hover:bg-clay/20 transition-colors"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-fg/50 uppercase tracking-widest">Photos</p>
                <span className="text-[10px] text-fg/30">Up to {MAX_PHOTOS}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* Take Photo — opens the camera directly on mobile. */}
                <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-fg/20 cursor-pointer hover:border-fg/40 transition-colors ${files.length >= MAX_PHOTOS ? 'opacity-40 pointer-events-none' : ''}`}>
                  <Camera className="w-5 h-5 text-fg/50 shrink-0" />
                  <span className="text-sm text-fg/70">Take Photo</span>
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} className="hidden" />
                </label>
                {/* Upload — opens the gallery / file picker; multi-select. */}
                <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-fg/20 cursor-pointer hover:border-fg/40 transition-colors ${files.length >= MAX_PHOTOS ? 'opacity-40 pointer-events-none' : ''}`}>
                  <ImageUp className="w-5 h-5 text-fg/50 shrink-0" />
                  <span className="text-sm text-fg/70">Upload</span>
                  <input type="file" accept="image/*" multiple onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} className="hidden" />
                </label>
              </div>
              {files.length > 0 && (
                <div className="space-y-1 pt-0.5">
                  {files.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-1.5 text-xs text-fg/60">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                      <button type="button" onClick={() => removeFile(i)} aria-label="Remove photo" className="text-fg/40 hover:text-fg transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {submitting && (
                <div className="w-full h-1.5 rounded-full bg-fg/10 overflow-hidden">
                  <div className="h-full bg-clay rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>

            {type === 'waitingBoard' && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-fg/50 uppercase tracking-widest">How many waiting boards? <span className="text-clay">*</span></p>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={waitingBoards}
                  onChange={(e) => setWaitingBoards(e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-2.5 text-sm text-fg placeholder-gray-500 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
                />
              </div>
            )}

            {type === 'queue' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-fg/50 uppercase tracking-widest">Racquets in Queue <span className="text-clay">*</span></p>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={racquetsInQueue}
                    onChange={(e) => setRacquetsInQueue(e.target.value)}
                    placeholder="e.g. 3"
                    className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-2.5 text-sm text-fg placeholder-gray-500 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
                  />
                </div>

                {waitTable && (
                  <div className="rounded-2xl bg-fg/[0.03] border border-fg/10 p-3 space-y-2">
                    <p className="text-xs font-bold text-fg/50 uppercase tracking-widest">Approximate Wait Time</p>
                    <p className="text-[11px] text-fg/40">Courts per waiting board: {waitTable.courtsPerBoard}</p>
                    <div className="space-y-1">
                      {waitTable.bands.map((b) => (
                        <div key={b.range} className="flex items-center justify-between text-xs">
                          <span className="text-fg/60">{b.range} racquets</span>
                          <span className="font-semibold text-fg">{b.wait}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-fg/50 uppercase tracking-widest">Note <span className="text-clay">*</span></label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Tell us what's going on…"
                className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-3 text-fg placeholder-gray-500 text-sm outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
              />
            </div>

            {/* Logged-out reporters can opt into updates — totally optional, stays anonymous otherwise. */}
            {!user && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-fg/50 uppercase tracking-widest">Get updates (optional)</label>
                <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button onClick={handleSubmit} isLoading={submitting} className="flex-1">Submit</Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};
