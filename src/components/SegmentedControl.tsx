import React from 'react';

// Two-or-three-way toggle (Groups/Knockout, Upcoming/Completed, Tournament/Community).
// Options share the width equally; the active one fills clay.
export function SegmentedControl<T extends string>({ options, value, onChange, className = '' }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex bg-fg/5 border border-fg/10 rounded-xl p-1 ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex-1 text-center rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              active ? 'bg-clay text-white' : 'bg-white text-ink hover:bg-white/90'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
