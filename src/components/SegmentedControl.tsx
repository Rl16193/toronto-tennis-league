import React, { useId } from 'react';
import { motion } from 'motion/react';

// Two-or-three-way toggle (Groups/Knockout, Upcoming/Completed, Tournament/Community).
// Options share the width equally; the active one fills clay and slides between segments.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div className={`flex bg-fg/5 rounded-2xl p-1 ${className}`} role="tablist" aria-label="Options">
      {options.map((o, index) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${layoutId}-${o.value}`}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % options.length
                  : (index - 1 + options.length) % options.length;
              onChange(options[next].value);
              (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
            }}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 text-center rounded-xl py-3 text-sm font-bold transition-colors ${
              active ? 'text-white' : 'bg-tennis-deep text-fg hover:bg-tennis-deep/80'
            }`}
          >
            {active && (
              <motion.div
                layoutId={`${layoutId}-pill`}
                className="absolute inset-0 bg-clay rounded-xl -z-0"
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
