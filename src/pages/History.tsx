import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay } from '../lib/motion';
import { useAuth } from '../context/AuthContext';
import { useUserMatches } from '../features/matches/useUserMatches';
import { fetchCompletedEvents, type CompletedEvent } from '../features/events/services/eventService';
import { CompletedEventRow } from '../features/events/EventsElements';


// History tab — two sections: My Matches (personal results, newest first) and Past Tournaments
// (the completed-events archive; opening one deep-links into the Tournament page read-only).
export const History: React.FC = () => {
  const { user } = useAuth();
  const { matches, loading } = useUserMatches(user?.uid);
  const [pastEvents, setPastEvents] = useState<CompletedEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => { document.title = 'History · Racquets & Strings'; }, []);

  // A tournament is "past" once scoring stamps `completed_at`: every draw has played its final.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchCompletedEvents()
      .then((rows) => { if (!cancelled) setPastEvents(rows); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEventsLoading(false); });
    return () => { cancelled = true; };
  }, [user?.uid]);

  if (!user) return null; // private route

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      {/* Title kept in the DOM for search engines and screen readers, but hidden — the bottom
          nav already shows which tab you're on. */}
      <h1 className="sr-only">History</h1>

      <p className="text-xs font-bold uppercase tracking-widest text-fg/70 mb-3">My Matches</p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-fg/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-2xl bg-fg/5 py-12 text-center">
          <p className="text-sm text-fg/70">No matches yet. Join an event and your results will land here.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-fg/5 overflow-hidden divide-y divide-fg/5">
          {matches.map((m, i) => (
            <motion.div key={m.id} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }} className="flex items-center gap-3 px-4 py-3.5">
              <span
                className={`w-8 h-8 shrink-0 rounded-2xl flex items-center justify-center text-xs font-black ${
                  m.drawn ? 'bg-fg/10 text-fg' : m.won ? 'bg-green-500/15 text-badge-win' : 'bg-red-500/15 text-badge-loss'
                }`}
              >
                {m.drawn ? 'D' : m.won ? 'W' : 'L'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg truncate">vs {m.opponentName}</p>
                {m.completedAt > 0 && (
                  <p className="text-xs text-fg/70">
                    {new Date(m.completedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <span className="text-xs font-bold text-fg/70 tabular-nums shrink-0">{m.scoreLine || '—'}</span>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-xs font-bold uppercase tracking-widest text-fg/70 mb-3 mt-8">Past Tournaments</p>

      {eventsLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-fg/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : pastEvents.length === 0 ? (
        <div className="rounded-2xl bg-fg/5 py-10 text-center">
          <p className="text-sm text-fg/70">No completed tournaments yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-fg/5 overflow-hidden divide-y divide-fg/5">
          {pastEvents.map((e, i) => (
            <motion.div key={e.id} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}>
            <CompletedEventRow e={e} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
