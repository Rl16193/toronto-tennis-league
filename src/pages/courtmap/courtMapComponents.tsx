import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PickleballEntry } from './courtMapUtils';

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
        // Borderless to match the flat chrome elsewhere. The filled background (SEL_BG) and the
        // focus ring carry the affordance the outline used to, so the control is still obviously
        // a control without drawing a box around every filter.
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
