import React, { useEffect, useRef, useState } from 'react';
import { Camera, Pencil, X, Check, MapPin, Star, Loader2, Users, Award } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import IntlTelInput from '@intl-tel-input/react/with-utils';
import 'intl-tel-input/styles';
import { useAuth } from '../../../context/AuthContext';
import { storage } from '../../../lib/firebase';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { RacquetIcon } from '../../../components/RacquetIcon';
import { SELECTABLE_SKILL_LEVELS, SKILL_DESCRIPTIONS, skillTier, leagueDivision } from '../../../utils/skillLevels';
import {
  defaultCourtOptions, extractCourtsWithCoords, extractDropdownCourts,
  getCourtSuggestions, mergeCourtOptions,
} from '../../signup/utils/courtSearch';
import { getZoneWithBorderCheck } from '../../../utils/zones';
import { formatPhone } from '../../../utils/formatPhone';
import { AGE_BRACKETS } from '../../../types';
import { BadgePicker } from '../../tasks/BadgePicker';

type Actions = {
  updateName: (name: string) => Promise<boolean>;
  updatePhone: (phone: string) => Promise<boolean>;
  updateWhatsappContact: (whatsappContact: string, sameAsPhone: boolean) => Promise<boolean>;
  updateBio: (bio: string) => Promise<boolean>;
  updateAvatar: (url: string) => Promise<boolean>;
  updateSkills: (skill: number, pref: string) => Promise<boolean>;
  updateLeagueAge: (league: "Men's" | "Women's" | '', ageBracket: string, visible: boolean) => Promise<boolean>;
  updateDisplayBadges: (badgeIds: string[]) => Promise<boolean>;
  updatePreferredCourts: (courts: string[], zone: string) => Promise<boolean>;
  updateFavouritePlayers: (players: string[]) => Promise<boolean>;
  changeEmail: (email: string, password: string) => Promise<boolean | undefined>;
  refreshEmailChange: () => Promise<void>;
};

interface Props {
  actions: Actions;
  updateLoading: boolean;
  message?: { text: string; type: 'success' | 'error' } | null;
}

const FAVOURITE_PLAYERS = ['Jannik Sinner', 'Carlos Alcaraz', 'Rafael Nadal', 'Roger Federer', 'Novak Djokovic'];

const tournamentPref = (skill: number) => (skill < 3 ? 'Beginners' : skill < 4 ? 'Challengers' : 'Masters');


type Row = 'name' | 'phone' | 'whatsapp' | 'bio' | 'skill' | 'league' | 'courts' | 'favourites' | 'email' | null;

