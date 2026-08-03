import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Calendar, MapPin, Star, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/Button';
import { RacquetIcon } from '../../../components/RacquetIcon';
import { DisplayEvent } from '../services/eventService';
import { isTournamentEvent, isSeasonOpener, isLadderEvent } from '../../../utils/eventTypes';
import { formatEventSchedule, formatTournamentRange } from '../utils/eventFormatters';

const getJoinLastDateMs = (event: DisplayEvent): number | null => {
  const raw = (event as unknown as Record<string, unknown>).join_last_date;
  if (!raw) return null;
  if (typeof raw === 'string') return new Date(raw).getTime();
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj['toDate'] === 'function') return (obj['toDate'] as () => Date)().getTime();
    if (typeof obj['seconds'] === 'number') return (obj['seconds'] as number) * 1000;
  }
  return null;
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

interface Props {
  event: DisplayEvent;
  index: number;
  isJoined: boolean;
  authLoading: boolean;
  isLoggedIn: boolean;
  onJoin: (event: DisplayEvent) => void; // opens the join sheet (wireframe 1g)
}

// Event card — display only. The join form lives in JoinEventSheet now, so tapping Join never
// reflows the grid.
export const EventCard: React.FC<Props> = ({ event, index, isJoined, authLoading, isLoggedIn, onJoin }) => {
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
      className="bg-tennis-surface/30 border border-fg/5 hover:border-clay/30 rounded-2xl p-5 flex flex-col gap-3 transition-colors"
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <span className="px-2.5 py-0.5 bg-clay/10 border border-clay/20 rounded-lg text-[10px] font-bold text-clay uppercase tracking-widest">
          {isLadder ? 'Challenges' : event.type}
        </span>
        {isJoined && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />}
      </div>

      <div>
        <h3 className="text-base font-bold text-fg leading-snug">{event.title}</h3>
        {isSeasonOpener(event) && (
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300 mt-1">First Tournament of 2026</p>
        )}
      </div>

      {description && (
        <div>
          <p className={`text-xs text-fg/50 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>{description}</p>
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
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-fg/5 border border-fg/10 text-xs text-fg/60">
            <Calendar className="w-3 h-3 text-clay shrink-0" />
            {dateLabel}
          </span>
        )}
        {event.location && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-fg/5 border border-fg/10 text-xs text-fg/60">
            <MapPin className="w-3 h-3 text-clay shrink-0" />
            {event.location}
          </span>
        )}
        {event.skill_level && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-fg/5 border border-fg/10 text-xs text-fg/60">
            <Star className="w-3 h-3 text-clay shrink-0" />
            {event.skill_level}
          </span>
        )}
      </div>

      {/* Join / status button (Challenges: no signup — straight to the Matches page) */}
      <div className="pt-3 mt-auto border-t border-fg/5">
        {isLadder ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(isLoggedIn ? '/matches?mode=challenges' : '/login')}
            disabled={authLoading}
            className="w-full"
          >
            <RacquetIcon className="w-3.5 h-3.5 mr-1" />
            {isLoggedIn ? 'Challenge Now' : 'Log In to Challenge'}
          </Button>
        ) : (
          <Button
            variant={isJoined ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => (isLoggedIn ? onJoin(event) : navigate('/signup?intent=join-event'))}
            disabled={isJoined || joinClosed || authLoading}
            className="w-full"
          >
            {buttonLabel}
          </Button>
        )}
      </div>
    </motion.div>
  );
};
