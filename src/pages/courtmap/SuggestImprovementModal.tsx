import React, { useMemo, useRef, useState } from 'react';
import { ImagePlus, CheckCircle2 } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Input } from '../../components/Input';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { track } from '../../lib/analytics';

type Props = {
  courtNames: string[];
  onClose: () => void;
  // When launched from a specific court's map pop-up: pre-fill the court name in the text box
  // and block the "Website" option (the suggestion is tied to a real court).
  presetCourt?: string;
};

const TYPE_OPTIONS = [
  { value: 'existing_website', label: 'Website' },
  { value: 'infrastructure', label: 'Infrastructure upgrades' },
  { value: 'more_courts', label: 'Need more courts' },
  { value: 'lights', label: 'Need lights' },
  { value: 'wait_times', label: 'Unclear wait-time instructions' },
  { value: 'other', label: 'Other' },
] as const;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;

export const SuggestImprovementModal: React.FC<Props> = ({ courtNames, onClose, presetCourt }) => {
  const { user } = useAuth();

  const [types, setTypes] = useState<string[]>([]);
  const [selectedCourt, setSelectedCourt] = useState(presetCourt ?? '');
  const [courtSearch, setCourtSearch] = useState(presetCourt ?? '');
  const [showCourtDropdown, setShowCourtDropdown] = useState(false);
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const courtInputRef = useRef<HTMLInputElement>(null);

  const courtDisabled = types.includes('existing_website');
  // Court-specific mode (launched from a court pop-up): the Website option doesn't apply.
  const websiteBlocked = !!presetCourt;

  const allCourts = useMemo(
    () => [...new Set(courtNames)].sort((a, b) => a.localeCompare(b)),
    [courtNames],
  );

  const courtMatches = useMemo(() => {
    const q = courtSearch.trim().toLowerCase();
    if (!q) return allCourts.slice(0, 8);
    return allCourts.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [allCourts, courtSearch]);

  const toggleType = (value: string) => {
    if (value === 'existing_website') {
      if (websiteBlocked) return;
      if (types.includes('existing_website')) {
        setTypes([]);
      } else {
        setTypes(['existing_website']);
        setSelectedCourt('');
        setCourtSearch('');
      }
    } else {
      const without = types.filter((t) => t !== 'existing_website');
      setTypes(without.includes(value) ? without.filter((t) => t !== value) : [...without, value]);
    }
  };

  const selectCourt = (name: string) => {
    setSelectedCourt(name);
    setCourtSearch(name);
    setShowCourtDropdown(false);
  };

  const clearCourt = () => {
    setSelectedCourt('');
    setCourtSearch('');
    courtInputRef.current?.focus();
  };

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES);
    if (!files.length) return;
    if (files.find((f) => !f.type.startsWith('image/'))) { setError('Please choose image files only.'); return; }
    if (files.find((f) => f.size > MAX_IMAGE_BYTES)) { setError('Each image must be under 5 MB.'); return; }
    setError('');
    setImageFiles(files);
  };

  const handleSubmit = async () => {
    if (types.length === 0) { setError('Please select what the improvement is about.'); return; }
    if (!courtDisabled && !selectedCourt) { setError('Please select a court.'); return; }
    if (!description.trim()) { setError('Please describe the issue.'); return; }

    setSubmitting(true);
    setError('');
    setUploadProgress(0);

    try {
      const imagePaths = imageFiles.map((file, i) => {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        return `court_suggestions/${user?.uid ?? 'anon'}/${Date.now()}_${i}_${safe}`;
      });

      await addDoc(collection(db, 'court_suggestions'), {
        types,
        court: courtDisabled ? '' : selectedCourt,
        description: description.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        user_id: user?.uid ?? null,
        ...(imagePaths.length > 0 ? { image_paths: imagePaths, image_status: 'pending' } : {}),
        status: 'open',
        created_at: new Date().toISOString(),
      });

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(ref(storage, imagePaths[i]), file, { contentType: file.type });
          task.on(
            'state_changed',
            (snap) => setUploadProgress(Math.round(((i + snap.bytesTransferred / snap.totalBytes) / imageFiles.length) * 100)),
            reject,
            resolve,
          );
        });
      }
      if (imageFiles.length > 0) setUploadProgress(100);

      track('court_map_interaction', { interaction_type: 'suggest_improvement', suggestion_types: types.join(',') });
      setSuccess(true);
    } catch (err) {
      console.error('Suggestion submit failed:', err);
      setError('Could not submit your suggestion. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet onClose={onClose} maxWidthClassName="max-w-lg">
      <div className="p-6 space-y-5">
        <div className="pr-10">
          <h2 className="text-lg font-bold text-white">Suggest an Improvement</h2>
        </div>

        {success ? (
          <div className="text-center space-y-4 py-8">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">Thank you!</h3>
              <p className="text-white/60 text-sm">Your suggestion has been sent to the organizers.</p>
            </div>
            <Button variant="outline" className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3">
                {error}
              </div>
            )}

            {/* What's It About */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest">What's It About?</p>
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map((o) => {
                  const blocked = o.value === 'existing_website' && websiteBlocked;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleType(o.value)}
                      disabled={blocked}
                      title={blocked ? 'Not applicable for a specific court' : undefined}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        blocked
                          ? 'bg-white/[0.03] text-white/20 border-white/5 cursor-not-allowed'
                          : types.includes(o.value)
                            ? 'bg-clay text-white border-clay'
                            : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Court picker */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Court</p>
                {!courtDisabled && (
                  <span className="text-[10px] text-white/30">Select one court per suggestion</span>
                )}
              </div>

              <div className="relative">
                <input
                  ref={courtInputRef}
                  type="text"
                  disabled={courtDisabled}
                  placeholder={courtDisabled ? 'Not applicable for website suggestions' : 'Search courts by name…'}
                  value={courtDisabled ? '' : courtSearch}
                  onChange={(e) => { setCourtSearch(e.target.value); setSelectedCourt(''); setShowCourtDropdown(true); }}
                  onFocus={() => { if (!courtDisabled) setShowCourtDropdown(true); }}
                  onBlur={() => setTimeout(() => setShowCourtDropdown(false), 150)}
                  className={`w-full rounded-2xl px-4 py-2.5 pr-10 text-sm border outline-none transition-all ${
                    courtDisabled
                      ? 'bg-white/[0.03] border-white/5 text-white/20 cursor-not-allowed placeholder-white/15'
                      : 'bg-tennis-surface/50 border-white/10 text-white placeholder-gray-500 focus:border-clay focus:ring-2 focus:ring-clay/20'
                  }`}
                />
                {!courtDisabled && courtSearch && (
                  <button
                    type="button"
                    onClick={clearCourt}
                    aria-label="Clear court"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors text-sm"
                  >
                    ✕
                  </button>
                )}
                {showCourtDropdown && !courtDisabled && courtMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-10 max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-tennis-dark/95 p-1 shadow-2xl">
                    {courtMatches.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onMouseDown={() => selectCourt(c)}
                        className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:bg-clay/20"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest">Describe the Issue</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Tell us what could be better…"
                className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white placeholder-gray-500 text-sm focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none transition-all"
              />
            </div>

            <Input
              label="Email"
              type="email"
              placeholder="So we can follow up"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {/* Photos */}
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Photos</p>
              <p className="text-xs text-white/40 leading-relaxed">
                Please provide a zoomed in photo of the issue and a wide angle shot of the court.
              </p>
              <label className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-white/20 cursor-pointer hover:border-white/40 transition-colors">
                <ImagePlus className="w-5 h-5 text-white/50 shrink-0" />
                <span className="text-sm text-white/70 truncate">
                  {imageFiles.length === 0
                    ? `Add up to ${MAX_IMAGES} photos`
                    : imageFiles.length === 1
                      ? imageFiles[0].name
                      : `${imageFiles.length} photos selected`}
                </span>
                <input type="file" accept="image/*" multiple onChange={onPickImages} className="hidden" />
              </label>
              {submitting && imageFiles.length > 0 && (
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-clay rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
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
