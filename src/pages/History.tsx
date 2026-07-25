import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, HistoryIcon, Trophy } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
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

  useEffect(() => { document.title = 'History — Racquets & Strings'; }, []);

  // A tournament is "past" once its final has a confirmed winner — same rule the Tournament
  // page uses to classify events.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      getDocs(collection(db, 'events')),
      getDocs(query(collection(db, 'tournament_matches'), where('round', '==', 'F'), where('status', '==', 'complete'))),
    ])
      .then(([eventsSnap, finalsSnap]) => {
        if (cancelled) return;
        const completedIds = new Set(
          finalsSnap.docs.filter((d) => d.data().winner_user_id).map((d) => d.data().event_id as string),
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
      <div className="flex items-center gap-2 mb-5">
        <HistoryIcon className="w-6 h-6 text-clay" />
        <h1 className="text-2xl md:text-3xl font-display font-bold text-white">History</h1>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">My Matches</p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 border border-white/5 py-12 text-center">
          <p className="text-sm text-white/40">No matches yet — join an event and your results will land here.</p>
        </div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 border border-white/5 overflow-hidden divide-y divide-white/5">
          {matches.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3.5">
              <span
                className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-xs font-black ${
                  m.won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                }`}
              >
                {m.won ? 'W' : 'L'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">vs {m.opponentName}</p>
                {m.completedAt > 0 && (
                  <p className="text-[11px] text-white/40">
                    {new Date(m.completedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <span className="text-xs font-bold text-white/60 tabular-nums shrink-0">{m.scoreLine || '—'}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3 mt-8">Past Tournaments</p>

      {eventsLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : pastEvents.length === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 border border-white/5 py-10 text-center">
          <p className="text-sm text-white/40">No completed tournaments yet.</p>
        </div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 border border-white/5 overflow-hidden divide-y divide-white/5">
          {pastEvents.map((e) => (
            <Link
              key={e.id}
              to={`/tournament?event=${e.id}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.04] transition-colors"
            >
              <span className="w-8 h-8 shrink-0 rounded-xl bg-clay/15 border border-clay/25 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-clay" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{e.title}</p>
                {e.when && (
                  <p className="text-[11px] text-white/40">
                    {e.when.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
