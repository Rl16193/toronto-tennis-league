import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { AppNotification, timeAgo, useNotifications } from './useNotifications';

// Bell + unread badge in the top bar. Opening the panel marks everything read; tapping an item
// navigates to whatever it's about.
export const NotificationBell: React.FC = () => {
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) markAllRead();
  };

  const openItem = (n: AppNotification) => {
    setOpen(false);
    if (!n.read) markRead(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative p-2 rounded-xl text-white/80 hover:text-clay hover:bg-clay/5 transition-colors"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-clay text-white text-[10px] font-black flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-2xl bg-tennis-dark border border-white/10 shadow-2xl z-50">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Notifications</p>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-tennis-surface/40 rounded-xl animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-white/40">Nothing yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-white/[0.04] transition-colors ${n.read ? '' : 'bg-clay/[0.07]'}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-clay shrink-0" />}
                    <div className={`min-w-0 flex-1 ${n.read ? 'pl-3.5' : ''}`}>
                      <p className="text-sm font-semibold text-white leading-snug">{n.title}</p>
                      {n.body && <p className="text-xs text-white/60 mt-0.5 leading-snug">{n.body}</p>}
                      <p className="text-[10px] text-white/30 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
