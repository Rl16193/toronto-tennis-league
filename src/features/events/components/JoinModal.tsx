import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Calendar, MapPin, Users, Clock3, Repeat, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/Button';
import { DisplayEvent } from '../services/eventService';
import { isTournamentEvent, isSeasonOpener, isRecurringWeekly } from '../../../utils/eventTypes';
import { formatDateLabel, getEventStartDate, getEventEndDate } from '../../../utils/eventDates';
import { formatEventSchedule } from '../utils/eventFormatters';
import type { JoinFormState, SlotResult } from '../types';
import { LOGIN_ROUTE, SIGNUP_ROUTE } from '../hooks/useJoin';

interface Props {
  event: DisplayEvent;
  joinForm: JoinFormState;
  setJoinForm: (form: JoinFormState) => void;
  joinError: string;
  joining: boolean;
  slotStatus: SlotResult | null;
  slotFallbackConfirmed: boolean;
  setSlotFallbackConfirmed: (v: boolean) => void;
  user: { uid: string } | null;
  skillLevel: number | undefined;
  getJoinedChoices: (id: string) => Set<string>;
  hasJoinedTournamentChoice: (id: string, choice: 'Singles' | 'Doubles') => boolean;
  isFullyJoined: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export const JoinModal: React.FC<Props> = ({
  event, joinForm, setJoinForm, joinError, joining,
  slotStatus, slotFallbackConfirmed, setSlotFallbackConfirmed,
  user, skillLevel, getJoinedChoices, hasJoinedTournamentChoice,
  isFullyJoined, onClose, onSubmit,
}) => {
  const schedule = formatEventSchedule(event);
  const startLabel = formatDateLabel(getEventStartDate(event));
  const endDate = getEventEndDate(event);
  const dateRange = endDate && endDate !== getEventStartDate(event) ? `${startLabel} to ${formatDateLabel(endDate)}` : startLabel;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-tennis-dark/80 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        className="relative w-full max-w-3xl bg-tennis-surface border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-6 right-6 z-10 w-10 h-10 bg-tennis-dark/50 hover:bg-tennis-dark rounded-full flex items-center justify-center text-white transition-colors">
          <X className="w-6 h-6" />
        </button>

        <div className="h-48 sm:h-64 relative">
          {event.image ? (
            <img src={event.image} alt={event.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tennis-dark via-tennis-surface to-clay/20 px-8 text-center">
              <span className="text-2xl font-bold text-white">{event.title}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-tennis-surface via-transparent to-transparent" />
        </div>

        <div className="p-5 sm:p-8 md:p-10 space-y-6 sm:space-y-8">
          <div className="space-y-4">
            <span className="inline-block px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay uppercase tracking-widest">
              {event.type}
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-black text-white">{event.title}</h2>
            {isSeasonOpener(event) && (
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">First Tournament of 2026</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-white text-sm">
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-clay shrink-0" /><span>{dateRange}</span></div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-clay shrink-0" /><span>{event.location}</span></div>
              <div className="flex items-center gap-2"><Users className="w-4 h-4 text-clay shrink-0" /><span>Skill: {event.skill_level || event.type}</span></div>
              {schedule && <div className="flex items-center gap-2"><Clock3 className="w-4 h-4 text-clay shrink-0" /><span>{schedule}</span></div>}
              {isRecurringWeekly(event) && <div className="flex items-center gap-2"><Repeat className="w-4 h-4 text-clay shrink-0" /><span>Recurring weekly</span></div>}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-white font-bold uppercase tracking-widest text-xs">About</h4>
            <p className="text-white/70 leading-relaxed text-sm">
              {event.about || event.description || 'Join us for a Toronto Tennis League event.'}
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/5 bg-white/5 p-5 sm:p-6 space-y-5">
            <div>
              <h4 className="text-white font-bold">Join Event</h4>
              <p className="text-white/60 text-sm mt-1">
                {isTournamentEvent(event) ? 'Choose singles or doubles before we register you.' : 'Reserve your spot for this event.'}
              </p>
            </div>

            {joinError && (
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" /><span>{joinError}</span>
              </div>
            )}

            {!user && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                Guest joining is not available. Join the league to register for events.
              </div>
            )}

            {isFullyJoined ? (
              <div className="flex items-center gap-2 text-green-500 font-bold">
                <CheckCircle2 className="w-5 h-5" /><span>You're already registered for all draws.</span>
              </div>
            ) : (
              <div className="space-y-5">
                {isTournamentEvent(event) && (
                  <>
                    {getJoinedChoices(event.id).size > 0 && (
                      <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-400">
                        Already joined: {[...getJoinedChoices(event.id)].join(', ')}
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white">Format <span className="text-orange-500">*</span></label>
                      <div className="flex gap-3">
                        {(['Singles', 'Doubles'] as const).map((choice) => (
                          <button
                            key={choice}
                            disabled={hasJoinedTournamentChoice(event.id, choice)}
                            onClick={() => setJoinForm({ ...joinForm, tournamentChoice: choice, division: choice === 'Singles' && joinForm.division === 'Mixed Doubles' ? '' : joinForm.division, partnerName: choice === 'Singles' ? '' : joinForm.partnerName, partnerInApp: choice === 'Singles' ? '' : joinForm.partnerInApp, combinedSkill: choice === 'Singles' ? '' : joinForm.combinedSkill })}
                            className={`px-3 py-2 sm:px-4 sm:py-3 rounded-2xl border font-semibold text-sm transition-all ${joinForm.tournamentChoice === choice ? 'bg-clay/10 border-clay text-clay' : 'bg-tennis-surface/50 border-white/10 text-white'} ${hasJoinedTournamentChoice(event.id, choice) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >{choice}</button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white">Division <span className="text-orange-500">*</span></label>
                      <div className="flex flex-wrap gap-2">
                        {(["Men's", "Women's", 'Mixed Doubles'] as const).map((division) => {
                          const locked = joinForm.tournamentChoice === 'Singles' && division === 'Mixed Doubles';
                          return (
                            <button
                              key={division} type="button" disabled={locked}
                              onClick={() => { if (!locked) setJoinForm({ ...joinForm, division }); }}
                              className={`px-3 py-2 sm:px-4 sm:py-3 rounded-2xl border font-semibold text-sm transition-all ${joinForm.division === division ? 'bg-clay/10 border-clay text-clay' : locked ? 'bg-tennis-dark/70 border-white/5 text-white/40 cursor-not-allowed' : 'bg-tennis-surface/50 border-white/10 text-white'}`}
                            >{division}</button>
                          );
                        })}
                      </div>
                    </div>

                    {joinForm.tournamentChoice === 'Doubles' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2 sm:col-span-2">
                          <label className="block text-sm font-medium text-white">Partner Name <span className="text-orange-500">*</span></label>
                          <input value={joinForm.partnerName} onChange={(e) => setJoinForm({ ...joinForm, partnerName: e.target.value })} className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white placeholder-gray-500 focus:border-clay outline-none" placeholder="Enter partner name" />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-white">Partner in app? <span className="text-orange-500">*</span></label>
                          <select value={joinForm.partnerInApp} onChange={(e) => setJoinForm({ ...joinForm, partnerInApp: e.target.value as 'yes' | 'no' | '' })} className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white focus:border-clay outline-none">
                            <option value="">Select</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-white">Combined Skill <span className="text-orange-500">*</span></label>
                          <input type="number" min="1" max="5" step="0.5" value={joinForm.combinedSkill} onChange={(e) => setJoinForm({ ...joinForm, combinedSkill: e.target.value })} className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white placeholder-gray-500 focus:border-clay outline-none" placeholder="3.5" />
                        </div>
                      </div>
                    )}

                    {joinForm.tournamentChoice === 'Singles' && (
                      <div className="rounded-2xl border border-clay/20 bg-clay/5 p-4 text-sm text-white">
                        Registering with skill level: <span className="text-clay font-bold">{skillLevel ?? 'Not set'}</span>
                      </div>
                    )}

                    {slotStatus?.status === 'fallback' && (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 space-y-3">
                        <div className="flex items-start gap-3 text-amber-300 text-sm">
                          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                          <p><span className="font-bold">{slotStatus.intendedGroup} Draw is full.</span> Joining will place you in the {slotStatus.actualGroup} draw.</p>
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={slotFallbackConfirmed} onChange={(e) => setSlotFallbackConfirmed(e.target.checked)} className="w-4 h-4 accent-clay" />
                          <span className="text-sm text-amber-200">I understand and wish to continue</span>
                        </label>
                      </div>
                    )}

                    {slotStatus?.status === 'full' && (
                      <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                        <p>{joinForm.tournamentChoice === 'Doubles' ? 'Doubles' : `${joinForm.division} Singles`} draw is full.</p>
                      </div>
                    )}
                  </>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                  <Button variant="ghost" onClick={onClose}>Cancel</Button>
                  {user ? (
                    <Button onClick={onSubmit} isLoading={joining} disabled={slotStatus?.status === 'full' || (slotStatus?.status === 'fallback' && !slotFallbackConfirmed)}>
                      Join Event
                    </Button>
                  ) : (
                    <div className="flex gap-3">
                      <Link to={LOGIN_ROUTE}><Button>Log In</Button></Link>
                      <Link to={SIGNUP_ROUTE}><Button variant="outline">Join the League</Button></Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
