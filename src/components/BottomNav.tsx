import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, ListChecks, MapPin, Medal, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RacquetIcon } from './RacquetIcon';

// App-style bottom tab bar. Six thumb-reachable tabs; auth-required tabs route logged-out taps
// to /login. Hidden on the auth pages. Profile lives behind the header avatar (not a tab).
// Tournament merged into the "Matches" tab (Tournament/Challenges/Friendlies switch there).
const TABS = [
  { name: 'Events', path: '/events', icon: Calendar, requiresAuth: false },
  { name: 'Leaderboard', path: '/leagues', icon: Medal, requiresAuth: false },
  { name: 'Courts', path: '/courts', icon: MapPin, requiresAuth: false },
  { name: 'Matches', path: '/matches', icon: RacquetIcon, requiresAuth: true },
  { name: 'Tasks', path: '/tasks', icon: ListChecks, requiresAuth: true },
] as const;

// Placeholder tab — not a real route yet, so it's rendered inert (no <Link>) rather than added
// to TABS.
const MARKETPLACE = { name: 'Marketplace', icon: Store };

export const BottomNav: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (location.pathname === '/login' || location.pathname === '/signup') return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-tennis-dark/95 backdrop-blur-md border-t border-fg/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto grid grid-cols-6">
        {TABS.map((tab) => {
          const to = tab.requiresAuth && !user ? '/login' : tab.path;
          const active = location.pathname === tab.path;
          return (
            <Link
              key={tab.name}
              to={to}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                active ? 'text-clay' : 'text-fg/60 hover:text-fg'
              }`}
              aria-label={tab.name}
              aria-current={active ? 'page' : undefined}
            >
              <tab.icon className="w-5 h-5" />
              {tab.name}
            </Link>
          );
        })}
        <span
          className="flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold text-fg/25 cursor-not-allowed select-none"
          aria-disabled="true"
        >
          <span className="text-[7px] font-black uppercase tracking-wide bg-fg/10 text-fg/40 rounded-full px-1.5 py-0.5">
            Soon
          </span>
          <MARKETPLACE.icon className="w-5 h-5" />
          {MARKETPLACE.name}
        </span>
      </div>
    </nav>
  );
};
