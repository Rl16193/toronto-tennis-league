import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { Button } from './Button';
import { NotificationBell } from '../features/notifications/NotificationBell';

// Slim top bar: brand (→ Home) + auth only. Primary navigation lives in the bottom tab bar
// (BottomNav), app-style.
export const Navbar: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-tennis-dark/90 backdrop-blur-md py-2 shadow-xl border-b border-white/5'
          : 'bg-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">

          {/* Logo — back arrow on the auth page */}
          {isAuthPage ? (
            <Link
              to="/"
              className="flex items-center gap-2 shrink-0 text-white hover:text-clay transition-colors"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-semibold">Back</span>
            </Link>
          ) : (
            <Link to="/" className="flex items-center shrink-0" aria-label="Home">
              <span className="text-lg md:text-xl font-bold font-['Montserrat'] tracking-tight">
                <span className="text-white">RACQUETS</span>
                <span className="text-clay"> &</span>
                <span className="text-white"> STRINGS</span>
              </span>
            </Link>
          )}

          {/* Auth */}
          {!isAuthPage && (
            <div className="flex items-center gap-3 shrink-0">
              {user ? (
                <>
                  <NotificationBell />
                  <button
                    onClick={handleLogout}
                    className="p-2 rounded-xl text-white/80 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                    aria-label="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                  <Link to="/profile" aria-label="Profile">
                    <div className="w-9 h-9 rounded-full border-2 border-clay p-0.5 overflow-hidden hover:scale-105 transition-transform">
                      {profile?.user.avatar ? (
                        <img
                          src={profile.user.avatar}
                          alt="Profile"
                          className="w-full h-full rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="w-full h-full rounded-full bg-tennis-surface flex items-center justify-center text-sm font-black text-white/80">
                          {(profile?.user.name || user.email || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </Link>
                </>
              ) : (
                <Link to="/login">
                  <Button size="sm">Join or Log In</Button>
                </Link>
              )}
            </div>
          )}

        </div>
      </div>
    </nav>
  );
};
