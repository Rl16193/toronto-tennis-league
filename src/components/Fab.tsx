import React from 'react';

// Floating action button, pinned above the bottom tab bar (organizer "Add Event", etc.).
export const Fab: React.FC<{
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}> = ({ onClick, ariaLabel, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    className="fixed right-4 bottom-24 z-40 w-14 h-14 rounded-full bg-clay text-white shadow-[0_8px_24px_rgba(255,107,53,0.4)]
               flex items-center justify-center hover:bg-clay-dark active:scale-95 transition-all"
    style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
  >
    {children}
  </button>
);
