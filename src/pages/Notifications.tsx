import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay, tapScale } from '../lib/motion';
import { AppNotification, timeAgo, useNotifications } from '../features/notifications/useNotifications';

// Full-screen notifications feed (replaces the old bell dropdown). Opening the page marks
// everything read, matching the dropdown's old behavior; tapping an item deep-links to it.
export const Notifications: React.FC = () => {
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  useEffect(() => { document.title = 'Notifications — Racquets & Strings'; }, []);

  useEffect(() => {
    if (!loading && unreadCount > 0) markAllRead();
  }, [loading, unreadCount, markAllRead]);

  const openItem = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      <div className="flex items-center gap-2 mb-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-xl text-fg/70 hover:text-fg hover:bg-fg/5 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Bell className="w-5 h-5 text-clay" />
        <h1 className="text-2xl md:text-3xl font-display font-bold text-fg">Notifications</h1>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 py-16 text-center">
          <Bell className="w-8 h-8 text-fg/20 mx-auto mb-3" />
          <p className="text-sm text-fg/40">Nothing yet — match updates and task news land here.</p>
        </div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 overflow-hidden divide-y divide-fg/5">
          {items.map((n, i) => (
            <motion.button
              key={n.id}
              type="button"
              onClick={() => openItem(n)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
              whileTap={tapScale.whileTap}
              className={`w-full text-left px-4 py-3.5 hover:bg-white/[0.04] transition-colors ${n.read ? '' : 'bg-clay/[0.07]'}`}
            >
              <div className="flex items-start gap-2">
                {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-clay shrink-0" />}
                <div className={`min-w-0 flex-1 ${n.read ? 'pl-3.5' : ''}`}>
                  <p className="text-sm font-semibold text-fg leading-snug">{n.title}</p>
                  {n.body && <p className="text-xs text-fg/60 mt-0.5 leading-snug">{n.body}</p>}
                  <p className="text-[10px] text-fg/30 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
};
