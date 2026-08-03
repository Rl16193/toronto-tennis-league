import React from 'react';
import { motion } from 'motion/react';
import { tapScale } from '../lib/motion';

// Floating action button, pinned above the bottom tab bar (organizer "Add Event", etc.).
export const Fab: React.FC<{
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}> = ({ onClick, ariaLabel, children }) => (
  <motion.button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    whileTap={tapScale.whileTap}
    transition={tapScale.transition}
    className="fixed right-4 bottom-24 z-40 w-14 h-14 rounded-full bg-clay text-white shadow-[0_8px_24px_rgba(255,107,53,0.4)]
               flex items-center justify-center hover:bg-clay-dark transition-colors"
    style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
  >
    {children}
  </motion.button>
);
