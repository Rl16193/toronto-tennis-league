import React, { useState } from 'react';
import type { PickleballEntry } from './courtMapTypes';

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

const SEL_BG = '#163a22';

export function FilterSelect({
  label, value, options, onChange, disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const selStyle = { background: SEL_BG, color: '#fff' } as const;
  return (
    <div className={`flex flex-col gap-0.5 ${disabled ? 'opacity-35 pointer-events-none' : ''}`}>
      <span className="text-white/50 text-[10px] uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ background: SEL_BG }}
        className="w-full text-xs text-white rounded-md px-2 py-1.5 border border-white/20
                   focus:outline-none focus:border-white/40 appearance-none cursor-pointer"
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
      <span className="text-white/50 text-[10px] uppercase tracking-wide">Days</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left text-xs text-white rounded-md px-2 py-1.5
                   border border-white/20 flex items-center justify-between"
        style={{ background: SEL_BG }}
      >
        <span className="truncate">{label}</span>
        <span className="text-white/40 ml-1 text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 right-0 z-50 mt-0.5 rounded-md p-1.5
                     grid grid-cols-7 gap-1 shadow-xl border border-white/20"
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
                ${selected.has(d) ? 'bg-clay text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
            >
              {d[0]}
            </button>
          ))}
        </div>
      )}
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
