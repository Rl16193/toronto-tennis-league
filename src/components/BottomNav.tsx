import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, ListChecks, MapPin, Store } from 'lucide-react';
import { motion } from 'motion/react';
import { easeOut } from '../lib/motion';
import { useAuth } from '../context/AuthContext';
import { RacquetIcon } from './RacquetIcon';

// App-style bottom tab bar. Five thumb-reachable tabs for a member, three for a visitor.
// Hidden on the auth pages. Profile lives behind the header avatar (not a tab).
// Tournament merged into the "Matches" tab (Tournament/Challenges/Rallies switch there).
//
// A signed-out visitor sees ONLY the tabs they can actually use — Events, Courts, Marketplace.
// The members-only tabs are hidden rather than shown and bounced to /login, so the bar never
// offers a door that opens onto a sign-in wall.
// Below `lg` this is the bottom bar; from `lg` Navbar renders the same list as header links.
export const TABS: readonly { name: string; short?: string; path: string; icon: React.ComponentType<{ className?: string }>; requiresAuth: boolean }[] = [
  { name: 'Events', path: '/events', icon: Calendar, requiresAuth: false },
  { name: 'Courts', path: '/courts', icon: MapPin, requiresAuth: false },
  { name: 'Matches', path: '/matches', icon: RacquetIcon, requiresAuth: true },
  { name: 'Tasks', path: '/tasks', icon: ListChecks, requiresAuth: true },
  // Rewards is live here; Rent and Buy/Sell are placeholder tabs inside the page itself.
  // Browsable logged out — a signed-out visitor sees a 0 balance and can't redeem.
  // `short` is the bottom-bar label: "Marketplace" doesn't fit a fifth of a phone at 12px.
  { name: 'Marketplace', short: 'Market', path: '/marketplace', icon: Store, requiresAuth: false },
];

export const BottomNav: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (location.pathname === '/login' || location.pathname === '/signup') return null;

  const tabs = TABS.filter((tab) => !!user || !tab.requiresAuth);

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-fg/8 bg-nav/95 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {/* Column count follows the visible tabs — three signed out, five signed in — so the bar
          stays evenly divided instead of leaving two empty columns. */}
      <div
        className="max-w-md mx-auto grid items-center px-1 pt-1 pb-0.5"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <Link
              key={tab.name}
              to={tab.path}
              className={`min-h-14 flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-fg' : 'text-fg/70 hover:text-fg'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative flex items-center justify-center w-10 h-10">
                {active && (
                  <motion.span
                    layoutId="bottom-nav-tennis-ball"
                    className="absolute inset-0 rounded-full clay-gradient shadow-lg shadow-clay/30"
                    transition={{ duration: 0.25, ease: easeOut }}
                  />
                )}
                <tab.icon className="relative z-10 w-5 h-5" />
              </span>
              <span className={`text-xs leading-none ${active ? 'font-black' : 'font-bold'}`}>{tab.short ?? tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