const SectionHeader: React.FC<{ icon: React.ReactNode; label: string; editing: boolean; onEdit: () => void; onCancel: () => void }> = ({ icon, label, editing, onEdit, onCancel }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-xs font-bold text-fg/50 uppercase tracking-widest flex items-center gap-1.5">{icon}{label}</span>
    <button type="button" onClick={editing ? onCancel : onEdit} className="text-fg/40 hover:text-fg transition-colors" aria-label={editing ? 'Cancel' : `Edit ${label}`}>
      {editing ? <X className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
    </button>
  </div>
);

export const ProfileInfo: React.FC<Props> = ({ actions, updateLoading, message }) => {
  const { profile } = useAuth();
  const [editing, setEditing] = useState<Row>(null);

  // Court option list + coords (for the court editor + zone recompute), loaded once.
  const [courtOptions, setCourtOptions] = useState<string[]>(defaultCourtOptions);
  const [courtCoords, setCourtCoords] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  useEffect(() => {
    let alive = true;
    fetch('/Tennis Courts Facilities - 4326.csv')
      .then((r) => (r.ok ? r.text() : ''))
      .then((csv) => { if (alive && csv) { setCourtOptions(mergeCourtOptions(extractDropdownCourts(csv))); setCourtCoords(extractCourtsWithCoords(csv)); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Drafts
  const [nameDraft, setNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [waDraft, setWaDraft] = useState('');
  const [waSameAsPhone, setWaSameAsPhone] = useState(false);
  const [waValid, setWaValid] = useState(true);
  const [bioDraft, setBioDraft] = useState('');
  const [skillDraft, setSkillDraft] = useState(2);
  const [leagueDraft, setLeagueDraft] = useState<"Men's" | "Women's" | ''>('');
  const [ageDraft, setAgeDraft] = useState('');
  const [visibleDraft, setVisibleDraft] = useState(false);
  const [courtsDraft, setCourtsDraft] = useState<string[]>([]);
  const [courtInput, setCourtInput] = useState('');
  const [favDraft, setFavDraft] = useState<string[]>([]);
  const [favInput, setFavInput] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  // Avatar upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  if (!profile) return null;
  const { user, stats, preferences } = profile;

  const open = (row: Row) => {
    setNameDraft(user.name);
    setPhoneDraft(user.phone);
    setWaDraft(user.whatsapp_contact ?? '');
    setWaSameAsPhone(!!user.whatsapp_same_as_phone);
    setWaValid(true);
    setBioDraft(user.bio ?? '');
    setSkillDraft(stats.skill_level);
    setLeagueDraft(leagueDivision(stats.league));
    setAgeDraft(user.age_bracket ?? '');
    setVisibleDraft(!!user.profile_details_visible);
    setCourtsDraft(preferences.preferred_courts);
    setFavDraft(preferences.favourite_players);
    setCourtInput(''); setFavInput(''); setEmailDraft(''); setEmailPassword(''); setEmailSent(false);
    setEditing(row);
  };
  const save = async (fn: () => Promise<boolean>) => { if (await fn()) setEditing(null); };

  const computeZone = (courts: string[]): string => {
    const first = courts[0];
    if (!first) return '';
    const c = courtCoords.get(first.trim().toLowerCase());
    if (!c) return preferences.preferred_zone || '';
    return getZoneWithBorderCheck(c.lat, c.lng).primary;
  };

  const courtSuggestions = getCourtSuggestions(courtOptions, courtsDraft, courtInput);
  const addCourt = (court: string) => {
    const t = court.trim();
    if (!t || courtsDraft.includes(t)) return;
    setCourtsDraft([...courtsDraft, t]); setCourtInput('');
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return;
    setAvatarUploading(true);
    try {
      const path = `avatars/${profile.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      const url = await getDownloadURL(ref(storage, path));
      await actions.updateAvatar(url);
    } finally {
      setAvatarUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="rounded-[2.5rem] border border-fg/5 bg-tennis-surface/30 shadow-xl p-5 sm:p-7">
      <h2 className="text-xl font-bold text-fg mb-5">Profile Card</h2>

      {/* Avatar + name/phone/bio, vertical */}
      <div className="flex flex-col items-center gap-4 pb-5 border-b border-fg/5">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-tennis-surface flex items-center justify-center overflow-hidden border border-fg/10">
            {user.avatar
              ? <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <span className="text-4xl font-black text-fg/80">{initial}</span>}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-clay text-fg flex items-center justify-center shadow-lg hover:bg-clay/80 transition-colors"
            aria-label="Upload avatar"
          >
            {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} className="hidden" />
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {/* Name */}
        <div className="py-3">
          <SectionHeader icon={null} label="Name" editing={editing === 'name'} onEdit={() => open('name')} onCancel={() => setEditing(null)} />
          {editing === 'name' ? (
            <div className="mt-2 flex gap-2">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
              <Button size="sm" onClick={() => save(() => actions.updateName(nameDraft))} isLoading={updateLoading}><Check className="w-4 h-4" /></Button>
            </div>
          ) : <p className="text-lg font-bold text-fg mt-0.5">{user.name || '—'}</p>}
        </div>

        {/* Phone */}
        <div className="py-3">
          <SectionHeader icon={null} label="Phone" editing={editing === 'phone'} onEdit={() => open('phone')} onCancel={() => setEditing(null)} />
          {editing === 'phone' ? (
            <div className="mt-2 flex gap-2">
              <Input value={phoneDraft} onChange={(e) => setPhoneDraft(formatPhone(e.target.value))} placeholder="(416)-555-0123" />
              <Button size="sm" onClick={() => save(() => actions.updatePhone(phoneDraft))} isLoading={updateLoading}><Check className="w-4 h-4" /></Button>
            </div>
          ) : <p className="text-lg font-bold text-fg mt-0.5">{user.phone || '—'}</p>}
        </div>

        {/* WhatsApp Contact */}
        <div className="py-3">
          <SectionHeader icon={null} label="WhatsApp Contact" editing={editing === 'whatsapp'} onEdit={() => open('whatsapp')} onCancel={() => setEditing(null)} />
          {editing === 'whatsapp' ? (
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-fg/70">
                <input
                  type="checkbox"
                  checked={waSameAsPhone}
                  onChange={(e) => setWaSameAsPhone(e.target.checked)}
                  className="accent-clay"
                />
                Same as phone number
              </label>
              {!waSameAsPhone && (
                <IntlTelInput
                  value={waDraft}
                  onChangeNumber={setWaDraft}
                  onChangeValidity={setWaValid}
                  initialCountry="ca"
                  separateDialCode
                  inputProps={{
                    placeholder: 'WhatsApp number',
                    className: 'w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-3 text-fg placeholder-gray-500 text-sm focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none',
                  }}
                />
              )}
              <Button
                size="sm"
                onClick={() => save(() => actions.updateWhatsappContact(waDraft, waSameAsPhone))}
                isLoading={updateLoading}
                disabled={!waSameAsPhone && !!waDraft && !waValid}
              >
                Save
              </Button>
            </div>
          ) : (
            <p className="text-lg font-bold text-fg mt-0.5">
              {user.whatsapp_same_as_phone ? 'Same as phone number' : (user.whatsapp_contact || '—')}
            </p>
          )}
        </div>

        {/* Bio */}
        <div className="py-3">
          <SectionHeader icon={null} label="Bio" editing={editing === 'bio'} onEdit={() => open('bio')} onCancel={() => setEditing(null)} />
          {editing === 'bio' ? (
            <div className="mt-2 space-y-2">
              <textarea value={bioDraft} onChange={(e) => setBioDraft(e.target.value)} rows={3} maxLength={300}
                placeholder="Your tennis vibe — play times, rally or games, and any other details?"
                className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-3 text-fg placeholder-gray-500 text-sm focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none" />
              <Button size="sm" onClick={() => save(() => actions.updateBio(bioDraft))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : <p className="text-sm text-fg/70 mt-0.5">{user.bio?.trim() || <span className="text-fg/40">No bio yet.</span>}</p>}
        </div>

        {/* Skill */}
        <div className="py-3">
          <SectionHeader icon={<RacquetIcon className="w-3.5 h-3.5 text-clay" />} label="Skill Level" editing={editing === 'skill'} onEdit={() => open('skill')} onCancel={() => setEditing(null)} />
          {editing === 'skill' ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-clay">{skillDraft}</span>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">{skillTier(skillDraft)}</span>
              </div>
              <input type="range" min={0} max={SELECTABLE_SKILL_LEVELS.length - 1} step={1}
                value={(() => { const i = SELECTABLE_SKILL_LEVELS.indexOf(skillDraft as typeof SELECTABLE_SKILL_LEVELS[number]); return i >= 0 ? i : SELECTABLE_SKILL_LEVELS.length - 1; })()}
                onChange={(e) => setSkillDraft(SELECTABLE_SKILL_LEVELS[Number(e.target.value)])} className="w-full" />
              <p className="text-xs text-fg/60 italic">"{SKILL_DESCRIPTIONS[skillDraft]}"</p>
              <Button size="sm" onClick={() => save(() => actions.updateSkills(skillDraft, tournamentPref(skillDraft)))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-bold text-fg">NTRP {stats.skill_level}</span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">{skillTier(stats.skill_level)}</span>
            </div>
          )}
        </div>

        {/* League & Age */}
        <div className="py-3">
          <SectionHeader icon={<Users className="w-3.5 h-3.5 text-clay" />} label="League & Age" editing={editing === 'league'} onEdit={() => open('league')} onCancel={() => setEditing(null)} />
          {editing === 'league' ? (
            <div className="mt-2 space-y-3">
              <div>
                <label className="block text-xs text-fg/50 mb-1">League you want to participate in</label>
                <select
                  value={leagueDraft}
                  onChange={(e) => setLeagueDraft(e.target.value as "Men's" | "Women's" | '')}
                  className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-3 text-fg text-sm focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none"
                >
                  <option value="">Not set</option>
                  <option value="Men's">Men's</option>
                  <option value="Women's">Women's</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-fg/50 mb-1">Age bracket</label>
                <select
                  value={ageDraft}
                  onChange={(e) => setAgeDraft(e.target.value)}
                  className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-3 text-fg text-sm focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none"
                >
                  <option value="">Not set</option>
                  {AGE_BRACKETS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {/* Seniors opt-in — only offered once the player selects the 55+ age group. */}
              {ageDraft === '55+' && (
                <div className="rounded-2xl border border-clay/30 bg-clay/5 p-3 space-y-2">
                  <p className="text-xs text-fg/70">
                    {user.age_bracket === '55+'
                      ? "You're in the 55+ League — you can join the Seniors draw in singles events."
                      : 'Play in the age-based Seniors (55+) group.'}
                  </p>
                  <Button
                    size="sm"
                    variant="clay"
                    onClick={() => save(() => actions.updateLeagueAge(leagueDraft, '55+', visibleDraft))}
                    isLoading={updateLoading}
                    disabled={user.age_bracket === '55+'}
                  >
                    {user.age_bracket === '55+' ? 'Joined ✓' : 'Join the 55+ League'}
                  </Button>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer text-sm text-fg/70">
                <input type="checkbox" checked={visibleDraft} onChange={(e) => setVisibleDraft(e.target.checked)} className="accent-clay" />
                Make visible to others
              </label>
              <Button size="sm" onClick={() => save(() => actions.updateLeagueAge(leagueDraft, ageDraft, visibleDraft))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {leagueDivision(stats.league) && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70 border border-fg/10">{leagueDivision(stats.league)} League</span>
              )}
              {user.age_bracket && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70 border border-fg/10">{user.age_bracket}</span>
              )}
              {!leagueDivision(stats.league) && !user.age_bracket
                ? <span className="text-sm text-fg/40">Not set.</span>
                : <span className="text-[11px] text-fg/40 ml-1">{user.profile_details_visible ? 'Visible to others' : 'Hidden from others'}</span>}
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="py-3">
          <span className="text-xs font-bold text-fg/50 uppercase tracking-widest flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-clay" />Badges
          </span>
          <BadgePicker
            selected={user.display_badges ?? []}
            onSave={actions.updateDisplayBadges}
            saving={updateLoading}
          />
        </div>

        {/* Preferred Courts */}
        <div className="py-3">
          <SectionHeader icon={<MapPin className="w-3.5 h-3.5 text-clay" />} label="Preferred Courts" editing={editing === 'courts'} onEdit={() => open('courts')} onCancel={() => setEditing(null)} />
          {editing === 'courts' ? (
            <div className="mt-2 space-y-2">
              {courtsDraft.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {courtsDraft.map((c) => (
                    <button key={c} type="button" onClick={() => setCourtsDraft(courtsDraft.filter((x) => x !== c))}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-clay text-fg flex items-center gap-1.5">{c} <span className="opacity-70">✕</span></button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input placeholder="Search courts…" value={courtInput} onChange={(e) => setCourtInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCourt(courtInput); } }} />
                <Button size="sm" variant="clay" className="px-3 shrink-0" onClick={() => addCourt(courtInput)} disabled={!courtInput.trim()}>Add</Button>
              </div>
              {courtSuggestions.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-fg/10 bg-tennis-dark/95 p-1">
                  {courtSuggestions.map((c) => (
                    <button key={c} type="button" onClick={() => addCourt(c)} className="w-full text-left px-3 py-2 text-sm text-fg/80 rounded-lg hover:bg-clay/20">{c}</button>
                  ))}
                </div>
              )}
              <Button size="sm" onClick={() => save(() => actions.updatePreferredCourts(courtsDraft, computeZone(courtsDraft)))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {preferences.preferred_courts.length > 0
                ? preferences.preferred_courts.map((c) => <span key={c} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70 border border-fg/10">{c}</span>)
                : <span className="text-sm text-fg/40">None set.</span>}
            </div>
          )}
        </div>

        {/* Favourite Players */}
        <div className="py-3">
          <SectionHeader icon={<Star className="w-3.5 h-3.5 text-clay" />} label="Favourite Players" editing={editing === 'favourites'} onEdit={() => open('favourites')} onCancel={() => setEditing(null)} />
          {editing === 'favourites' ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {[...new Set([...FAVOURITE_PLAYERS, ...favDraft])].map((p) => (
                  <button key={p} type="button" onClick={() => setFavDraft(favDraft.includes(p) ? favDraft.filter((x) => x !== p) : [...favDraft, p])}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${favDraft.includes(p) ? 'bg-clay text-fg border-clay' : 'bg-white text-tennis-dark border-fg'}`}>{p}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Add your own player…" value={favInput} onChange={(e) => setFavInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = favInput.trim(); if (v && !favDraft.includes(v)) { setFavDraft([...favDraft, v]); setFavInput(''); } } }} />
                <Button size="sm" variant="clay" className="px-3 shrink-0" onClick={() => { const v = favInput.trim(); if (v && !favDraft.includes(v)) { setFavDraft([...favDraft, v]); setFavInput(''); } }} disabled={!favInput.trim()}>Add</Button>
              </div>
              <Button size="sm" onClick={() => save(() => actions.updateFavouritePlayers(favDraft))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {preferences.favourite_players.length > 0
                ? preferences.favourite_players.map((p) => <span key={p} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70 border border-fg/10">{p}</span>)
                : <span className="text-sm text-fg/40">None set.</span>}
            </div>
          )}
        </div>
      </div>

      {/* Change email — hidden until requested */}
      <div className="pt-4 mt-1 border-t border-fg/5">
        {editing === 'email' ? (
          <div className="space-y-2">
            <p className="text-xs font-bold text-fg/50 uppercase tracking-widest">Change Email Address</p>
            {emailSent ? (
              <div className="space-y-2">
                <p className="text-sm text-fg/70">Verification sent to <span className="text-fg">{emailDraft}</span>. Confirm it, then refresh.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => actions.refreshEmailChange()}>Refresh</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Done</Button>
                </div>
              </div>
            ) : (
              <>
                <Input type="email" placeholder="New email address" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} />
                <Input type="password" placeholder="Current password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={async () => { if (await actions.changeEmail(emailDraft, emailPassword)) setEmailSent(true); }} isLoading={updateLoading}>Send verification</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => open('email')} className="text-xs font-semibold text-clay hover:text-clay/80 transition-colors">Change email address</button>
        )}
      </div>

      {message?.text && (
        <p className={`text-sm font-semibold mt-3 ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>
      )}
    </div>
  );
};
