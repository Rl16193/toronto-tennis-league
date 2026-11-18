import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { easeOut } from '../../lib/motion';
import { Calendar, Check, CheckCircle2, ChevronRight, ImageUp, MapPin, Pencil, Star, Trophy } from 'lucide-react';
import { Button, buttonCls } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { SelectField } from '../../components/SelectField';
import { RacquetIcon } from '../../components/RacquetIcon';
import { useAuth } from '../../context/AuthContext';
import { leagueDivision } from '../../utils/skillLevels';
import { MemberSearchInput, type MemberPick } from '../members/MemberSearchInput';
import { TennisEvent } from '../../types';
import { GALA_RSVP_URL, isAwardsGala, isDoublesEvent, isLadderEvent, isRecurringWeekly, isSeasonOpener, isTournamentEvent } from '../../utils/eventTypes';
import {
  getEventEndDate, getEventStartDate, parseEndInstant, parseValidDate,
} from '../../utils/eventDates';
import { DOUBLES_DIVISIONS } from '../../pages/tournament/types';
import { JoinFormState } from './types';
import { REMOVAL_REASONS, type RemovalReason } from './registrations';
import {
  CompletedEvent, DisplayEvent, EVENT_SKILL_OPTIONS, EVENT_TYPE_OPTIONS, EventFormState,
} from './services/eventService';

/** One completed event, opening its draw read-only (Events → Completed, and History). */
// A completed tournament opens its past draws (/events?past=ID); `onOpen` opens them in place.
export const CompletedEventRow: React.FC<{ e: Pick<CompletedEvent, 'id' | 'title' | 'when'>; onOpen?: () => void }> = ({ e, onOpen }) => {
  const cls = 'w-full text-left flex items-center gap-3 px-4 py-3.5 hover:bg-fg/5 transition-colors';
  const body = (
  <>
    <span className="w-8 h-8 shrink-0 rounded-2xl bg-clay/15 border border-clay/25 flex items-center justify-center">
      <Trophy className="w-4 h-4 text-clay" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-fg truncate">{e.title}</p>
      {e.when && (
        <p className="text-xs text-fg/70">
          {e.when.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}
        </p>
      )}
    </div>
    <ChevronRight className="w-4 h-4 text-fg/70 shrink-0" />
  </>
  );
  return onOpen
    ? <button type="button" onClick={onOpen} className={cls}>{body}</button>
    : <Link to={`/events?past=${e.id}`} className={cls}>{body}</Link>;
};

// Events page presentation: event card, creator form, join sheet, schedule formatters.
// Data access lives in ./services/eventService.ts and ./hooks/; shared form types in ./types.ts.

// ─── Schedule formatting ─────────────────────────────────────────────────────────────────────────

/**
 * A weekly meetup's next occurrence: start_date's weekday, on or after today. Today's counts until
 * the day is over, then it reads as next week's. Display only — start_date is never rewritten.
 */
export const nextOccurrence = (event: TennisEvent, now = new Date()): Date | null => {
  const start = parseValidDate(getEventStartDate(event));
  if (!start || !isRecurringWeekly(event)) return start;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (start >= today) return start;
  const next = new Date(today);
  next.setDate(today.getDate() + ((start.getDay() - today.getDay() + 7) % 7));
  return next;
};

export const formatEventSchedule = (event: TennisEvent): string | null => {
  const start = nextOccurrence(event);
  if (start) {
    const dateLabel = start.toLocaleDateString('en-US', { ...(isRecurringWeekly(event) && { weekday: 'short' }), month: 'long', day: 'numeric' });
    return event.time ? `${dateLabel} • ${event.time}` : dateLabel;
  }
  return event.time || null;
};

