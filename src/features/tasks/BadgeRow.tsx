import React from 'react';
import { BADGE_BY_ID } from './badges';

// The badges a player chose to display. Used on profile cards and beside names on leaderboards.
export const BadgeRow: React.FC<{ ids?: string[]; size?: 'sm' | 'md'; className?: string }> = ({
  ids, size = 'md', className,
}) => {
  const badges = (ids || []).map((id) => BADGE_BY_ID[id]).filter(Boolean);
  if (badges.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      {badges.map((b) => (
        <span key={b.id} title={`${b.name} — ${b.requirement}`} className={size === 'sm' ? 'text-xs' : 'text-base'}>
          {b.icon}
        </span>
      ))}
    </span>
  );
};
