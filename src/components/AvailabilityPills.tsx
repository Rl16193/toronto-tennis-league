import React from 'react';
import { Clock } from 'lucide-react';
import { availabilityTagLabel, collapseAvailabilityTags } from '../utils/availability';

// One small pill per selected availability tag, next to NearbyPill in a player row — same size/
// style so the row stays visually consistent. Renders nothing if the player hasn't set any
// (per spec: leave it empty, no placeholder). Always a single horizontally-scrolling row — even
// with several tags selected, the row never grows taller, it just scrolls sideways.
export const AvailabilityPills: React.FC<{ tags?: string[]; className?: string }> = ({ tags, className }) => {
  if (!tags || tags.length === 0) return null;
  // "Weekday Mornings + Weekday Evenings" reads as just "Weekdays" — see collapseAvailabilityTags.
  const shown = collapseAvailabilityTags(tags);
  if (shown.length === 0) return null;
  return (
    <div className={`flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar ${className ?? ''}`}>
      {shown.map((tag) => (
        <span
          key={tag}
          className="shrink-0 rounded-full bg-fg/5 text-fg text-[9px] font-bold px-2 py-0.5 inline-flex items-center gap-1"
        >
          <Clock className="w-2.5 h-2.5 shrink-0" />{availabilityTagLabel(tag)}
        </span>
      ))}
    </div>
  );
};