export const formatTournamentRange = (event: TennisEvent): string | null => {
  const start = parseValidDate(getEventStartDate(event));
  const end = parseValidDate(getEventEndDate(event));
  if (!start || !end) return null;
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${fmt(start)} - ${fmt(end)}`;
};

// ─── Event card ──────────────────────────────────────────────────────────────────────────────────

/** The event's kind as its chip reads. */
export const eventTypeLabel = (event: Pick<TennisEvent, 'category' | 'sub_category'>) => {
  if (isTournamentEvent(event)) return 'Tournament';
  if (isLadderEvent(event)) return 'Challenges';
  if (event.category === 'coaching_clinic') return 'Coaching Clinic';
  return event.sub_category === 'meetup' ? 'Meetup' : 'Special Event';
};

// join_last_date is stored at 23:59:59 local of the cutoff day, so it can still be joined that day.
const getJoinLastDateMs = (event: DisplayEvent): number | null => parseEndInstant(event.join_last_date)?.getTime() ?? null;

const LATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * The instant registration shuts, whichever comes first:
 *   - the event's own end date, because you cannot join something that has finished;
 *   - 7 days past join_last_date, the late-registration grace.
 *
 * Either may be absent. With neither, registration never closes on a date — the event's
 * completion does it instead (see `isCurrentEvent`).
 *
 * The end date used to play no part here, which let a tournament that finished on Sunday keep
 * offering a Join button because nobody had filled in a join-last date.
 */
const registrationClosesAtMs = (event: DisplayEvent): number | null => {
  const joinLast = getJoinLastDateMs(event);
  const graceEnd = joinLast === null ? null : joinLast + LATE_WINDOW_MS;
  const eventEnd = parseEndInstant(getEventEndDate(event))?.getTime() ?? null;
  const closes = [graceEnd, eventEnd].filter((v): v is number => v !== null);
  return closes.length === 0 ? null : Math.min(...closes);
};

/** Hard close: past whichever deadline came first — no join of any kind. */
const isJoinHardClosed = (event: DisplayEvent): boolean => {
  const ms = registrationClosesAtMs(event);
  return ms !== null && Date.now() > ms;
};

/**
 * Past join_last_date but not yet hard closed — the late-registration window (tournament only).
 * Bounded by the hard close, so an event that has already ended never offers late registration.
 */
export const isLateRegistration = (event: DisplayEvent): boolean => {
  const joinLast = getJoinLastDateMs(event);
  if (joinLast === null) return false;
  return Date.now() > joinLast && !isJoinHardClosed(event);
};

interface EventCardProps {
  event: DisplayEvent;
  index: number;
  isJoined: boolean;
  authLoading: boolean;
  isLoggedIn: boolean;
  onJoin: (event: DisplayEvent) => void; // opens the join sheet (wireframe 1g)
  // Only the event's own creator sees this — omit or pass undefined to hide it entirely.
  onEdit?: (event: DisplayEvent) => void;
}

// Event card — display only. The join form lives in JoinEventSheet now, so tapping Join never
// reflows the grid.
export const EventCard: React.FC<EventCardProps> = ({ event, index, isJoined, authLoading, isLoggedIn, onJoin, onEdit }) => {
  // The ladder runs the whole season, so a date would imply a deadline that doesn't exist.
  const dateLabel = isLadderEvent(event)
    ? 'All Season'
    : isTournamentEvent(event) ? formatTournamentRange(event) : formatEventSchedule(event);
  const isTournament = isTournamentEvent(event);
  // League Ladder: no registration — the card's action opens the ladder Challenges tab.
  const isLadder = isLadderEvent(event);
  const navigate = useNavigate();

  const [descExpanded, setDescExpanded] = useState(false);
  const description = event.about;

  const isLate = isLateRegistration(event);
  const isHardClosed = isJoinHardClosed(event);
  // Non-tournament events have no draw slots — late registration doesn't apply.
  const joinClosed = isHardClosed || (isLate && !isTournament);

  // Signed out: sign in or sign up, then come back to this card.
  const signUpHere = () => navigate(`/signup?intent=join-event&next=${encodeURIComponent(`/events?event=${event.id}`)}`);

  const buttonLabel = isJoined
    ? 'Joined'
    : joinClosed
      ? 'Registration Closed'
      : authLoading
        ? 'Loading...'
        : !isLoggedIn
          ? 'Sign Up to Join'
          : isLate
            ? 'Late Registration'
            : 'Join Event';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: easeOut }}
      // The Events page scrolls a deep-linked card into view by this id (/events?event=ID).
      id={`event-${event.id}`}
      className="bg-fg/5 rounded-2xl p-5 flex flex-col gap-3 transition-colors scroll-mt-24"
    >
      {/* Poster banner — a 16:9 crop from the centre of the artwork, which is where the event name
          is printed. The type and price ride ON it, and the organiser's edit control takes the
          opposite corner so the three never collide.
          With no picture there is nothing to sit on, so the same three fall back to a plain row
          above the title. A shorter card reads as deliberate; an empty grey box reads as broken. */}
      {event.image ? (
        <div className="relative">
          <img
            src={event.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full aspect-video object-cover object-center rounded-2xl"
          />
          {/* Both get an opaque backing: a poster is busy, and an unfilled chip disappears into it. */}
          <span className="absolute top-2 left-2 px-2.5 py-0.5 rounded-2xl bg-tennis-dark/85 backdrop-blur-sm text-xs font-bold text-clay uppercase tracking-widest">
            {eventTypeLabel(event)}
          </span>
          {event.private && (
            <span className="absolute top-2 right-2 rounded-full bg-clay px-3 py-1 text-xs font-bold text-white">
              Invitation Only
            </span>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(event)}
              aria-label="Edit event"
              className="absolute bottom-2 right-2 w-9 h-9 flex items-center justify-center rounded-full
                         bg-tennis-dark/70 text-fg backdrop-blur-sm transition-colors hover:bg-tennis-dark
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="px-2.5 py-0.5 bg-clay/10 border border-clay/20 rounded-2xl text-xs font-bold text-clay uppercase tracking-widest">
            {eventTypeLabel(event)}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {event.private && <span className="rounded-full bg-lime px-3 py-1 text-xs font-bold text-ink">Invitation Only</span>}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(event)}
                aria-label="Edit event"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-fg/10 text-fg
                           transition-colors hover:bg-fg/20
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Title, with the card's action on the right where the price used to be. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-fg leading-snug flex items-center gap-1.5">
            <span className="min-w-0 break-words">{event.title}</span>
            {isJoined && <CheckCircle2 className="w-4 h-4 shrink-0 text-badge-win" aria-label="Joined" />}
          </h3>
          {isSeasonOpener(event) && (
            <p className="text-xs font-semibold uppercase tracking-wider text-badge mt-1">First Tournament of 2026</p>
          )}
        </div>
        <div className="shrink-0">
          {/* A private event has no action: its Invitation Only pill replaces Free above. */}
          {event.private ? null : isAwardsGala(event) ? (
            <a href={GALA_RSVP_URL} target="_blank" rel="noopener noreferrer" className={buttonCls('primary', 'sm')}>
              Join Event
            </a>
          ) : isLadder ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => (isLoggedIn ? navigate('/matches?mode=challenges') : signUpHere())}
              disabled={authLoading}
            >
              {isLoggedIn && <RacquetIcon className="w-3.5 h-3.5" />}
              {isLoggedIn ? 'Challenge Now' : 'Sign Up to Challenge'}
            </Button>
          ) : (
            <Button
              variant={isJoined ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => (isLoggedIn ? onJoin(event) : signUpHere())}
              disabled={isJoined || joinClosed || authLoading}
            >
              {buttonLabel}
            </Button>
          )}
        </div>
      </div>

      {description && (
        <div>
          <p className={`text-xs text-fg/70 leading-relaxed ${descExpanded ? '' : 'line-clamp-3'}`}>{description}</p>
          {description.length > 100 && (
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              className="text-xs font-semibold text-clay hover:text-clay/80 transition-colors mt-0.5"
            >
              {descExpanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {dateLabel && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-fg/5 text-xs text-fg/70">
            <Calendar className="w-3.5 h-3.5 text-clay shrink-0" />
            {dateLabel}
          </span>
        )}
        {event.location && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-fg/5 text-xs text-fg/70">
            <MapPin className="w-3.5 h-3.5 text-clay shrink-0" />
            {event.location}
          </span>
        )}
        {event.skill_level && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-fg/5 text-xs text-fg/70">
            <Star className="w-3.5 h-3.5 text-clay shrink-0" />
            {event.skill_level}
          </span>
        )}
      </div>

    </motion.div>
  );
};

// ─── Create / edit an event (creator) ────────────────────────────────────────────────────────────

type FormMessage = { type: 'success' | 'error'; text: string } | null;

type CreatorEventModalProps = {
  eventForm: EventFormState;
  setEventForm: (eventForm: EventFormState) => void;
  eventFormMessage: FormMessage;
  creatingEvent: boolean;
  isEditing?: boolean;
  /** A newly picked image, not yet uploaded. The stored one lives on eventForm.image. */
  imageFile: File | null;
  onImageFileChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

// Compact field chrome: smaller labels, tighter inputs, and short fields paired two-across so
// the whole form fits in roughly one phone screen instead of eleven stacked full-width rows.
const fieldCls =
  'w-full rounded-2xl bg-tennis-dark/70 px-3.5 py-2.5 text-base sm:text-sm text-fg ' +
  'placeholder-fg/70 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20';
const labelCls = 'block text-xs font-bold uppercase tracking-widest text-fg/70 mb-1.5';
const req = <span className="text-clay">*</span>;

const Toggle: React.FC<{
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ label, options, value, onChange }) => (
  <div>
    <span className={labelCls}>{label}</span>
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-2 rounded-2xl text-xs font-bold border transition-colors ${
            value === o.value
              ? 'bg-clay text-white border-clay'
              : 'bg-tennis-dark/70 text-fg/70 border-fg/10 hover:border-fg/30'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

export const CreatorEventModal: React.FC<CreatorEventModalProps> = ({
  eventForm,
  setEventForm,
  eventFormMessage,
  creatingEvent,
  isEditing,
  imageFile,
  onImageFileChange,
  onSubmit,
  onClose,
}) => {
  const set = (patch: Partial<EventFormState>) => setEventForm({ ...eventForm, ...patch });
  const isTournament = eventForm.type === 'Tournament';
  const [imageError, setImageError] = useState('');

  // A picked file previews through an object URL, revoked when the file changes or the form closes.
  const [filePreview, setFilePreview] = useState('');
  useEffect(() => {
    if (!imageFile) { setFilePreview(''); return; }
    const url = URL.createObjectURL(imageFile);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);
  // A stored web URL previews directly. A legacy gs:// path would need a Storage lookup, which a
  // presentation component doesn't make, so that case shows as "Current image" instead.
  const previewUrl = filePreview || (/^https?:\/\//.test(eventForm.image) ? eventForm.image : '');
  const hasImage = !!imageFile || !!eventForm.image;

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setImageError('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setImageError('The image must be under 5 MB.'); return; }
    setImageError('');
    onImageFileChange(file);
  };
  const removeImage = () => { onImageFileChange(null); set({ image: '' }); setImageError(''); };

  return (
    <Sheet maxWidthClassName="max-w-md" onClose={onClose} title={isEditing ? 'Edit Event' : 'Add an Event'}>
      <form onSubmit={onSubmit} className="p-5 pt-2 space-y-3.5">
        {eventFormMessage && (
          <div className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold ${
            eventFormMessage.type === 'success'
              ? 'border-green-500/20 bg-green-500/10 text-badge-win'
              : 'border-red-500/20 bg-red-500/10 text-badge-loss'
          }`}>
            {eventFormMessage.text}
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="ev-title">Title {req}</label>
          <input id="ev-title" value={eventForm.title} onChange={(e) => set({ title: e.target.value })}
            className={fieldCls} placeholder="Spring Ladder Tournament" />
        </div>

        {/* Optional. The picked file stays on this device until Save, which uploads it. */}
        <div>
          <span className={labelCls}>Image</span>
          {hasImage ? (
            <div className="rounded-2xl bg-tennis-dark/70 overflow-hidden">
              {previewUrl
                ? <img src={previewUrl} alt="" className="w-full aspect-[16/9] object-cover" />
                : <p className="px-3.5 py-3 text-sm text-fg/70">Current image</p>}
              <div className="flex gap-2 p-2">
                <label className="flex-1 cursor-pointer rounded-2xl bg-fg/5 py-2 text-center text-xs font-bold text-fg hover:bg-fg/10 transition-colors">
                  Replace
                  <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={removeImage}
                  className="flex-1 rounded-2xl bg-fg/5 py-2 text-xs font-bold text-badge-loss hover:bg-fg/10 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-fg/20 cursor-pointer hover:border-fg/40 transition-colors">
              <ImageUp className="w-5 h-5 text-fg/70 shrink-0" />
              <span className="text-sm text-fg/70">Add an image</span>
              <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
            </label>
          )}
          {imageError && <p className="mt-1.5 text-xs text-badge-loss">{imageError}</p>}
        </div>

        {/* Type and Skill are both short selects — pairing them saves a row. */}
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Type" required value={eventForm.type} options={EVENT_TYPE_OPTIONS}
            onChange={(type) => set({ type })} />
          <SelectField label="Skill level" value={eventForm.skillLevel} options={EVENT_SKILL_OPTIONS}
            onChange={(skillLevel) => set({ skillLevel })} />
        </div>

        {/* Meetups only. A recurring meetup repeats on the START DATE'S weekday until the end date;
            one that isn't recurring is the special one (sub_category 'meetup' / 'special'). */}
        {eventForm.type === 'Meetup' && (
          <label className="flex items-center gap-2.5 text-sm text-fg cursor-pointer">
            <input
              type="checkbox"
              checked={eventForm.recurring}
              onChange={(e) => set({ recurring: e.target.checked })}
              className="accent-clay w-4 h-4 shrink-0"
            />
            Recurring
          </label>
        )}

        {/* Every type. Invitation only: no Join button; organizers add players themselves. */}
        <label className="flex items-center gap-2.5 text-sm text-fg cursor-pointer">
          <input
            type="checkbox"
            checked={eventForm.isPrivate}
            onChange={(e) => set({ isPrivate: e.target.checked })}
            className="accent-clay w-4 h-4 shrink-0"
          />
          Private Event
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-loc">Location</label>
            <input id="ev-loc" value={eventForm.location} onChange={(e) => set({ location: e.target.value })}
              className={fieldCls} placeholder="High Park" />
          </div>
        </div>

        {/* The three dates sit together — a native date input is narrow enough to pair. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-start">Start date {req}</label>
            <input id="ev-start" type="date" value={eventForm.startDate}
              onChange={(e) => set({ startDate: e.target.value })} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-end">End date {req}</label>
            <input id="ev-end" type="date" value={eventForm.endDate}
              onChange={(e) => set({ endDate: e.target.value })} className={fieldCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-join">Join by</label>
            <input id="ev-join" type="date" value={eventForm.joinLastDate}
              onChange={(e) => set({ joinLastDate: e.target.value })} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-time">Time</label>
            <input id="ev-time" value={eventForm.time} onChange={(e) => set({ time: e.target.value })}
              className={fieldCls} placeholder="10:00 AM - 2:00 PM" />
          </div>
        </div>

        {isTournament && (
          <div className="grid grid-cols-2 gap-3">
            <Toggle
              label="Format"
              options={[{ value: 'knockout', label: 'Knockout' }, { value: 'rr', label: 'Round Robin' }]}
              value={eventForm.tournamentFormat}
              onChange={(v) => set({ tournamentFormat: v as EventFormState['tournamentFormat'] })}
            />
            <Toggle
              label="Participants"
              options={[{ value: 'Singles', label: 'Singles' }, { value: 'Doubles', label: 'Doubles' }]}
              value={eventForm.tournamentChoice}
              onChange={(v) => set({ tournamentChoice: v as EventFormState['tournamentChoice'] })}
            />
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="ev-about">About {req}</label>
          <textarea id="ev-about" value={eventForm.about} onChange={(e) => set({ about: e.target.value })}
            rows={3} className={fieldCls}
            placeholder="Format, expectations, and anything players should know." />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="clay" isLoading={creatingEvent} className="flex-1">{isEditing ? 'Save' : 'Add Event'}</Button>
        </div>
      </form>
    </Sheet>
  );
};

// ─── Join an event ───────────────────────────────────────────────────────────────────────────────

const SINGLES_DIVISIONS = ["Men's", "Women's"] as const;

type JoinEventSheetProps = {
  event: DisplayEvent;
  isLate: boolean;
  seniorsEligible: boolean; // profile age bracket is 55+
  joinForm: JoinFormState;
  setJoinForm: (form: JoinFormState) => void;
  joinError: string;
  joining: boolean;
  onSubmitJoin: () => void;
  onClose: () => void;
  /** Shown when this event needs preferred courts the member hasn't picked; Join stays disabled. */
  courtsPicker?: React.ReactNode;
};

