import React from 'react';

// Racquet + ball + wrist strap — the single mark used for Matches, Challenge, and Rally.
// Stroke inherits currentColor (white on clay buttons, tennis-dark on white buttons, automatically).
export const RacquetIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="5.5" cy="5.5" r="2.4" />
    <path d="M4 4c.8.5 1.3 1.4 1.3 2.4M7 4c-.8.5-1.3 1.4-1.3 2.4" strokeWidth="0.8" />
    <g transform="rotate(38 14.5 10)">
      <ellipse cx="14.5" cy="7.2" rx="5.4" ry="6.3" />
      <path d="M14.5 1.3v11.8M9.6 7.2h9.8M11 3.6h7M11 10.8h7" strokeWidth="0.8" />
      <line x1="14.5" y1="13.5" x2="14.5" y2="18.8" />
    </g>
    <path d="M18 21.5c1.2.5 2.6-.2 2.6-1.5 0-1.1-1-1.7-1.9-1.2" />
  </svg>
);
