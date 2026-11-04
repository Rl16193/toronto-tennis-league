import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Loader2, Snowflake } from 'lucide-react';
import { tapScale } from '../../lib/motion';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import type {
  ActivityBreakdown, CourtWithCount, NearestCourt, NearestProgram, PickleballEntry,
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

// All four map filters open the same pop-up list (a Sheet), so they behave alike. FilterSelect
// picks one option; MultiFilterSelect ticks several and closes with Done.
const FilterTrigger: React.FC<{ label: string; text: string; onOpen: () => void; disabled?: boolean }> = ({ label, text, onOpen, disabled }) => (
  <div className={`flex flex-col gap-0.5 ${disabled ? 'opacity-35 pointer-events-none' : ''}`}>
    <span className="text-fg/70 text-xs uppercase tracking-wide">{label}</span>
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-haspopup="dialog"
      style={{ background: SEL_BG }}
      // Borderless: the filled background and focus ring carry the affordance instead.
      className="w-full text-left text-xs text-fg rounded-md px-2 py-1.5 flex items-center justify-between
                 focus:outline-none focus:ring-2 focus:ring-clay/40 cursor-pointer"
    >
      <span className="truncate">{text}</span>
      <ChevronDown className="w-3.5 h-3.5 ml-1 shrink-0 text-fg/70" aria-hidden="true" />
    </button>
  </div>
);

const filterRowCls = (on: boolean) =>
  `w-full min-h-11 flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition-colors
   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay ${
    on ? 'bg-clay/15 text-fg font-bold' : 'text-fg hover:bg-fg/10'}`;

export function FilterSelect({
  label, value, options, onChange, disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const all = [{ value: '', label: 'All' }, ...options];
  const text = all.find((o) => o.value === value)?.label ?? 'All';
  return (
    <>
      <FilterTrigger label={label} text={text} onOpen={() => setOpen(true)} disabled={disabled} />
      <AnimatePresence>
        {open && (
          <Sheet onClose={() => setOpen(false)} title={label} maxWidthClassName="max-w-md">
            <div className="p-3 pt-1 space-y-1">
              {all.map((o) => (
                <button key={o.value || 'all'} type="button" onClick={() => { onChange(o.value); setOpen(false); }} className={filterRowCls(o.value === value)}>
                  <span className="flex-1">{o.label}</span>
                  {o.value === value && <Check className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  );
}

// Multi-select twin of FilterSelect. An empty set means "all", so the label falls back to
// `allLabel` and no filtering is applied by the caller.
export function MultiFilterSelect({
  label, allLabel, selected, options, onChange,
}: {
  label: string;
  allLabel: string;
  selected: Set<string>;
  options: { value: string; label: string }[];
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const text = selected.size === 0
    ? allLabel
    : options.filter((o) => selected.has(o.value)).map((o) => o.label).join(', ');

  return (
    <>
      <FilterTrigger label={label} text={text} onOpen={() => setOpen(true)} />
      <AnimatePresence>
        {open && (
          <Sheet onClose={() => setOpen(false)} title={label} maxWidthClassName="max-w-md">
            <div className="p-3 pt-1 space-y-1">
              <button type="button" onClick={() => onChange(new Set())} className={filterRowCls(selected.size === 0)}>
                <span className="flex-1">{allLabel}</span>
                {selected.size === 0 && <Check className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />}
              </button>
              {options.map((o) => {
                const on = selected.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      const next = new Set(selected);
                      if (on) next.delete(o.value); else next.add(o.value);
                      onChange(next);
                    }}
                    className={filterRowCls(on)}
                  >
                    <span className="flex-1">{o.label}</span>
                    {on && <Check className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />}
                  </button>
                );
              })}
              <Button className="w-full h-11 rounded-2xl mt-2" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>
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
          PUBLIC HOURS
        </span>
      )}
      {court.winterPlay && (
        <span style={{ background: '#cffafe', color: '#155e75', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <Snowflake size={10} aria-hidden="true" />WINTER
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
    {/* Clubs without public hours (orange dots) get no Report button; Website above stays. */}
    {onSuggest && !(court.courtType.toLowerCase() === 'club' && !hasPublicHours(court)) && (
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
  /** Drill into this court's programs. Same action as the map popup's button. */
  onViewPrograms: (court: CourtWithCount) => void;
  /** 7D / 30D Activity on: each row shows that window's breakdown as pills. '' = off. */
  activityWindow: '' | 'd7' | 'd30';
  /** Reports on: each row shows its newest court-condition note, with More for the other two. */
  showReports: boolean;
}

// Memoized — CourtMap re-renders on every search keystroke.
// The Activity breakdown pills, in the order the user reads a court's day: play, then reports.
const ACTIVITY_PILLS: { kind: keyof ActivityBreakdown; label: string }[] = [
  { kind: 'scores', label: 'User Playing Matches' },
  { kind: 'checkins', label: 'Check-ins' },
  { kind: 'waiting_board', label: 'Waiting board' },
  { kind: 'queue', label: 'Racquet queue' },
  { kind: 'condition', label: 'Court conditions' },
];

export const CourtResultsList: React.FC<CourtResultsProps> = React.memo(({ courts, loading, userCoords, onSelectCourt, onViewPrograms, activityWindow, showReports }) => {
  // The court whose Reports are expanded to all three; one at a time.
  const [openReports, setOpenReports] = useState<string | null>(null);
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
            // The row is a div, not one big button: Book Online and Programs are real controls
            // inside it, and nesting those in a button is invalid and swallows their clicks.
            <div
              key={`${c.dropdown}-${c.lat}`}
              className="flex items-start justify-between gap-2 px-4 py-3 hover:bg-fg/5 transition-colors"
            >
              <motion.button
                onClick={() => onSelectCourt(c)}
                whileTap={tapScale.whileTap}
                transition={tapScale.transition}
                className="flex-1 min-w-0 text-left"
              >
                <p className="font-semibold text-fg text-sm leading-snug mb-1">{c.dropdown || c.name}</p>
                {c.address && <p className="text-fg text-xs mb-1.5">{c.address}</p>}
                <div className="flex flex-wrap gap-1">
                  <Badge bg="#2d2d3a" color="#d1d5db">{c.courtType.toUpperCase()}</Badge>
                  {c.numCourts > 0 && <Badge bg="#2d2d3a" color="#d1d5db">{c.numCourts} CT</Badge>}
                  {c.lights && <Badge bg="#422006" color="#fbbf24">LIGHTS</Badge>}
                  {hasPublicHours(c) && <Badge bg="#1e3a5f" color="#93c5fd">PUBLIC HOURS</Badge>}
                  {c.winterPlay && <Badge bg="#164e63" color="#a5f3fc">WINTER</Badge>}
                  {c.bookingUrl && <Badge bg="#7c2d12" color="#fdba74">BOOKABLE</Badge>}
                  {showReports
                    ? c.reportCount > 0 && <Badge bg="#14532d" color="#86efac">{c.reportCount} report{c.reportCount !== 1 ? 's' : ''}</Badge>
                    : c.count > 0 && <Badge bg="#14532d" color="#86efac">{c.count} player{c.count !== 1 ? 's' : ''}</Badge>}
                  <PickleballBadges entries={c.pickleballEntries} />
                </div>
                {c.clubInfo && <p className="text-fg text-xs mt-1 leading-snug">{c.clubInfo}</p>}
                {activityWindow && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {ACTIVITY_PILLS.map(({ kind, label }) => {
                      const n = (activityWindow === 'd7' ? c.activityBreakdown7 : c.activityBreakdown30)[kind];
                      return n > 0 ? <Badge key={kind} bg="#3b1f12" color="#fdba74">{label} {n}</Badge> : null;
                    })}
                  </div>
                )}
                {showReports && c.reports.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {(openReports === c.dropdown ? c.reports : c.reports.slice(0, 1)).map((note, i) => (
                      <Badge key={i} bg="#3b1f12" color="#fdba74">{note}</Badge>
                    ))}
                    {c.reports.length > 1 && (
                      // A span, not a button: the whole row is already a button.
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(ev) => { ev.stopPropagation(); setOpenReports((cur) => (cur === c.dropdown ? null : c.dropdown)); }}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); setOpenReports((cur) => (cur === c.dropdown ? null : c.dropdown)); } }}
                        className="text-xs font-bold text-clay cursor-pointer focus-visible:outline-2 focus-visible:outline-clay"
                      >
                        {openReports === c.dropdown ? 'Less' : `More (${c.reports.length - 1})`}
                      </span>
                    )}
                  </div>
                )}
              </motion.button>
              {/* Distance, then the same actions the map bubble offers, stacked beneath it. */}
              <div className="shrink-0 flex flex-col items-end gap-1">
                {userCoords && <span className="text-clay font-medium text-xs">{formatDist(c.distKm)}</span>}
                {c.bookingUrl && (
                  <a
                    href={c.bookingUrl} target="_blank" rel="noreferrer"
                    className="rounded-2xl bg-clay px-2 py-0.5 text-xs font-bold text-white hover:bg-clay-dark transition-colors"
                  >
                    Book Online
                  </a>
                )}
                {c.hasPrograms && (
                  <button
                    type="button"
                    onClick={() => onViewPrograms(c)}
                    className="rounded-2xl bg-fg/10 px-2 py-0.5 text-xs font-bold text-fg hover:bg-fg/20 transition-colors"
                  >
                    Programs
                  </button>
                )}
              </div>
            </div>
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
  status: string;
  onStatusChange: (v: string) => void;
}

const STATUS_PILLS = [
  { value: '',         label: 'All'      },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing',  label: 'Ongoing'  },
  { value: 'past',     label: 'Past'     },
];

// Memoized, same as CourtResultsList.
export const ProgramResultsList: React.FC<ProgramResultsProps> = React.memo(({
  programs, totalPrograms, loading, userCoords, status: statusFilter, onStatusChange,
}) => {
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
      {/* Programs have no filter panel of their own — the status filter lives on this header.
          No back control by design: Reset in the filter sheet is what returns you to the courts. */}
      <div className="px-4 py-2 border-b border-fg/5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-fg/70 text-xs shrink-0">
            Showing {programs.length} of {totalPrograms} programs
          </span>
          <div className="flex items-center gap-1">
            {STATUS_PILLS.map((s) => (
              <button
                key={s.value || 'all'}
                type="button"
                onClick={() => onStatusChange(s.value)}
                className={`rounded-2xl px-2 py-0.5 text-xs font-bold transition-colors ${
                  statusFilter === s.value ? 'bg-clay text-white' : 'bg-fg/10 text-fg hover:bg-fg/20'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {programs.length === 0 ? (
        <p className="text-fg/70 text-sm text-center py-8">No programs match the current filters.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {programs.map((p) => {
            const status = getProgramStatus(p.dateRange, today);
            return (
              // The program's own title leads. Showing only the location made every row at a
              // multi-program park read identically, with nothing to tell the sessions apart.
              <div key={p.courseId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="font-semibold text-fg text-sm leading-snug min-w-0">{p.title || p.locationName}</p>
                  {p.distKm !== null && userCoords && (
                    <span className="text-clay font-medium text-xs shrink-0">{formatDist(p.distKm)}</span>
                  )}
                </div>
                {!!p.title && <p className="text-fg/70 text-xs">{p.locationName}</p>}
                {!!p.timeRange && <p className="text-fg text-xs mt-0.5">{p.timeRange}</p>}
                <p className="text-fg text-xs mb-1.5">{formatDateRange(p.dateRange)}</p>
                <div className="flex items-center justify-between gap-2">
                  {/* Days and age are pills here rather than filter controls — the panel versions
                      were removed; you read them off the row instead. */}
                  <div className="flex flex-wrap items-center gap-1 min-w-0">
                    {status === 'ongoing'  && <Badge bg="#14532d" color="#86efac">ONGOING</Badge>}
                    {status === 'upcoming' && <Badge bg="#422006" color="#fbbf24">UPCOMING</Badge>}
                    {status === 'past'     && <Badge bg="#1f2937" color="#6b7280">PAST</Badge>}
                    {!!p.days && <Badge bg="#1e3a5f" color="#93c5fd">{p.days.toUpperCase()}</Badge>}
                    {!!p.ageRange && <Badge bg="#2d2d3a" color="#d1d5db">{p.ageRange.toUpperCase()}</Badge>}
                  </div>
                  {p.activityUrl && (
                    <a href={p.activityUrl} target="_blank" rel="noopener noreferrer"
                       onClick={(e) => e.stopPropagation()}
                       className="shrink-0 inline-flex items-center rounded-2xl bg-clay px-2.5 py-1
                                  text-xs font-bold text-white hover:bg-clay-dark transition-colors">
                      View Activity
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
