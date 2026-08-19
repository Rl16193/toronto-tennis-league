import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Camera, Pencil, X, Check, MapPin, Star, Loader2, Users, Award } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import IntlTelInput from '@intl-tel-input/react/with-utils';
import 'intl-tel-input/styles';
import { useAuth } from '../../../context/AuthContext';
import { storage } from '../../../lib/firebase';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { RacquetIcon } from '../../../components/RacquetIcon';
import { SELECTABLE_SKILL_LEVELS, skillTier, leagueDivision, leagueAgeCategory } from '../../../utils/skillLevels';
import {
  defaultCourtOptions, extractCourtsWithCoords, extractDropdownCourts,
  getCourtSuggestions, mergeCourtOptions,
} from '../../signup/utils/courtSearch';
import { zoneFromCourts, ZONE_NAMES } from '../../../utils/zones';
import { Sheet } from '../../../components/Sheet';
import { formatPhone } from '../../../utils/formatPhone';
import { skillBand } from '../../tournament/domain/placement';
import { getFavouritePlayerSuggestions, useFavouritePlayerOptions } from '../favouritePlayers';
import { BadgePicker } from '../../tasks/BadgePicker';
import { BADGE_PILL_CLASS } from '../../tasks/badges';
import type { Counters } from '../../tasks/taskCatalog';
import { ContactMethod, TaskProgress } from '../../../types';

type Actions = {
  updateName: (name: string) => Promise<boolean>;
  updatePhone: (phone: string) => Promise<boolean>;
  updateWhatsappContact: (whatsappContact: string, sameAsPhone: boolean) => Promise<boolean>;
  updateBio: (bio: string) => Promise<boolean>;
  updateAvatar: (url: string) => Promise<boolean>;
  updateSkills: (skill: number, pref: string) => Promise<boolean>;
  updateLeagueAgeCategory: (league: "Men's" | "Women's" | '', ageCategory: 'Retired Pro' | 'Juniors' | '', visible: boolean) => Promise<boolean>;
  updateDisplayBadges: (badgeIds: string[]) => Promise<boolean>;
  updatePreferredCourts: (courts: string[], zone: string) => Promise<boolean>;
  updatePreferredZone: (zone: string) => Promise<boolean>;
  updateFavouritePlayers: (players: string[]) => Promise<boolean>;
  updateEmailNotifications: (enabled: boolean) => Promise<boolean>;
  updateContactMethods: (methods: ContactMethod[]) => Promise<boolean>;
  changeEmail: (email: string, password: string) => Promise<boolean | undefined>;
  refreshEmailChange: () => Promise<void>;
};

interface Props {
  actions: Actions;
  updateLoading: boolean;
  message?: { text: string; type: 'success' | 'error' } | null;
  progress: TaskProgress | null;
  counters: Counters;
}


type Row = 'name' | 'phone' | 'whatsapp' | 'bio' | 'skill' | 'league' | 'courts' | 'favourites' | 'email' | null;

