import React from 'react';
import { BADGE_BY_ID, BADGE_PILL_CLASS } from './badges';

// The badges a player chose to display, as text pills. Used on profile cards.
// Deliberately not rendered beside leaderboard names — three text pills there crowded the
// player name out of the row on a phone.
export const BadgeRow: React.FC<{ ids?: string[]; className?: string }> = ({ ids, className }) => {
  const badges = (ids || []).map((id) => BADGE_BY_ID[id]).filter(Boolean);
  if (badges.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {badges.map((b) => (
        <span key={b.id} title={b.requirement} className={BADGE_PILL_CLASS}>
          {b.name}
        </span>
      ))}
    </span>
  );
};
