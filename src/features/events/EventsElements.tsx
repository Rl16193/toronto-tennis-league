import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Calendar, CheckCircle2, MapPin, Pencil, Star } from 'lucide-react';
import { Button } from '../../components/Button';
import { field, fieldLabelCls } from '../../components/Input';
import { Sheet } from '../../components/Sheet';
import { RacquetIcon } from '../../components/RacquetIcon';
import { useAuth } from '../../context/AuthContext';
import { MemberSearchInput, type MemberPick } from '../members/MemberSearchInput';
import { TennisEvent } from '../../types';
import { isLadderEvent, isRecurringWeekly, isSeasonOpener, isTournamentEvent } from '../../utils/eventTypes';
import {
  getEventEndDate,
  getEventStartDate,
  parseEndInstant,
  parseValidDate,
  type FirestoreDateLike,
} from '../../utils/eventDates';
import { DOUBLES_DIVISIONS } from '../tournament/types';
import { JoinFormState, SlotResult } from './types';
import { DisplayEvent, EVENT_SKILL_OPTIONS, EVENT_TYPE_OPTIONS, EventFormState } from './services/eventService';

// Events page presentation: event card, creator form, join sheet, schedule formatters.
// Data access lives in ./services/eventService.ts and ./hooks/; shared form types in ./types.ts.

// ─── Schedule formatting ─────────────────────────────────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const getEventDays = (event: TennisEvent): number[] => {
  const raw = event.day;
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw
          .split(/,|&|and|\//i)
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
  return parts.map((d) => WEEKDAY_MAP[d.toLowerCase()]).filter((d): d is number => d !== undefined);
};

