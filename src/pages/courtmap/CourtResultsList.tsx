import React from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { tapScale } from '../../lib/motion';
import type { NearestCourt, CourtWithCount } from './courtMapUtils';
import { Badge, PickleballBadges } from './courtMapComponents';
import { formatDist, hasPublicHours } from './courtMapUtils';

interface Props {
  courts: NearestCourt[];
  totalCourts: number;
  loading: boolean;
  userCoords: { lat: number; lng: number } | null;
  onSelectCourt: (court: CourtWithCount) => void;
}

export const CourtResultsList: React.FC<Props> = ({ courts, loading, userCoords, onSelectCourt }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 text-clay animate-spin" />
      </div>
    );
  }

  return (
    <>
      {courts.length === 0 ? (
        <p className="text-fg/40 text-sm text-center py-8">No courts match the current filters.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {courts.map((c) => (
            <motion.button
              key={`${c.dropdown}-${c.lat}`}
              onClick={() => onSelectCourt(c)}
              whileTap={tapScale.whileTap}
              transition={tapScale.transition}
              className="w-full text-left px-4 py-3 hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="font-semibold text-fg text-sm leading-snug">{c.dropdown || c.name}</p>
                {userCoords && <span className="text-clay font-medium text-xs shrink-0">{formatDist(c.distKm)}</span>}
              </div>
              {c.address && <p className="text-fg/80 text-xs mb-1.5">{c.address}</p>}
              <div className="flex flex-wrap gap-1">
                <Badge bg="#2d2d3a" color="#d1d5db">{c.courtType.toUpperCase()}</Badge>
                {c.numCourts > 0 && <Badge bg="#2d2d3a" color="#d1d5db">{c.numCourts} CT</Badge>}
                {c.lights && <Badge bg="#422006" color="#fbbf24">LIGHTS</Badge>}
                {hasPublicHours(c) && <Badge bg="#1e3a5f" color="#93c5fd">OPEN HOURS</Badge>}
                {c.bookingUrl && <Badge bg="#7c2d12" color="#fdba74">BOOKABLE</Badge>}
                {c.count > 0 && <Badge bg="#14532d" color="#86efac">{c.count} player{c.count !== 1 ? 's' : ''}</Badge>}
                <PickleballBadges entries={c.pickleballEntries} />
              </div>
              {c.clubInfo && <p className="text-fg/80 text-xs mt-1 leading-snug">{c.clubInfo}</p>}
            </motion.button>
          ))}
        </div>
      )}
    </>
  );
};
