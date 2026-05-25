import React from 'react';
import { motion } from 'motion/react';
import { Calendar, MapPin, User, Star, Clock3, CheckCircle2, X } from 'lucide-react';
import { Button } from '../../../components/Button';
import { DisplayEvent } from '../services/eventService';
import { isTournamentEvent, isSeasonOpener } from '../../../utils/eventTypes';
import { formatEventSchedule, formatTournamentRange } from '../utils/eventFormatters';
import { JoinFormState, SlotResult } from '../types';

const isJoinClosed = (event: DisplayEvent): boolean => {
  const raw = (event as unknown as Record<string, unknown>).join_last_date;
  if (!raw) return false;
  let ms: number | null = null;
  if (typeof raw === 'string') ms = new Date(raw).getTime();
  else if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj['toDate'] === 'function') ms = (obj['toDate'] as () => Date)().getTime();
    else if (typeof obj['seconds'] === 'number') ms = (obj['seconds'] as number) * 1000;
  }
  return ms !== null && Date.now() > ms;
};

interface Props {
  event: DisplayEvent;
  index: number;
  isJoined: boolean;
  joining: boolean;
  authLoading: boolean;
  isLoggedIn: boolean;
  isExpanded: boolean;
  onExpand: (event: DisplayEvent | null) => void;
  joinForm: JoinFormState;
  setJoinForm: (form: JoinFormState) => void;
  joinError: string;
  slotStatus: SlotResult | null;
  slotFallbackConfirmed: boolean;
  setSlotFallbackConfirmed: (v: boolean) => void;
  onSubmitJoin: () => void;
}

const SINGLES_DIVISIONS = ["Men's", "Women's"] as const;
const DOUBLES_DIVISIONS = ["Men's", "Women's", 'Mixed Doubles'] as const;

export const EventCard: React.FC<Props> = ({
  event, index, isJoined, joining, authLoading, isLoggedIn,
  isExpanded, onExpand, joinForm, setJoinForm, joinError,
  slotStatus, slotFallbackConfirmed, setSlotFallbackConfirmed, onSubmitJoin,
}) => {
  const dateLabel = isTournamentEvent(event) ? formatTournamentRange(event) : formatEventSchedule(event);
  const joinClosed = isJoinClosed(event);
  const isTournament = isTournamentEvent(event);
  const divisions = joinForm.tournamentChoice === 'Doubles' ? DOUBLES_DIVISIONS : SINGLES_DIVISIONS;

  const handleJoinClick = () => {
    if (!isLoggedIn) return;
    if (isExpanded) { onExpand(null); return; }
    onExpand(event);
  };

  const buttonLabel = isJoined
    ? 'Joined'
    : joinClosed
      ? 'Registration Closed'
      : authLoading
        ? 'Loading...'
        : !isLoggedIn
          ? 'Log In to Join'
          : isExpanded
            ? 'Cancel'
            : 'Join Event';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`bg-tennis-surface/30 border rounded-2xl p-5 flex flex-col gap-3 transition-colors ${
        isExpanded ? 'border-clay/40' : 'border-white/5 hover:border-clay/30'
      }`}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <span className="px-2.5 py-0.5 bg-clay/10 border border-clay/20 rounded-lg text-[10px] font-bold text-clay uppercase tracking-widest">
          {event.type}
        </span>
        {isJoined && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />}
      </div>

      <div>
        <h3 className="text-base font-bold text-white leading-snug">{event.title}</h3>
        {isSeasonOpener(event) && (
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300 mt-1">First Tournament of 2026</p>
        )}
      </div>

      {(event.about || event.description) && (
        <p className="text-xs text-white/50 line-clamp-2 leading-relaxed">{event.about || event.description}</p>
      )}

      <div className="space-y-1.5 text-xs text-white/70">
        {dateLabel && (
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-clay shrink-0" />
            <span>{dateLabel}</span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-clay shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}
        {event.organizer && (
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-clay shrink-0" />
            <span className="truncate">{event.organizer}</span>
          </div>
        )}
        {event.skill_level && (
          <div className="flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-clay shrink-0" />
            <span>Skill: {event.skill_level}</span>
          </div>
        )}
        {event.time && event.time !== 'Anytime' && (
          <div className="flex items-center gap-2">
            <Clock3 className="w-3.5 h-3.5 text-clay shrink-0" />
            <span>{event.time}</span>
          </div>
        )}
      </div>

      {/* Inline join form */}
      {isExpanded && !isJoined && (
        <div className="pt-3 border-t border-white/10 space-y-4">
          {isTournament ? (
            <>
              {/* Format toggle */}
              <div>
                <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Format</p>
                <div className="flex gap-2">
                  {(['Singles', 'Doubles'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setJoinForm({ ...joinForm, tournamentChoice: choice, division: '' })}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                        joinForm.tournamentChoice === choice
                          ? 'bg-clay text-white border-clay'
                          : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </div>

              {/* Division */}
              <div>
                <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Division</p>
                <div className="flex flex-wrap gap-2">
                  {divisions.map((div) => (
                    <button
                      key={div}
                      type="button"
                      onClick={() => setJoinForm({ ...joinForm, division: div as JoinFormState['division'] })}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        joinForm.division === div
                          ? 'bg-clay text-white border-clay'
                          : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {div}
                    </button>
                  ))}
                </div>
              </div>

              {/* Doubles-only fields */}
              {joinForm.tournamentChoice === 'Doubles' && (
                <>
                  <div>
                    <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Partner Name</p>
                    <input
                      value={joinForm.partnerName}
                      onChange={(e) => setJoinForm({ ...joinForm, partnerName: e.target.value })}
                      placeholder="Full name"
                      className="w-full rounded-xl bg-tennis-dark/70 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-clay"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Partner in app?</p>
                    <div className="flex gap-2">
                      {(['yes', 'no'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setJoinForm({ ...joinForm, partnerInApp: v })}
                          className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                            joinForm.partnerInApp === v
                              ? 'bg-clay text-white border-clay'
                              : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                          }`}
                        >
                          {v === 'yes' ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Combined Skill (1–5)</p>
                    <input
                      type="number"
                      min={1} max={5} step={0.5}
                      value={joinForm.combinedSkill}
                      onChange={(e) => setJoinForm({ ...joinForm, combinedSkill: e.target.value })}
                      placeholder="e.g. 3.5"
                      className="w-full rounded-xl bg-tennis-dark/70 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-clay"
                    />
                  </div>
                </>
              )}

              {/* Slot feedback */}
              {slotStatus?.status === 'fallback' && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
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
                <p className="text-xs text-red-400 font-semibold">This draw is currently full.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-white/70">Reserve your spot in this event.</p>
          )}

          {joinError && (
            <p className="text-xs text-red-400 font-semibold">{joinError}</p>
          )}

          <Button
            onClick={onSubmitJoin}
            isLoading={joining}
            disabled={joining || slotStatus?.status === 'full' || (slotStatus?.status === 'fallback' && !slotFallbackConfirmed)}
            className="w-full"
          >
            Join Event
          </Button>
        </div>
      )}

      {/* Join / status button */}
      <div className="pt-3 mt-auto border-t border-white/5">
        <Button
          variant={isJoined ? 'secondary' : isExpanded ? 'ghost' : 'primary'}
          size="sm"
          onClick={handleJoinClick}
          disabled={isJoined || joinClosed || !isLoggedIn || authLoading}
          className="w-full"
        >
          {isExpanded && !isJoined ? (
            <><X className="w-3.5 h-3.5 mr-1" />Cancel</>
          ) : buttonLabel}
        </Button>
      </div>
    </motion.div>
  );
};
