import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Trophy } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay } from '../lib/motion';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useUserMatches } from '../features/matches/useUserMatches';
import { getEventDate } from './tournament/utils';

type PastEvent = { id: string; title: string; when: Date | null };

// History tab — two sections: My Matches (personal results, newest first) and Past Tournaments
// (the completed-events archive; opening one deep-links into the Tournament page read-only).
export const History: React.FC = () => {
  const { user } = useAuth();
  const { matches, loading } = useUserMatches(user?.uid);
  const [pastEvents, setPastEvents] = useState<PastEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => { document.title = 'History · Racquets & Strings'; }, []);

  // A tournament is "past" once its final has a confirmed winner — same rule the Tournament
  // page uses to classify events.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      getDocs(collection(db, 'events')),
      getDocs(query(collection(db, 'matches'), where('round', '==', 'F'), where('status', '==', 'complete'))),
    ])
      .then(([eventsSnap, finalsSnap]) => {
        if (cancelled) return;
        const completedIds = new Set(
          finalsSnap.docs.filter((d) => d.data().winner_uid).map((d) => d.data().event_id as string),
        );
        const rows = eventsSnap.docs
          .filter((d) => completedIds.has(d.id))
          .map((d) => ({
            id: d.id,
            title: (d.data().title as string) || 'Tournament',
            when: getEventDate(d.data() as Record<string, unknown>),
          }))
          .sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0));
        setPastEvents(rows);
      })
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

      <p className="text-[11px] font-bold uppercase tracking-widest text-fg/70 mb-3">My Matches</p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 py-12 text-center">
          <p className="text-sm text-fg/70">No matches yet. Join an event and your results will land here.</p>
        </div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 overflow-hidden divide-y divide-fg/5">
          {matches.map((m, i) => (
            <motion.div key={m.id} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }} className="flex items-center gap-3 px-4 py-3.5">
              <span
                className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-xs font-black ${
                  m.won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                }`}
              >
                {m.won ? 'W' : 'L'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg truncate">vs {m.opponentName}</p>
                {m.completedAt > 0 && (
                  <p className="text-[11px] text-fg/70">
                    {new Date(m.completedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <span className="text-xs font-bold text-fg/70 tabular-nums shrink-0">{m.scoreLine || '—'}</span>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-[11px] font-bold uppercase tracking-widest text-fg/70 mb-3 mt-8">Past Tournaments</p>

      {eventsLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : pastEvents.length === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 py-10 text-center">
          <p className="text-sm text-fg/70">No completed tournaments yet.</p>
        </div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 overflow-hidden divide-y divide-fg/5">
          {pastEvents.map((e, i) => (
            <motion.div key={e.id} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}>
            <Link
              to={`/matches?mode=tournament&event=${e.id}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-fg/[0.04] transition-colors"
            >
              <span className="w-8 h-8 shrink-0 rounded-xl bg-clay/15 border border-clay/25 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-clay" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg truncate">{e.title}</p>
                {e.when && (
                  <p className="text-[11px] text-fg/70">
                    {e.when.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-fg/70 shrink-0" />
            </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
