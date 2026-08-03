import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { HeaderMenu } from './HeaderMenu';

// Slim top bar: brand (→ Home) + the header hamburger (About Us / How It Works always;
// Notifications / Profile / Logout when signed in — see HeaderMenu). Primary navigation lives
// in the bottom tab bar (BottomNav), app-style.
export const Navbar: React.FC = () => {
  const { user, profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-tennis-dark/90 backdrop-blur-md py-2 shadow-xl border-b border-fg/5'
          : 'bg-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">

          {/* Logo — back arrow on the auth page */}
          {isAuthPage ? (
            <Link
              to="/"
              className="flex items-center gap-2 shrink-0 text-fg hover:text-clay transition-colors"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-semibold">Back</span>
            </Link>
          ) : (
            <Link to="/" className="flex items-center shrink-0" aria-label="Home">
              <span className="text-lg md:text-xl font-bold font-['Montserrat'] tracking-tight">
                <span className="text-fg">RACQUETS</span>
                <span className="text-clay"> &</span>
                <span className="text-fg"> STRINGS</span>
              </span>
            </Link>
          )}

          {/* Theme toggle + hamburger (About Us / How It Works / Notifications / Profile / Logout) */}
          {!isAuthPage && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 rounded-xl text-fg/80 hover:text-clay hover:bg-clay/5 transition-colors"
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              {user && (
                <Link
                  to="/profile"
                  className="p-2 rounded-xl text-fg/80 hover:text-clay hover:bg-clay/5 transition-colors"
                  aria-label="Profile"
                >
                  {profile?.user.avatar ? (
                    <img src={profile.user.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </Link>
              )}
              <HeaderMenu />
            </div>
          )}

        </div>
      </div>
    </nav>
  );
};
