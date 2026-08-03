import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Info, Bell, LogOut, ChevronRight } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../features/notifications/useNotifications';
import { Sheet } from './Sheet';

const badgeLabel = (n: number) => (n > 9 ? '9+' : n);

// Header hamburger menu — replaces the old separate About-Us link / bell / logout / avatar in
// Navbar. Present on every page (rendered from Navbar, so it's global). About Us always shows;
// Notifications, Profile, and Logout only show when signed in. The unread badge appears both on
// the trigger icon and next to the Notifications row.
export const HeaderMenu: React.FC = () => {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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

  const Row: React.FC<{ to?: string; onClick?: () => void; icon: React.ReactNode; label: string; badge?: number }> = ({
    to, onClick, icon, label, badge,
  }) => {
    const content = (
      <>
        <span className="w-9 h-9 rounded-xl bg-fg/5 text-fg/70 flex items-center justify-center shrink-0">{icon}</span>
        <span className="flex-1 text-sm font-bold text-fg">{label}</span>
        {!!badge && (
          <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-clay text-white text-[10px] font-black flex items-center justify-center shrink-0">
            {badgeLabel(badge)}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-fg/30 shrink-0" />
      </>
    );
    const cls = 'w-full flex items-center gap-3 rounded-2xl border border-fg/10 bg-fg/5 hover:border-clay/40 transition-colors px-4 py-3 text-left';
    return to ? (
      <Link to={to} onClick={close} className={cls}>{content}</Link>
    ) : (
      <button type="button" onClick={onClick} className={cls}>{content}</button>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-xl text-fg/80 hover:text-clay hover:bg-clay/5 transition-colors"
        aria-label="Menu"
      >
        <Menu className="w-5 h-5" />
        {!!user && unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-clay text-white text-[10px] font-black flex items-center justify-center">
            {badgeLabel(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <Sheet onClose={close} title="Menu" maxWidthClassName="max-w-sm">
          <div className="p-6 pt-3 space-y-2.5">
            <Row to="/about" icon={<Info className="w-4 h-4" />} label="About Us" />
            {user && (
              <>
                <Row to="/notifications" icon={<Bell className="w-4 h-4" />} label="Notifications" badge={unreadCount} />
                <Row onClick={handleLogout} icon={<LogOut className="w-4 h-4" />} label="Logout" />
              </>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
};