const chip = (active: boolean) =>
  `px-3 py-2 rounded-2xl text-sm font-semibold border transition-colors ${
    active ? 'bg-clay text-white border-clay' : 'bg-white text-ink border-fg hover:bg-white/90'
  }`;

// Join flow as a bottom sheet (wireframe 1g) — format chips, division chips, partner fields,
// notices, submit. Extracted from the old in-card expanding form so the events grid never
// reflows, and the flow matches every other sheet in the app.
export const JoinEventSheet: React.FC<JoinEventSheetProps> = ({
  event, isLate, seniorsEligible, joinForm, setJoinForm, joinError,
  joining, onSubmitJoin, onClose, courtsPicker,
}) => {
  const { user, profile } = useAuth();
  const savedDivision = leagueDivision(profile?.stats.league);
  const currentUserId = user?.uid;
  const isTournament = isTournamentEvent(event);
  // The event's category decides singles or doubles; there is no choice to make.
  const displayChoice = isDoublesEvent(event) ? 'Doubles' : 'Singles';
  const divisions = displayChoice === 'Doubles' ? DOUBLES_DIVISIONS : SINGLES_DIVISIONS;

  // The picked partner, for the search box. The sheet remounts per event alongside the form reset.
  const [partnerPick, setPartnerPick] = useState<MemberPick | null>(null);
  // Required consent to be contacted and have contacts shared; gates Join only, not stored.
  const [contactOk, setContactOk] = useState(false);

  // No visible title — the event name already reads on the card behind this sheet. ariaLabel keeps
  // the dialog named for screen readers now that no heading is drawn.
  return (
    <Sheet onClose={onClose} ariaLabel={`Join ${event.title}`} maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-4">
        {isTournament ? (
          <>
            {/* Division — Singles uses the profile's, so only a member without one is asked. */}
            {displayChoice === 'Singles' && savedDivision ? (
              <p className="text-sm text-fg/70 pr-10">Joining the {savedDivision} draw, from your profile.</p>
            ) : <div>
              <p className="text-xs font-bold text-fg/70 uppercase tracking-widest mb-2">Division</p>
              <div className="flex flex-wrap gap-2">
                {divisions.map((div) => (
                  <button
                    key={div}
                    type="button"
                    onClick={() => setJoinForm({ ...joinForm, division: div as JoinFormState['division'] })}
                    className={chip(joinForm.division === div)}
                  >
                    {div}
                  </button>
                ))}
              </div>
            </div>}

            {/* Retired Pro 55+ opt-in — singles only, shown only to eligible players */}
            {displayChoice === 'Singles' && seniorsEligible && (
              <button
                type="button"
                onClick={() => setJoinForm({ ...joinForm, seniors: !joinForm.seniors })}
                className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                  joinForm.seniors ? 'border-clay/50 bg-clay/10' : 'border-fg/10 bg-fg/5 hover:border-fg/30'
                }`}
                aria-pressed={joinForm.seniors}
              >
                <span>
                  <span className="block text-sm font-bold text-fg">Join the Retired Pro draw (55+)</span>
                  <span className="block text-xs text-fg/70 mt-0.5">Play in the age-based Retired Pro group instead of skill routing.</span>
                </span>
                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                  joinForm.seniors ? 'bg-clay border-clay text-white' : 'border-fg/20'
                }`}>
                  {joinForm.seniors && <Check className="size-3.5" aria-hidden="true" />}
                </span>
              </button>
            )}

            {/* Doubles-only fields */}
            {displayChoice === 'Doubles' && (
              <>
                {/* Autosearch: a member partner is linked by uid (the server registers them too);
                    someone not on the app gets a guest id. Blank = the partner pool. */}
                <MemberSearchInput
                  label="Partner"
                  value={partnerPick}
                  onChange={(pick) => {
                    setPartnerPick(pick);
                    setJoinForm({
                      ...joinForm,
                      partnerName: pick?.name ?? '',
                      partnerUid: pick?.memberId ?? '',
                    });
                  }}
                  excludeId={currentUserId}
                  allowGuest
                  placeholder="Search for your partner…"
                  hint="Not on the app yet? Type their full name and pick “not on the app”. No partner yet? Leave it blank to join the partner pool."
                />
                <div>
                  <p className="text-xs font-bold text-fg/70 uppercase tracking-widest mb-2">Combined Skill (1–5)</p>
                  <input
                    type="number"
                    min={1} max={5} step={0.5}
                    value={joinForm.combinedSkill}
                    onChange={(e) => setJoinForm({ ...joinForm, combinedSkill: e.target.value })}
                    placeholder="e.g. 3.5"
                    className="border border-fg/25 w-full rounded-2xl bg-tennis-dark/70 px-3 py-2.5 text-base sm:text-sm text-fg outline-none focus:border-clay"
                  />
                </div>
              </>
            )}

            {isLate && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-badge">
                <p className="font-semibold">Late registration. Limited spots remaining.</p>
                <p className="mt-0.5 text-badge/70">The organizer will place you in a draw.</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-fg/70">Reserve your spot in this event.</p>
        )}

        {courtsPicker && (
          <div className="space-y-2">
            <div>
              <p className="text-xs font-bold text-fg/70 uppercase tracking-widest">Courts</p>
              <p className="text-xs text-fg/70 mt-1">Enter a court, get placed in a zone and match with people who play in your area.</p>
            </div>
            {courtsPicker}
          </div>
        )}

        <label className="flex items-start gap-2.5 text-sm text-fg cursor-pointer min-h-11">
          <input
            type="checkbox"
            checked={contactOk}
            onChange={(e) => setContactOk(e.target.checked)}
            className="accent-clay w-4 h-4 shrink-0 mt-0.5"
          />
          <span>I agree to be contacted about this event and for my contact details to be shared with my opponents.</span>
        </label>

        {joinError && <p className="text-xs font-semibold text-badge-loss">{joinError}</p>}

        <Button
          onClick={onSubmitJoin}
          isLoading={joining}
          disabled={joining || !contactOk}
          className="w-full"
        >
          Join Event
        </Button>
      </div>
    </Sheet>
  );
};

// ── Withdraw: the reason pills, shared by the organizer's removal and a member's own ──────────
export const WithdrawReasons: React.FC<{
  prompt: React.ReactNode;
  note: string;
  busy: boolean;
  onPick: (reason: RemovalReason) => void;
  onCancel: () => void;
}> = ({ prompt, note, busy, onPick, onCancel }) => {
  const [picked, setPicked] = useState<RemovalReason | null>(null);
  return (
    <div className="mt-2.5 rounded-2xl bg-fg/5 p-2.5">
      <p className="text-xs text-fg">{prompt}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REMOVAL_REASONS.map((reason) => (
          <Button
            key={reason} variant="outline" size="sm"
            isLoading={busy && picked === reason} disabled={busy}
            onClick={() => { setPicked(reason); onPick(reason); }}
          >
            {reason}
          </Button>
        ))}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
      <p className="mt-1.5 text-xs text-fg/70">{note}</p>
    </div>
  );
};
