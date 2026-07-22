import React from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { BottomNav } from './BottomNav';
import { motion } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isCourts = location.pathname === '/courts';

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        // Full-height courts page reserves the top+bottom bars itself; every other page gets
        // top padding for the fixed top bar and bottom padding for the fixed bottom tab bar.
        className={`flex-grow${isCourts ? '' : ' pt-16 pb-16'}`}
      >
        {children}
      </motion.main>
      <BottomNav />
    </div>
  );
};
