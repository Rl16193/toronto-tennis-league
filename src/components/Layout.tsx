import React, { Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { BottomNav } from './BottomNav';
import { motion, AnimatePresence } from 'motion/react';

// Lives here rather than App.tsx now that the Suspense boundary it feeds does too.
const RouteFallback: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
  </div>
);

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isCourts = location.pathname === '/courts';
  // Home's hero image goes full-bleed behind the transparent header (blends together again,
  // like a previous version) — it just skips the top pad; the bottom tab bar clearance stays.
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {/* Suspense sits OUTSIDE the route-keyed <main>. Inside, every navigation remounted the
          boundary, so a route chunk that was still resolving left an empty <main> between the two
          nav bars instead of this spinner — that's what made /marketplace look blank until the
          user reloaded. Out here the boundary survives the route swap and actually shows. */}
      <Suspense fallback={<RouteFallback />}>
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            // Full-height courts page reserves the top+bottom bars itself; every other page gets
            // top padding for the fixed top bar and bottom padding for the fixed bottom tab bar.
            className={`flex-grow${isCourts ? '' : isHome ? ' pb-16' : ' pt-16 pb-16'}`}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </Suspense>
      <BottomNav />
    </div>
  );
};
