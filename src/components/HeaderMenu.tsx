import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Info, Bell, LogOut, User, Medal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../features/notifications/useNotifications';

const badgeLabel = (n: number) => (n > 9 ? '9+' : n);

// Smart slide menu that opens from the right. Keeps the hamburger trigger in the top bar and
// moves the full navigation list into a slide-out drawer instead of the old bottom sheet.
export const HeaderMenu: React.FC = () => {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<() => void>(() => setOpen(false));

  useEffect(() => { closeRef.current = () => setOpen(false); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const close = () => setOpen(false);

  const handleLogout = async () => {
    close();
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-xl text-fg hover:text-clay hover:bg-clay/5 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
        {!!user && unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-clay text-white text-[10px] font-black flex items-center justify-center">
            {badgeLabel(unreadCount)}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[100]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-tennis-dark/70 backdrop-blur-md"
              onClick={close}
            />

            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="absolute inset-y-0 right-0 w-[15.5rem] bg-tennis-surface border-l border-fg/10 shadow-2xl flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
            >
              <div className="px-4 pt-4 pb-3 border-b border-fg/8">
                <div className="flex items-center justify-between gap-2">
                  <Link to="/" onClick={close} className="text-sm font-bold font-['Montserrat'] tracking-tight whitespace-nowrap">
                    <span className="text-fg">RACQUETS</span>
                    <span className="text-clay"> &</span>
                    <span className="text-fg"> STRINGS</span>
                  </Link>
                  <button
                    type="button"
                    onClick={close}
                    className="p-1.5 -mr-1 rounded-xl text-fg/70 hover:text-clay hover:bg-clay/5 transition-colors shrink-0"
                    aria-label="Close menu"
                  >
                    <span className="sr-only">Close</span>
                    <Menu className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <nav className="overflow-y-auto px-3 pb-6 pt-2 space-y-1">
                <Link
                  to="/about"
                  onClick={close}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-fg hover:bg-fg/5 transition-colors"
                >
                  <Info className="w-5 h-5 text-fg/70" />
                  <span className="flex-1">About Us</span>
                </Link>

                {/* Public, like /leagues itself — the leaderboard lost its bottom-nav tab when
                    Tournament merged into Matches, so this is its way back. */}
                <Link
                  to="/leagues"
                  onClick={close}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-fg hover:bg-fg/5 transition-colors"
                >
                  <Medal className="w-5 h-5 text-fg/70" />
                  <span className="flex-1">Leaderboard</span>
                </Link>

                {user && (
                  <Link
                    to="/profile"
                    onClick={close}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-fg hover:bg-fg/5 transition-colors"
                  >
                    <User className="w-5 h-5 text-fg/70" />
                    <span className="flex-1">Profile</span>
                  </Link>
                )}

                {user && (
                  <Link
                    to="/notifications"
                    onClick={close}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-fg hover:bg-fg/5 transition-colors"
                  >
                    <Bell className="w-5 h-5 text-fg/70" />
                    <span className="flex-1">Notifications</span>
                    {!!unreadCount && (
                      <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-clay text-white text-[10px] font-black flex items-center justify-center">
                        {badgeLabel(unreadCount)}
                      </span>
                    )}
                  </Link>
                )}

                {user && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-fg hover:bg-fg/5 transition-colors w-full"
                  >
                    <LogOut className="w-5 h-5 text-fg/70" />
                    <span className="flex-1">Logout</span>
                  </button>
                )}
              </nav>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
