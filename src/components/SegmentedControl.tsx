import React, { useId } from 'react';
import { motion } from 'motion/react';

// Two-or-three-way toggle (Groups/Knockout, Upcoming/Completed, Tournament/Community).
// Options share the width equally; the active one fills clay and slides between segments.
export function SegmentedControl<T extends string>({ options, value, onChange, className = '' }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const layoutId = useId();
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
            className={`relative flex-1 text-center rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              active ? 'text-white' : 'bg-white text-ink hover:bg-white/90'
            }`}
          >
            {active && (
              <motion.div
                layoutId={`${layoutId}-pill`}
                className="absolute inset-0 bg-clay rounded-lg -z-0"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
