import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, ListChecks, Medal, MapPin, Trophy, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// App-style bottom tab bar. Replaces the old top nav links + hamburger. Six thumb-reachable
// tabs; Matches/Tasks/Profile require an account, so logged-out taps route to /login. Hidden on
// the auth pages.
const TABS = [
  { name: 'Events', path: '/events', icon: Calendar, requiresAuth: false },
  { name: 'Leaderboard', path: '/leagues', icon: Medal, requiresAuth: false },
  { name: 'Courts', path: '/courts', icon: MapPin, requiresAuth: false },
  { name: 'Matches', path: '/tournament', icon: Trophy, requiresAuth: true },
  { name: 'Tasks', path: '/tasks', icon: ListChecks, requiresAuth: true },
  { name: 'Profile', path: '/profile', icon: User, requiresAuth: true },
] as const;

export const BottomNav: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (location.pathname === '/login' || location.pathname === '/signup') return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-tennis-dark/95 backdrop-blur-md border-t border-white/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-lg mx-auto grid grid-cols-6">
        {TABS.map((tab) => {
          const to = tab.requiresAuth && !user ? '/login' : tab.path;
          const active = location.pathname === tab.path;
          return (
            <Link
              key={tab.name}
              to={to}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                active ? 'text-clay' : 'text-white/60 hover:text-white'
              }`}
              aria-label={tab.name}
              aria-current={active ? 'page' : undefined}
            >
              <tab.icon className="w-5 h-5" />
              {tab.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
