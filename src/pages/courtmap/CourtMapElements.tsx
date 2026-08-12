import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { tapScale } from '../../lib/motion';
import type {
  CourtWithCount, NearestCourt, NearestProgram, PickleballEntry,
} from './courtMapUtils';
import { formatDateRange, formatDist, getProgramStatus, hasPublicHours } from './courtMapUtils';

// Court Locator presentation: filter controls, badges, map popup, result lists.
// Data loading lives in useCourtData.ts; parsing and geo helpers in courtMapUtils.ts.

// ─── Badges and filter controls ───────────────────────────────────────────────────────────────

export const Badge: React.FC<{ bg: string; color: string; children: React.ReactNode }> = ({ bg, color, children }) => (
  <span style={{
    background: bg, color,
    padding: '2px 6px', borderRadius: 4,
    fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
    display: 'inline-block', lineHeight: 1.5,
  }}>
    {children}
  </span>
);

const SEL_BG = 'var(--color-tennis-deep)';

export function FilterSelect({
  label, value, options, onChange, disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const selStyle = { background: SEL_BG, color: 'var(--color-fg)' } as const;
  return (
    <div className={`flex flex-col gap-0.5 ${disabled ? 'opacity-35 pointer-events-none' : ''}`}>
      <span className="text-fg/70 text-[10px] uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ background: SEL_BG }}
        // Borderless: the filled background and focus ring carry the affordance instead.
        className="w-full text-xs text-fg rounded-md px-2 py-1.5
                   focus:outline-none focus:ring-2 focus:ring-clay/40 appearance-none cursor-pointer"
      >
        <option value="" style={selStyle}>All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} style={selStyle}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function DaysDropdown({
  selected, onChange,
}: {
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const label = selected.size === 0 ? 'All days' : [...selected].join(', ');

  return (
    <div className="flex flex-col gap-0.5 relative">
      <span className="text-fg/70 text-[10px] uppercase tracking-wide">Days</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left text-xs text-fg rounded-md px-2 py-1.5
                   border border-fg/20 flex items-center justify-between"
        style={{ background: SEL_BG }}
      >
        <span className="truncate">{label}</span>
        <span className="text-fg/70 ml-1 text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 z-50 mt-0.5 rounded-md p-1.5
                       grid grid-cols-7 gap-1 shadow-xl border border-fg/20"
            style={{ background: SEL_BG }}
          >
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (next.has(d)) next.delete(d); else next.add(d);
                  onChange(next);
                }}
                className={`text-[10px] py-1 rounded font-medium transition-colors
                  ${selected.has(d) ? 'bg-clay text-fg' : 'bg-white text-tennis-dark hover:bg-fg/90'}`}
              >
                {d[0]}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const PickleballBadges = React.memo(function PickleballBadges({
  entries, popup = false,
}: { entries: PickleballEntry[]; popup?: boolean }) {
  if (!entries.length) return null;

  return (
    <>
      {entries.map((pb, idx) => {
        const suffix =
          pb.netType === 'No Net'     ? ' · BRING OWN NET' :
          pb.netType === 'Tennis'     ? ' · USE TENNIS COURTS' :
          pb.netType === 'Adjustable' ? ' · ADJUSTABLE NET' : '';
        const label = `PICKLEBALL ${pb.numCourts} CT${suffix}`;

        if (popup) {
          return (
            <span key={idx} style={{
              background: '#431407', color: '#fb923c',
              padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
            }}>
              {label}
            </span>
          );
        }
        return (
          <Badge key={idx} bg="#431407" color="#fb923c">{label}</Badge>
        );
      })}
    </>
  );
});

// ─── Map popup ────────────────────────────────────────────────────────────────────────────────

// Court detail bubble for a MapGL <Popup>. The program/suggest actions appear only when their
// handlers are supplied.
export const CourtPopup: React.FC<{
  court: CourtWithCount;
  onViewPrograms?: () => void;
  onSuggest?: () => void;
}> = ({ court, onViewPrograms, onSuggest }) => (
  <div style={{ fontFamily: 'system-ui, sans-serif', padding: '4px 2px', textAlign: 'center' }}>
    <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, marginTop: 0, color: '#1f2937' }}>
      {court.dropdown || court.name}
    </p>
    {court.address && (
      <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 7, marginTop: 0 }}>
        {court.address}
      </p>
    )}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 7, justifyContent: 'center' }}>
      <span style={{ background: '#e5e7eb', color: '#111', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
        {court.courtType.toUpperCase()}
      </span>
      {court.numCourts > 0 && (
        <span style={{ background: '#e5e7eb', color: '#111', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
          {court.numCourts} CT
        </span>
      )}
      {court.lights && (
        <span style={{ background: '#fef08a', color: '#713f12', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
          LIGHTS
        </span>
      )}
      {hasPublicHours(court) && (
        <span style={{ background: '#1e3a5f', color: '#93c5fd', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
          OPEN HOURS
        </span>
      )}
      {court.bookingUrl && (
        <span style={{ background: '#7c2d12', color: '#fdba74', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
          BOOKABLE
        </span>
      )}
      <PickleballBadges entries={court.pickleballEntries} popup />
    </div>
    {court.count > 0 && (
      <p style={{ color: '#16a34a', fontSize: 11, margin: '0 0 3px' }}>
        {court.count} active player{court.count !== 1 ? 's' : ''}
      </p>
    )}
    {court.clubInfo && (
      <p style={{ color: '#6b7280', fontSize: 10, margin: '0 0 6px', lineHeight: 1.4 }}>
        {court.clubInfo}
      </p>
    )}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, justifyContent: 'center' }}>
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${court.lat},${court.lng}`}
        target="_blank" rel="noreferrer"
        style={{ padding: '4px 10px', background: '#166534', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
      >
        Directions
      </a>
      {court.website && (
        <a
          href={court.website}
          target="_blank" rel="noreferrer"
          style={{ padding: '4px 10px', background: '#1d4ed8', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
        >
          Website
        </a>
      )}
      {court.bookingUrl && (
        <a
          href={court.bookingUrl}
          target="_blank" rel="noreferrer"
          style={{ padding: '4px 10px', background: '#166534', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
        >
          Book Online
        </a>
      )}
      {court.hasPrograms && onViewPrograms && (
        <button
          onClick={onViewPrograms}
          style={{ padding: '4px 10px', background: '#ca8a04', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer' }}
        >
          View Available Programs
        </button>
      )}
    </div>
    {onSuggest && (
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onSuggest}
          style={{ padding: '5px 12px', background: '#ea580c', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          Report
        </button>
      </div>
    )}
  </div>
);

// ─── Result lists ─────────────────────────────────────────────────────────────────────────────

interface CourtResultsProps {
  courts: NearestCourt[];
  totalCourts: number;
  loading: boolean;
  userCoords: { lat: number; lng: number } | null;
  onSelectCourt: (court: CourtWithCount) => void;
}

// Memoized — CourtMap re-renders on every search keystroke.
export const CourtResultsList: React.FC<CourtResultsProps> = React.memo(({ courts, loading, userCoords, onSelectCourt }) => {
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
        <p className="text-fg/70 text-sm text-center py-8">No courts match the current filters.</p>
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
              {c.address && <p className="text-fg text-xs mb-1.5">{c.address}</p>}
              <div className="flex flex-wrap gap-1">
                <Badge bg="#2d2d3a" color="#d1d5db">{c.courtType.toUpperCase()}</Badge>
                {c.numCourts > 0 && <Badge bg="#2d2d3a" color="#d1d5db">{c.numCourts} CT</Badge>}
                {c.lights && <Badge bg="#422006" color="#fbbf24">LIGHTS</Badge>}
                {hasPublicHours(c) && <Badge bg="#1e3a5f" color="#93c5fd">OPEN HOURS</Badge>}
                {c.bookingUrl && <Badge bg="#7c2d12" color="#fdba74">BOOKABLE</Badge>}
                {c.count > 0 && <Badge bg="#14532d" color="#86efac">{c.count} player{c.count !== 1 ? 's' : ''}</Badge>}
                <PickleballBadges entries={c.pickleballEntries} />
              </div>
              {c.clubInfo && <p className="text-fg text-xs mt-1 leading-snug">{c.clubInfo}</p>}
            </motion.button>
          ))}
        </div>
      )}
    </>
  );
});

interface ProgramResultsProps {
  programs: NearestProgram[];
  totalPrograms: number;
  loading: boolean;
  userCoords: { lat: number; lng: number } | null;
}

// Memoized, same as CourtResultsList.
export const ProgramResultsList: React.FC<ProgramResultsProps> = React.memo(({ programs, totalPrograms, loading, userCoords }) => {
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
      <div className="px-4 py-1.5 border-b border-fg/5">
        <span className="text-fg/70 text-[11px]">
          Showing {programs.length} of {totalPrograms} programs
        </span>
      </div>
      {programs.length === 0 ? (
        <p className="text-fg/70 text-sm text-center py-8">No programs match the current filters.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {programs.map((p) => {
            const status = getProgramStatus(p.dateRange, today);
            return (
              <div key={p.courseId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="font-semibold text-fg text-sm leading-snug">{p.locationName}</p>
                  {p.distKm !== null && userCoords && (
                    <span className="text-clay font-medium text-xs shrink-0">{formatDist(p.distKm)}</span>
                  )}
                </div>
                <p className="text-fg text-xs mb-1.5">{formatDateRange(p.dateRange)}</p>
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
});
