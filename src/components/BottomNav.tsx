import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, ListChecks, MapPin, Store } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { RacquetIcon } from './RacquetIcon';

// App-style bottom tab bar. Five thumb-reachable tabs; auth-required tabs route logged-out taps
// to /login. Hidden on the auth pages. Profile lives behind the header avatar (not a tab).
// Tournament merged into the "Matches" tab (Tournament/Challenges/Friendlies switch there).
const TABS = [
  { name: 'Events', path: '/events', icon: Calendar, requiresAuth: false },
  { name: 'Courts', path: '/courts', icon: MapPin, requiresAuth: false },
  { name: 'Matches', path: '/matches', icon: RacquetIcon, requiresAuth: true },
  { name: 'Tasks', path: '/tasks', icon: ListChecks, requiresAuth: true },
  // Rewards is live here; Rent and Buy/Sell are placeholder tabs inside the page itself.
  // Browsable logged out — a signed-out visitor sees a 0 balance and can't redeem.
  { name: 'Marketplace', path: '/marketplace', icon: Store, requiresAuth: false },
] as const;

export const BottomNav: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (location.pathname === '/login' || location.pathname === '/signup') return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-fg/10 bg-tennis-dark/95 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 items-center px-1 pt-1 pb-0.5">
        {TABS.map((tab) => {
          const to = tab.requiresAuth && !user ? '/login' : tab.path;
          const active = location.pathname === tab.path;
          return (
            <Link
              key={tab.name}
              to={to}
              className={`min-h-14 flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-fg' : 'text-fg/70 hover:text-fg'
              }`}
              aria-label={tab.name}
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative flex items-center justify-center w-10 h-10">
                {active && (
                  <motion.span
                    layoutId="bottom-nav-tennis-ball"
                    className="absolute inset-0 rounded-full clay-gradient shadow-lg shadow-clay/30"
                    transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                  />
                )}
                <tab.icon className="relative z-10 w-5 h-5" />
              </span>
              {active && <span className="text-[10px] font-black leading-none">{tab.name}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
