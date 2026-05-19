import React from 'react';
import { motion } from 'motion/react';
import { Calendar, MapPin, User, Star, Clock3, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/Button';
import { DisplayEvent } from '../services/eventService';
import { isTournamentEvent, isSeasonOpener } from '../../../utils/eventTypes';
import { formatEventSchedule, formatTournamentRange } from '../utils/eventFormatters';

interface Props {
  event: DisplayEvent;
  index: number;
  isJoined: boolean;
  joining: boolean;
  authLoading: boolean;
  isLoggedIn: boolean;
  onJoin: (event: DisplayEvent) => void;
}

export const EventCard: React.FC<Props> = ({ event, index, isJoined, joining, authLoading, isLoggedIn, onJoin }) => {
  const dateLabel = isTournamentEvent(event) ? formatTournamentRange(event) : formatEventSchedule(event);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-tennis-surface/30 border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-clay/30 transition-colors"
    >
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

      <div className="pt-3 mt-auto border-t border-white/5">
        <Button
          variant={isJoined ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => onJoin(event)}
          isLoading={joining && !isJoined}
          disabled={isJoined}
          className="w-full"
        >
          {isJoined ? 'Joined' : authLoading ? 'Loading...' : isLoggedIn ? 'Join Event' : 'Log In to Join'}
        </Button>
      </div>
    </motion.div>
  );
};
