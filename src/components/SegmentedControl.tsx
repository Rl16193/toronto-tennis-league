import { useId } from 'react';
import { motion } from 'motion/react';
import { focusRing } from './Button';

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
    <div className={`flex gap-1 bg-fg/5 rounded-2xl p-1 ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 min-h-9 text-center rounded-2xl px-3 py-2 text-sm font-semibold leading-none cursor-pointer transition-colors ${focusRing} ${
              active ? 'text-white' : 'text-fg hover:bg-fg/10'
            }`}
          >
            {active && (
              <motion.div
                layoutId={`${layoutId}-pill`}
                className="absolute inset-0 bg-clay rounded-2xl -z-0"
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