export const formatEventSchedule = (event: TennisEvent): string | null => {
  const days = getEventDays(event);
  const dayLabel = days.length > 0 ? days.map((d) => DAY_LABELS[d]).join(', ') : null;
  if (isRecurringWeekly(event) && dayLabel && event.time) return `Every ${dayLabel} • ${event.time}`;
  if (isRecurringWeekly(event) && dayLabel) return `Every ${dayLabel}`;
  const start = parseValidDate(getEventStartDate(event));
  if (start) {
    const dateLabel = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
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

// End-of-day: "join by 2026-08-10" means you can still join during Aug 10. Parsing the date-only
// string with `new Date()` made it UTC midnight, closing registration ~28h early in Toronto.
const getJoinLastDateMs = (event: DisplayEvent): number | null => {
  const raw = (event as unknown as Record<string, unknown>).join_last_date as FirestoreDateLike;
  return parseEndInstant(raw)?.getTime() ?? null;
};

const LATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** After join_last_date but within the 7-day late-registration window (tournament only). */
export const isLateRegistration = (event: DisplayEvent): boolean => {
  const ms = getJoinLastDateMs(event);
  if (ms === null) return false;
  const now = Date.now();
  return now > ms && now <= ms + LATE_WINDOW_MS;
};

/** Hard close: more than 7 days past join_last_date — no join of any kind. */
const isJoinHardClosed = (event: DisplayEvent): boolean => {
  const ms = getJoinLastDateMs(event);
  if (ms === null) return false;
  return Date.now() > ms + LATE_WINDOW_MS;
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
export const EventCard: React.FC<EventCardProps> = ({
  event,
  index,
  isJoined,
  authLoading,
  isLoggedIn,
  onJoin,
  onEdit,
}) => {
  const dateLabel = isTournamentEvent(event) ? formatTournamentRange(event) : formatEventSchedule(event);
  const isTournament = isTournamentEvent(event);
  // League Ladder: no registration — the card's action opens the ladder Challenges tab.
  const isLadder = isLadderEvent(event);
  const navigate = useNavigate();

  const [descExpanded, setDescExpanded] = useState(false);
  const description = event.about || event.description;

  const isLate = isLateRegistration(event);
  const isHardClosed = isJoinHardClosed(event);
  // Non-tournament events have no draw slots — late registration doesn't apply.
  const joinClosed = isHardClosed || (isLate && !isTournament);

  const buttonLabel = isJoined
    ? 'Joined'
    : joinClosed
      ? 'Registration Closed'
      : authLoading
        ? 'Loading...'
        : !isLoggedIn
          ? 'Log In to Join'
          : isLate
            ? 'Late Registration'
            : 'Join Event';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-tennis-surface/30 rounded-2xl p-5 flex flex-col gap-3 transition-colors"
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <span className="px-2.5 py-0.5 bg-clay/10 border border-clay/20 rounded-lg text-[10px] font-bold text-clay-fg uppercase tracking-widest">
          {isLadder ? 'Challenges' : event.type}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {isJoined && <CheckCircle2 className="w-4 h-4 text-badge-win" />}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(event)}
              aria-label="Edit event"
              className="text-fg/70 hover:text-fg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Title row carries the card's action on the right, sitting directly under the Edit
          pencil. It used to live in a bordered strip at the very bottom of the card, which put
          the one thing people came to tap below the description and the detail pills. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-fg leading-snug">{event.title}</h3>
          {isSeasonOpener(event) && (
            <p className="text-xs font-semibold uppercase tracking-wider text-badge mt-1">First Tournament of 2026</p>
          )}
        </div>
        <div className="shrink-0">
          {isLadder ? (
            <Button
              variant="clay"
              size="sm"
              onClick={() => navigate(isLoggedIn ? '/matches?mode=challenges' : '/login')}
              disabled={authLoading}
            >
              <RacquetIcon className="w-3.5 h-3.5 mr-1" />
              {isLoggedIn ? 'Challenge Now' : 'Log In to Challenge'}
            </Button>
          ) : (
            <Button
              variant={isJoined ? 'secondary' : 'clay'}
              size="sm"
              onClick={() => (isLoggedIn ? onJoin(event) : navigate('/signup?intent=join-event'))}
              disabled={isJoined || joinClosed || authLoading}
            >
              {buttonLabel}
            </Button>
          )}
        </div>
      </div>

      {description && (
        <div>
          <p className={`text-xs text-fg/70 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>{description}</p>
          {description.length > 100 && (
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              className="text-xs font-semibold text-clay-fg hover:text-clay/80 transition-colors mt-0.5"
            >
              {descExpanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {dateLabel && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-fg/5 text-xs text-fg/70">
            <Calendar className="w-3 h-3 text-clay-fg shrink-0" />
            {dateLabel}
          </span>
        )}
        {event.location && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-fg/5 text-xs text-fg/70">
            <MapPin className="w-3 h-3 text-clay-fg shrink-0" />
            {event.location}
          </span>
        )}
        {event.skill_level && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-fg/5 text-xs text-fg/70">
            <Star className="w-3 h-3 text-clay-fg shrink-0" />
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
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

// Compact field chrome: smaller labels, tighter inputs, and short fields paired two-across so
// the whole form fits in roughly one phone screen instead of eleven stacked full-width rows.
const fieldCls = `${field} bg-tennis-dark/70`;
const labelCls = fieldLabelCls;
const req = <span className="text-clay-fg">*</span>;

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
          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
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
  onSubmit,
  onClose,
}) => {
  const set = (patch: Partial<EventFormState>) => setEventForm({ ...eventForm, ...patch });
  const isTournament = eventForm.type === 'Tournament';

  return (
    <Sheet maxWidthClassName="max-w-md" onClose={onClose} title={isEditing ? 'Edit Event' : 'Add an Event'}>
      <form onSubmit={onSubmit} className="p-5 pt-2 space-y-3.5">
        {eventFormMessage && (
          <div
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
              eventFormMessage.type === 'success'
                ? 'border-green-500/20 bg-green-500/10 text-badge-win'
                : 'border-red-500/20 bg-red-500/10 text-badge-loss'
            }`}
          >
            {eventFormMessage.text}
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="ev-title">
            Title {req}
          </label>
          <input
            id="ev-title"
            value={eventForm.title}
            onChange={(e) => set({ title: e.target.value })}
            className={fieldCls}
            placeholder="Spring Ladder Tournament"
          />
        </div>

        {/* Type and Skill are both short selects — pairing them saves a row. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-type">
              Type {req}
            </label>
            <select
              id="ev-type"
              value={eventForm.type}
              onChange={(e) => set({ type: e.target.value })}
              className={fieldCls}
            >
              {EVENT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-skill">
              Skill level
            </label>
            <select
              id="ev-skill"
              value={eventForm.skillLevel}
              onChange={(e) => set({ skillLevel: e.target.value })}
              className={fieldCls}
            >
              {EVENT_SKILL_OPTIONS.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-loc">
              Location
            </label>
            <input
              id="ev-loc"
              value={eventForm.location}
              onChange={(e) => set({ location: e.target.value })}
              className={fieldCls}
              placeholder="High Park"
            />
          </div>
        </div>

        {/* The three dates sit together — a native date input is narrow enough to pair. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-start">
              Start date {req}
            </label>
            <input
              id="ev-start"
              type="date"
              value={eventForm.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-end">
              End date {req}
            </label>
            <input
              id="ev-end"
              type="date"
              value={eventForm.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              className={fieldCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-join">
              Join by
            </label>
            <input
              id="ev-join"
              type="date"
              value={eventForm.joinLastDate}
              onChange={(e) => set({ joinLastDate: e.target.value })}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-time">
              Time
            </label>
            <input
              id="ev-time"
              value={eventForm.time}
              onChange={(e) => set({ time: e.target.value })}
              className={fieldCls}
              placeholder="10:00 AM - 2:00 PM"
            />
          </div>
        </div>

        {isTournament && (
          <div className="grid grid-cols-2 gap-3">
            <Toggle
              label="Format"
              options={[
                { value: 'knockout', label: 'Knockout' },
                { value: 'rr', label: 'Round Robin' },
              ]}
              value={eventForm.tournamentFormat}
              onChange={(v) => set({ tournamentFormat: v as EventFormState['tournamentFormat'] })}
            />
            <Toggle
              label="Participants"
              options={[
                { value: 'Singles', label: 'Singles' },
                { value: 'Doubles', label: 'Doubles' },
              ]}
              value={eventForm.tournamentChoice}
              onChange={(v) => set({ tournamentChoice: v as EventFormState['tournamentChoice'] })}
            />
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="ev-about">
            About {req}
          </label>
          <textarea
            id="ev-about"
            value={eventForm.about}
            onChange={(e) => set({ about: e.target.value })}
            rows={3}
            className={fieldCls}
            placeholder="Format, expectations, and anything players should know."
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="clay" isLoading={creatingEvent} className="flex-1">
            {isEditing ? 'Save' : 'Add Event'}
          </Button>
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
  slotStatus: SlotResult | null;
  loadingMatches?: boolean;
  slotFallbackConfirmed: boolean;
  setSlotFallbackConfirmed: (v: boolean) => void;
  joining: boolean;
  onSubmitJoin: () => void;
  onClose: () => void;
};

const chip = (active: boolean) =>
  `px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
    active ? 'bg-clay text-white border-clay' : 'bg-white text-ink border-fg hover:bg-white/90'
  }`;

// Join flow as a bottom sheet (wireframe 1g) — format chips, division chips, partner fields,
// notices, submit. Extracted from the old in-card expanding form so the events grid never
// reflows, and the flow matches every other sheet in the app.
export const JoinEventSheet: React.FC<JoinEventSheetProps> = ({
  event,
  isLate,
  seniorsEligible,
  joinForm,
  setJoinForm,
  joinError,
  slotStatus,
  loadingMatches,
  slotFallbackConfirmed,
  setSlotFallbackConfirmed,
  joining,
  onSubmitJoin,
  onClose,
}) => {
  const { user } = useAuth();
  const currentUserId = user?.uid;
  const isTournament = isTournamentEvent(event);
  const fixedChoice = event.tournament_choice; // set on new events; undefined on old events

  // ONE source of truth. This used to be `fixedChoice ?? joinForm.tournamentChoice` for display
  // while validation and the Firestore write both read `joinForm.tournamentChoice`, reconciled
  // only by an effect that wrote back a stale copy of the form — and the parent resets that same
  // form to Singles on every event change. When the two drifted apart a player filled in a
  // Doubles-looking form and Singles was saved, with the partner-name check (keyed on the other
  // value) never firing. That's how four Zephyr Open Doubles signups ended up invisible.
  // `useJoin` now seeds the form from the event, and the submit path re-derives it from the
  // event too, so a locked event cannot save the wrong format.
  const displayChoice = joinForm.tournamentChoice;
  const divisions = displayChoice === 'Doubles' ? DOUBLES_DIVISIONS : SINGLES_DIVISIONS;

  // The picked partner. Only the name and "is a member" reach Firestore (`doubles` /
  // `partner_in_app`), so the member id is transient and lives here rather than in joinForm.
  // The sheet remounts per event alongside the form reset, so the two can't drift.
  const [partnerPick, setPartnerPick] = useState<MemberPick | null>(null);

  // No visible title — the event name already reads on the card behind this sheet. ariaLabel keeps
  // the dialog named for screen readers now that no heading is drawn.
  return (
    <Sheet onClose={onClose} ariaLabel={`Join ${event.title}`} maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-4">
        {isTournament ? (
          <>
            {/* Format — only for old events without a locked tournament_choice */}
            {!fixedChoice && (
              <div>
                <p className="text-xs font-bold text-fg/70 uppercase tracking-widest mb-2">Format</p>
                <div className="flex gap-2">
                  {(['Singles', 'Doubles'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() =>
                        setJoinForm({ ...joinForm, tournamentChoice: choice, division: '', seniors: false })
                      }
                      className={`flex-1 ${chip(joinForm.tournamentChoice === choice)}`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Division */}
            <div>
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
            </div>

            {/* Retired Pro 55+ opt-in — singles only, shown only to eligible players */}
            {displayChoice === 'Singles' && seniorsEligible && (
              <button
                type="button"
                onClick={() => setJoinForm({ ...joinForm, seniors: !joinForm.seniors })}
                className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                  joinForm.seniors ? 'border-clay/50 bg-clay/10' : 'border-fg/10 bg-fg/5 hover:border-fg/30'
                }`}
                aria-pressed={joinForm.seniors}
              >
                <span>
                  <span className="block text-sm font-bold text-fg">Join the Retired Pro draw (55+)</span>
                  <span className="block text-xs text-fg/70 mt-0.5">
                    Play in the age-based Retired Pro group instead of skill routing.
                  </span>
                </span>
                <span
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                    joinForm.seniors ? 'bg-clay border-clay text-white text-xs' : 'border-fg/20'
                  }`}
                >
                  {joinForm.seniors ? '✓' : ''}
                </span>
              </button>
            )}

            {/* Doubles-only fields */}
            {displayChoice === 'Doubles' && (
              <>
                {/* Autosearch instead of free text. A doubles team is only recognised when both
                    partners name each other exactly (deduplicateDoublesTeams), so a typo here
                    silently leaves two half-teams. Picking from the roster also answers "is your
                    partner in the app?" by itself, so that manual Yes/No question is gone. */}
                <MemberSearchInput
                  label="Partner"
                  value={partnerPick}
                  onChange={(pick) => {
                    setPartnerPick(pick);
                    setJoinForm({
                      ...joinForm,
                      partnerName: pick?.name ?? '',
                      partnerInApp: pick && pick.memberId ? 'yes' : 'no',
                      partnerUid: pick?.memberId ?? '',
                    });
                  }}
                  excludeId={currentUserId}
                  allowGuest
                  placeholder="Search for your partner…"
                  hint="Not on the app yet? Type their full name and pick “not on the app”."
                />
                <div>
                  <p className="text-xs font-bold text-fg/70 uppercase tracking-widest mb-2">Combined Skill (1–5)</p>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    step={0.5}
                    value={joinForm.combinedSkill}
                    onChange={(e) => setJoinForm({ ...joinForm, combinedSkill: e.target.value })}
                    placeholder="e.g. 3.5"
                    className="border border-fg/25 w-full rounded-xl bg-tennis-dark/70 px-3 py-2.5 text-sm text-fg outline-none focus:border-clay"
                  />
                </div>
              </>
            )}

            {isLate && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-badge">
                <p className="font-semibold">Late registration. Limited spots remaining.</p>
                <p className="mt-0.5 text-badge/70">You'll be placed directly into an open draw slot.</p>
              </div>
            )}

            {slotStatus?.status === 'fallback' && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-badge">
                <p className="font-semibold mb-1">
                  {slotStatus.intendedGroup} draw is full — you'll be placed in the {slotStatus.actualGroup} draw.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={slotFallbackConfirmed}
                    onChange={(e) => setSlotFallbackConfirmed(e.target.checked)}
                    className="accent-clay"
                  />
                  I understand and wish to continue
                </label>
              </div>
            )}
            {slotStatus?.status === 'full' && (
              <p className="text-xs text-badge-loss font-semibold">This draw is currently full.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-fg/70">Reserve your spot in this event.</p>
        )}

        {joinError && <p className="text-xs font-semibold text-badge-loss">{joinError}</p>}

        <Button
          onClick={onSubmitJoin}
          isLoading={joining || loadingMatches}
          disabled={
            joining ||
            loadingMatches ||
            slotStatus?.status === 'full' ||
            (slotStatus?.status === 'fallback' && !slotFallbackConfirmed)
          }
          className="w-full"
        >
          {loadingMatches ? 'Loading draw…' : 'Join Event'}
        </Button>
      </div>
    </Sheet>
  );
};