// `action` renders left of the Pencil/X and is always visible — it holds the contact-method
// switches, which write a stored preference rather than a draft.
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  label: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  action?: React.ReactNode;
}> = ({ icon, label, editing, onEdit, onCancel, action }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-xs font-bold text-fg/70 uppercase tracking-widest flex items-center gap-1.5 min-w-0">{icon}{label}</span>
    <div className="flex items-center gap-3 shrink-0">
      {action}
      <button
        type="button"
        onClick={editing ? onCancel : onEdit}
        className={`transition-colors ${editing ? 'text-badge-loss hover:opacity-80' : 'text-fg/70 hover:text-fg'}`}
        aria-label={editing ? 'Cancel' : `Edit ${label}`}
      >
        {editing ? <X className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
      </button>
    </div>
  </div>
);

// Zone picker. Immediate, not a request: the profile card isn't event-scoped, so there is no
// organizer attached to review it. A change NEVER unseats them — matches already generated are
// untouched; the new zone only decides draws not yet made (see functions/zoneMoves.js).
const ZonePickerSheet: React.FC<{
  currentZone: string;
  saving: boolean;
  onClose: () => void;
  onPick: (zone: string) => void;
}> = ({ currentZone, saving, onClose, onPick }) => (
  <Sheet onClose={onClose} title="Your Zone" maxWidthClassName="max-w-md">
    <div className="p-6 pt-3 space-y-4">
      <p className="text-sm text-fg/70">
        Your zone decides which tournament draw you are placed in. Any matches you are already
        playing stay exactly as they are; the new zone applies to draws that haven&apos;t been made yet.
      </p>
      <div className="space-y-2">
        {ZONE_NAMES.map((z) => {
          const isCurrent = z === currentZone;
          return (
            <button
              key={z}
              type="button"
              disabled={isCurrent || saving}
              onClick={() => onPick(z)}
              className={`w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                isCurrent ? 'bg-clay/15 border border-clay/50' : 'bg-fg/5 hover:bg-fg/[0.08] border border-transparent'
              } ${saving ? 'opacity-50' : ''}`}
            >
              <span className="text-sm font-bold text-fg truncate">{z}</span>
              {isCurrent && <span className="text-[11px] font-bold text-clay shrink-0">Current</span>}
            </button>
          );
        })}
      </div>
    </div>
  </Sheet>
);

// "Contact Method: X" — decides which channels an opponent is offered. Independent of each other;
// disabled when the channel has no detail saved. None on = every channel offered.
const ContactMethodToggle: React.FC<{
  label: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}> = ({ label, on, disabled, onChange }) => (
  <label className={`flex items-center gap-2 select-none ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
    <span className="text-[10px] font-bold uppercase tracking-widest text-fg/70 whitespace-nowrap">
      Contact Method: {label}
    </span>
    <span className="relative inline-flex items-center shrink-0">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="block w-10 h-6 bg-fg/15 peer-checked:bg-clay rounded-full transition-colors" />
      <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
    </span>
  </label>
);

export const ProfileInfo: React.FC<Props> = ({ actions, updateLoading, message, progress, counters }) => {
  const { profile } = useAuth();
  const [editing, setEditing] = useState<Row>(null);
  const [showZoneSheet, setShowZoneSheet] = useState(false);

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
  const [ageCategoryDraft, setAgeCategoryDraft] = useState<'Retired Pro' | 'Juniors' | ''>('');
  const [visibleDraft, setVisibleDraft] = useState(false);
  const [courtsDraft, setCourtsDraft] = useState<string[]>([]);
  const [courtInput, setCourtInput] = useState('');
  const [favDraft, setFavDraft] = useState<string[]>([]);
  const [favInput, setFavInput] = useState('');
  // Only read once the editor is open — it's a full pass over `preferences`.
  const favOptions = useFavouritePlayerOptions(editing === 'favourites');
  const favSuggestions = getFavouritePlayerSuggestions(favOptions.all, favDraft, favInput);
  // Quick picks: the three names most chosen by men's-league members and the three most chosen
  // by women's-league members. Deduped against each other and against what's already picked, so
  // a name popular in both leagues doesn't take two of the six slots.
  const favQuickPicks = useMemo(
    () => [...new Set([...favOptions.mens, ...favOptions.womens])].filter((p) => !favDraft.includes(p)),
    [favOptions, favDraft],
  );
  const addFavourite = (raw: string) => {
    const name = raw.trim();
    if (!name || favDraft.includes(name)) return;
    setFavDraft([...favDraft, name]);
    setFavInput('');
  };
  const [emailDraft, setEmailDraft] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  // Avatar upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  if (!profile) return null;
  const { user, stats, preferences, contacts } = profile;

  const open = (row: Row) => {
    setNameDraft(user.name);
    setPhoneDraft(contacts.phone);
    setWaDraft(contacts.whatsapp_contact ?? '');
    setWaSameAsPhone(!!contacts.whatsapp_same_as_phone);
    setWaValid(true);
    setBioDraft(user.bio ?? '');
    setSkillDraft(stats.skill_level);
    setLeagueDraft(leagueDivision(stats.league));
    setAgeCategoryDraft(leagueAgeCategory(stats.league));
    setVisibleDraft(!!user.profile_details_visible);
    setCourtsDraft(preferences.preferred_courts);
    setFavDraft(preferences.favourite_players);
    setCourtInput(''); setFavInput(''); setEmailDraft(''); setEmailPassword(''); setEmailSent(false);
    setEditing(row);
  };
  const save = async (fn: () => Promise<boolean>) => { if (await fn()) setEditing(null); };

  // Which channels the member wants to be reached on. Empty = no preference = all offered.
  const methods = contacts.preferred_mode_of_contact ?? [];
  const toggleMethod = (m: ContactMethod, on: boolean) =>
    actions.updateContactMethods(on ? [...methods, m] : methods.filter((x) => x !== m));
  // A channel with nothing behind it can't be a contact method, so its switch is disabled.
  const hasWhatsapp = !!(contacts.whatsapp_contact?.trim() || contacts.whatsapp_same_as_phone || contacts.phone?.trim());
  const methodToggle = (m: ContactMethod, label: string, available: boolean) => (
    <ContactMethodToggle
      label={label}
      on={methods.includes(m)}
      disabled={updateLoading || !available}
      onChange={(on) => toggleMethod(m, on)}
    />
  );

  const pickZone = async (zone: string) => {
    if (await actions.updatePreferredZone(zone)) setShowZoneSheet(false);
  };

  const computeZone = (courts: string[]): string => {
    // A zone chosen by hand wins over the courts. Recomputing here would silently undo the pick
    // and move the member between draws the next time they edit their court list.
    if (preferences.preferred_zone_manual) return preferences.preferred_zone;
    if (courts.length === 0) return '';
    // Majority vote across ALL preferred courts (not just the first one) — a player who splits
    // time across zones should land in whichever zone most of their courts are actually in,
    // with Downtown as the tiebreaker (see zoneFromCourts).
    const zone = zoneFromCourts(courts, courtCoords);
    return zone || preferences.preferred_zone || '';
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

  const initial = (user.name || contacts.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="rounded-[2.5rem] bg-tennis-surface/30 shadow-xl p-5 sm:p-7">
      <h2 className="text-xl font-bold text-fg mb-5">Profile Card</h2>

      {/* Avatar + name/phone/bio, vertical */}
      <div className="flex flex-col items-center gap-4 pb-5 border-b border-fg/5">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-tennis-surface flex items-center justify-center overflow-hidden">
            {user.avatar
              ? <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <span className="text-4xl font-black text-fg">{initial}</span>}
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
          <SectionHeader
            icon={null} label="Phone" editing={editing === 'phone'}
            onEdit={() => open('phone')} onCancel={() => setEditing(null)}
            action={methodToggle('text', 'SMS/Text', !!contacts.phone?.trim())}
          />
          {editing === 'phone' ? (
            <div className="mt-2 flex gap-2">
              <Input value={phoneDraft} onChange={(e) => setPhoneDraft(formatPhone(e.target.value))} placeholder="(416)-555-0123" />
              <Button size="sm" onClick={() => save(() => actions.updatePhone(phoneDraft))} isLoading={updateLoading}><Check className="w-4 h-4" /></Button>
            </div>
          ) : <p className="text-lg font-bold text-fg mt-0.5">{contacts.phone || '—'}</p>}
        </div>

        {/* WhatsApp Contact */}
        <div className="py-3">
          <SectionHeader
            icon={null} label="WhatsApp Contact" editing={editing === 'whatsapp'}
            onEdit={() => open('whatsapp')} onCancel={() => setEditing(null)}
            action={methodToggle('whatsapp', 'WhatsApp', hasWhatsapp)}
          />
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
                    className: 'w-full rounded-2xl bg-tennis-surface/50 px-4 py-3 text-fg placeholder-gray-500 text-sm focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none',
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
              {contacts.whatsapp_same_as_phone ? 'Same as phone number' : (contacts.whatsapp_contact || '—')}
            </p>
          )}
        </div>

        {/* Bio */}
        <div className="py-3">
          <SectionHeader icon={null} label="Bio" editing={editing === 'bio'} onEdit={() => open('bio')} onCancel={() => setEditing(null)} />
          {editing === 'bio' ? (
            <div className="mt-2 space-y-2">
              <textarea value={bioDraft} onChange={(e) => setBioDraft(e.target.value)} rows={3} maxLength={300}
                placeholder="Your tennis vibe: play times, rally or games, and any other details?"
                className="border border-fg/25 w-full rounded-2xl bg-tennis-surface/50 px-4 py-3 text-fg placeholder-gray-500 text-sm focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none" />
              <Button size="sm" onClick={() => save(() => actions.updateBio(bioDraft))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : <p className="text-sm text-fg/70 mt-0.5">{user.bio?.trim() || <span className="text-fg/70">No bio yet.</span>}</p>}
        </div>

        {/* Skill */}
        <div className="py-3">
          <SectionHeader icon={<RacquetIcon className="w-3.5 h-3.5 text-clay" />} label="Skill Level" editing={editing === 'skill'} onEdit={() => open('skill')} onCancel={() => setEditing(null)} />
          {editing === 'skill' ? (
            <div className="mt-3 space-y-3">
              {/* Same control as signup: one column per level filling the width, an INSET border
                  for the selected state (a ring paints outside the box and gets clipped by the
                  card edge), and the band name centred underneath. The range slider this replaced
                  was hard to land on an exact half-step on a phone. */}
              <div className="grid grid-cols-7 gap-1.5">
                {SELECTABLE_SKILL_LEVELS.map((level) => {
                  const active = skillDraft === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setSkillDraft(level)}
                      className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                        active ? 'bg-clay/10 text-clay border-clay' : 'bg-fg/5 text-fg border-transparent hover:bg-fg/10'
                      }`}
                    >
                      {level.toFixed(1)}
                    </button>
                  );
                })}
              </div>
              {/* skillBand is the same function the draw engine groups on, so this label and the
                  group a player actually lands in can never disagree. */}
              <p className="text-sm font-bold text-clay text-center">{skillBand(skillDraft)}</p>
              <Button size="sm" onClick={() => save(() => actions.updateSkills(skillDraft, skillBand(skillDraft)))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-bold text-fg">NTRP {stats.skill_level}</span>
            </div>
          )}
        </div>

        {/* League */}
        <div className="py-3">
          <SectionHeader icon={<Users className="w-3.5 h-3.5 text-clay" />} label="League" editing={editing === 'league'} onEdit={() => open('league')} onCancel={() => setEditing(null)} />
          {editing === 'league' ? (
            <div className="mt-2 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(["Men's", "Women's"] as const).map((league) => (
                  <button
                    key={league}
                    type="button"
                    onClick={() => setLeagueDraft(league)}
                    className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                      leagueDraft === league
                        ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                        : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
                    }`}
                  >
                    {league}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!leagueDraft}
                  onClick={() => setAgeCategoryDraft(ageCategoryDraft === 'Retired Pro' ? '' : 'Retired Pro')}
                  className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                    !leagueDraft
                      ? 'bg-fg/5 border-fg/5 text-fg/70 opacity-50 cursor-not-allowed'
                      : ageCategoryDraft === 'Retired Pro'
                        ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                        : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
                  }`}
                >
                  Retired Pro <span className="ml-1 opacity-70 font-normal normal-case">(age: 55+)</span>
                </button>
                <button
                  type="button"
                  disabled={!leagueDraft}
                  onClick={() => setAgeCategoryDraft(ageCategoryDraft === 'Juniors' ? '' : 'Juniors')}
                  className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                    !leagueDraft
                      ? 'bg-fg/5 border-fg/5 text-fg/70 opacity-50 cursor-not-allowed'
                      : ageCategoryDraft === 'Juniors'
                        ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                        : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
                  }`}
                >
                  Juniors
                </button>
              </div>
              {!leagueDraft && (
                <p className="text-[11px] text-fg/70">Choose a league above to unlock Retired Pro / Juniors.</p>
              )}
              <label className="flex items-center gap-2 cursor-pointer text-sm text-fg/70">
                <input type="checkbox" checked={visibleDraft} onChange={(e) => setVisibleDraft(e.target.checked)} className="accent-clay" />
                Make visible to others
              </label>
              <Button size="sm" onClick={() => save(() => actions.updateLeagueAgeCategory(leagueDraft, ageCategoryDraft, visibleDraft))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {leagueDivision(stats.league) && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70">{leagueDivision(stats.league)} League</span>
              )}
              {leagueAgeCategory(stats.league) && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70">{leagueAgeCategory(stats.league)}</span>
              )}
              {!leagueDivision(stats.league)
                ? <span className="text-sm text-fg/70">Not set.</span>
                : <span className="text-[11px] text-fg/70 ml-1">{user.profile_details_visible ? 'Visible to others' : 'Hidden from others'}</span>}
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="py-3">
          <span className="text-xs font-bold text-fg/70 uppercase tracking-widest flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-clay" />Badges
          </span>
          {/* Skill tag and badges share one row — badges use the same pill so the whole line
              reads as one set of labels. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={BADGE_PILL_CLASS}>{skillTier(stats.skill_level)}</span>
            <BadgePicker
              selected={user.display_badges ?? []}
              onSave={actions.updateDisplayBadges}
              saving={updateLoading}
              progress={progress}
              counters={counters}
            />
          </div>
        </div>

        {/* Courts */}
        <div className="py-3">
          <SectionHeader icon={<MapPin className="w-3.5 h-3.5 text-clay" />} label="Courts" editing={editing === 'courts'} onEdit={() => open('courts')} onCancel={() => setEditing(null)} />
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
                <div className="max-h-40 overflow-y-auto rounded-xl bg-tennis-dark/95 p-1">
                  {courtSuggestions.map((c) => (
                    <button key={c} type="button" onClick={() => addCourt(c)} className="w-full text-left px-3 py-2 text-sm text-fg rounded-lg hover:bg-clay/20">{c}</button>
                  ))}
                </div>
              )}
              <Button size="sm" onClick={() => save(() => actions.updatePreferredCourts(courtsDraft, computeZone(courtsDraft)))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {preferences.preferred_courts.length > 0
                ? preferences.preferred_courts.map((c) => <span key={c} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70">{c}</span>)
                : <span className="text-sm text-fg/70">None set.</span>}
            </div>
          )}
        </div>

        {/* Zone — sits under Courts because it's normally derived from them. Changing it here is
            immediate (no organizer request) but never unseats them from matches that already
            exist; the picker is a sheet, not a dropdown. */}
        <div className="py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-fg/70 uppercase tracking-widest flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-clay" />Zone
            </span>
            <button
              type="button"
              onClick={() => setShowZoneSheet(true)}
              className="text-xs font-semibold text-clay hover:text-clay/80 transition-colors shrink-0"
            >
              Change
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {preferences.preferred_zone
              ? <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70">{preferences.preferred_zone}</span>
              : <span className="text-sm text-fg/70">None set.</span>}
          </div>
        </div>

        {/* Favourites */}
        <div className="py-3">
          <SectionHeader icon={<Star className="w-3.5 h-3.5 text-clay" />} label="Favourites" editing={editing === 'favourites'} onEdit={() => open('favourites')} onCancel={() => setEditing(null)} />
          {/* A search box over what members have actually picked, ranked by popularity — the old
              version was a grid of five hardcoded names as toggle chips. Chosen names are pills,
              same treatment as Courts above, so the two sections read as one card. */}
          {editing === 'favourites' ? (
            <div className="mt-2 space-y-2">
              {favDraft.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {favDraft.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFavDraft(favDraft.filter((x) => x !== p))}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-clay text-fg flex items-center gap-1.5"
                      aria-label={`Remove ${p}`}
                    >
                      {p} <span className="opacity-70">✕</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Quick picks — one tap for the names the two leagues actually pick most, so the
                  common case needs no typing. Data-driven, not a hardcoded list. */}
              {favQuickPicks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {favQuickPicks.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => addFavourite(p)}
                      className="px-3 py-1 rounded-full text-xs font-bold bg-fg/5 text-fg hover:bg-clay/20 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              <Input
                placeholder="Search or add a player…"
                value={favInput}
                onChange={(e) => setFavInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFavourite(favInput); } }}
              />

              {favSuggestions.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-2xl bg-tennis-dark/60 p-1">
                  {favSuggestions.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => addFavourite(p)}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-fg hover:bg-clay/20 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
              {/* The list only knows names members have already saved, so anything new has to be
                  typed — that's also how the list grows. */}
              {!!favInput.trim() && !favSuggestions.includes(favInput.trim()) && (
                <button
                  type="button"
                  onClick={() => addFavourite(favInput)}
                  className="text-xs font-bold text-clay hover:underline"
                >
                  Add “{favInput.trim()}”
                </button>
              )}

              <Button size="sm" onClick={() => save(() => actions.updateFavouritePlayers(favDraft))} isLoading={updateLoading}>Save</Button>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {preferences.favourite_players.length > 0
                ? preferences.favourite_players.map((p) => <span key={p} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70">{p}</span>)
                : <span className="text-sm text-fg/70">None set.</span>}
            </div>
          )}
        </div>

        {/* Email notifications — a single global switch for the Resend emails (challenge/rally
            received/accepted, weekly incomplete-matches digest). Instant toggle, no draft/save. */}
        <div className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-fg/70">Email Notifications</p>
            <p className="text-xs text-fg/70 mt-0.5">Challenge/rally updates and your weekly incomplete-matches reminder.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={preferences.email_notifications !== false}
              disabled={updateLoading}
              onChange={(e) => actions.updateEmailNotifications(e.target.checked)}
            />
            <div className="w-10 h-6 bg-fg/15 peer-checked:bg-clay rounded-full transition-colors" />
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
          </label>
        </div>
      </div>

      {/* Email — address changes go through verification; the contact-method switch sits here so
          "email and WhatsApp" is expressible. */}
      <div className="pt-4 mt-1 border-t border-fg/5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-xs font-bold text-fg/70 uppercase tracking-widest">Email</span>
          {methodToggle('email', 'Email', !!contacts.email?.trim())}
        </div>
        <p className="text-sm text-fg mb-2 break-all">{contacts.email || '—'}</p>
        {editing === 'email' ? (
          <div className="space-y-2">
            <p className="text-xs font-bold text-fg/70 uppercase tracking-widest">Change Email Address</p>
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
        <p className={`text-sm font-semibold mt-3 ${message.type === 'success' ? 'text-badge-win' : 'text-badge-loss'}`}>{message.text}</p>
      )}

      <AnimatePresence>
        {showZoneSheet && (
          <ZonePickerSheet
            currentZone={preferences.preferred_zone}
            saving={updateLoading}
            onClose={() => setShowZoneSheet(false)}
            onPick={pickZone}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
