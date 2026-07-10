import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { NearestProgram } from './courtMapUtils';
import { Badge } from './courtMapComponents';
import { formatDist, formatDateRange, getProgramStatus } from './courtMapUtils';

interface Props {
  programs: NearestProgram[];
  totalPrograms: number;
  loading: boolean;
  userCoords: { lat: number; lng: number } | null;
}

export const ProgramResultsList: React.FC<Props> = ({ programs, totalPrograms, loading, userCoords }) => {
  const today = useMemo(() => new Date(), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 text-clay animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="px-4 py-1.5 border-b border-white/5">
        <span className="text-white/40 text-[11px]">
          Showing {programs.length} of {totalPrograms} programs
        </span>
      </div>
      {programs.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-8">No programs match the current filters.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {programs.map((p) => {
            const status = getProgramStatus(p.dateRange, today);
            return (
              <div key={p.courseId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="font-semibold text-white text-sm leading-snug">{p.locationName}</p>
                  {p.distKm !== null && userCoords && (
                    <span className="text-clay font-medium text-xs shrink-0">{formatDist(p.distKm)}</span>
                  )}
                </div>
                <p className="text-white/80 text-xs mb-1.5">{formatDateRange(p.dateRange)}</p>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    {status === 'ongoing'  && <Badge bg="#14532d" color="#86efac">ONGOING</Badge>}
                    {status === 'upcoming' && <Badge bg="#422006" color="#fbbf24">UPCOMING</Badge>}
                    {status === 'past'     && <Badge bg="#1f2937" color="#6b7280">PAST</Badge>}
                  </div>
                  {p.activityUrl && (
                    <a href={p.activityUrl} target="_blank" rel="noopener noreferrer"
                       onClick={(e) => e.stopPropagation()}
                       className="text-clay text-xs hover:underline shrink-0">
                      View Activity →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
