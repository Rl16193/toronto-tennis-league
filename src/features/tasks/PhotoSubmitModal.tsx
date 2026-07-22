import React, { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, ImageUp } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import { loadCourtList } from './courtList';
import { RACQUET_BUCKETS, ReportType, RacquetBucket, submitPhotoReport, waitEstimateFor } from './photoReportService';

const TYPE_OPTIONS: { id: ReportType; label: string }[] = [
  { id: 'condition', label: 'Suggest an improvement' },
  { id: 'waitingBoard', label: 'Waiting board information' },
  { id: 'queue', label: 'Live racquet queue' },
];

// One photo form for all three photo task types. Two explicit choices: "Take Photo" uses
// `capture="environment"` to open the camera directly; "Upload" has no capture attribute so it
// opens the gallery / file picker. Players pick whichever they want.
export const PhotoSubmitModal: React.FC<{ onClose: () => void; presetType?: ReportType }> = ({ onClose, presetType }) => {
  const { user, profile } = useAuth();
  const [type, setType] = useState<ReportType>(presetType ?? 'condition');
  const [courts, setCourts] = useState<string[]>([]);
  const [court, setCourt] = useState('');
  const [courtSearch, setCourtSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [bucket, setBucket] = useState<RacquetBucket | ''>('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadCourtList().then((list) => setCourts([...new Set(list.map((c) => c.dropdown))].sort((a, b) => a.localeCompare(b))));
  }, []);

  const matches = useMemo(() => {
    const q = courtSearch.trim().toLowerCase();
    if (!q) return courts.slice(0, 8);
    return courts.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [courts, courtSearch]);

  const handleSubmit = async () => {
    if (!user) return;
    if (!court) { setError('Please select a court.'); return; }
    if (!file) { setError('Please add a photo.'); return; }
    if (type === 'queue' && !bucket) { setError('Please estimate how many racquets are on the board.'); return; }

    setSubmitting(true);
    setError('');
    try {
      await submitPhotoReport({
        uid: user.uid,
        userName: profile?.user.name || '',
        type,
        courtName: court,
        file,
        note,
        racquetBucket: type === 'queue' ? (bucket as RacquetBucket) : undefined,
        onProgress: setProgress,
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your photo. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet onClose={onClose} title="Submit a Photo" maxWidthClassName="max-w-md">
      <div className="p-6 pt-2 space-y-5">
        {success ? (
          <div className="text-center space-y-4 py-6">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Thanks!</h3>
              <p className="text-white/60 text-sm">
                {type === 'queue'
                  ? `Estimated wait: ${waitEstimateFor(bucket as RacquetBucket)}.`
                  : 'An organizer will review it shortly.'}
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3">{error}</div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest">What is it?</p>
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => { setType(o.id); setBucket(''); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      type === o.id ? 'bg-clay text-white border-clay' : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 relative">
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Which court?</p>
              <input
                type="text"
                placeholder="Search courts…"
                value={court || courtSearch}
                onChange={(e) => { setCourt(''); setCourtSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
              />
              {showDropdown && matches.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-10 max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-tennis-dark/95 p-1 shadow-2xl">
                  {matches.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onMouseDown={() => { setCourt(c); setCourtSearch(''); setShowDropdown(false); }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-white hover:bg-clay/20 transition-colors"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {type === 'queue' && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-white/50 uppercase tracking-widest">How many racquets on the board?</p>
                <div className="flex flex-col gap-2">
                  {RACQUET_BUCKETS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBucket(b.id)}
                      className={`text-left rounded-2xl border px-4 py-2.5 transition-colors ${
                        bucket === b.id ? 'bg-clay/15 border-clay text-white' : 'bg-white/5 border-white/10 text-white/70 hover:border-white/30'
                      }`}
                    >
                      <span className="text-sm font-bold">{b.label}</span>
                      <span className="text-xs text-white/50 ml-2">≈ {b.wait}</span>
                      {b.note && bucket === b.id && <p className="text-[11px] text-white/40 mt-1">{b.note}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Photo</p>
              <div className="grid grid-cols-2 gap-2">
                {/* Take Photo — opens the camera directly on mobile. */}
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-white/20 cursor-pointer hover:border-white/40 transition-colors">
                  <Camera className="w-5 h-5 text-white/50 shrink-0" />
                  <span className="text-sm text-white/70">Take Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
                {/* Upload — opens the gallery / file picker (no capture). */}
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-white/20 cursor-pointer hover:border-white/40 transition-colors">
                  <ImageUp className="w-5 h-5 text-white/50 shrink-0" />
                  <span className="text-sm text-white/70">Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </div>
              {file && (
                <p className="flex items-center gap-1.5 text-xs text-white/60 pt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="truncate">{file.name}</span>
                </p>
              )}
              {submitting && (
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-clay rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest">
                {type === 'condition' ? 'Describe the Issue' : 'Note (optional)'}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white placeholder-gray-500 text-sm outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
              />
            </div>

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
