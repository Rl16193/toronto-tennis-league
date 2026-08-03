import React from 'react';
import { Clock } from 'lucide-react';
import { availabilityTagLabel } from '../utils/availability';

// One small pill per selected availability tag, next to NearbyPill in a player row — same size/
// style so the row stays visually consistent. Renders nothing if the player hasn't set any
// (per spec: leave it empty, no placeholder).
export const AvailabilityPills: React.FC<{ tags?: string[]; className?: string }> = ({ tags, className }) => {
  if (!tags || tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          className={`shrink-0 rounded-full border border-fg/10 text-fg/70 text-[9px] font-bold px-2 py-0.5 inline-flex items-center gap-1 ${className ?? ''}`}
        >
          <Clock className="w-2.5 h-2.5 shrink-0" />{availabilityTagLabel(tag)}
        </span>
      ))}
    </>
  );
};
