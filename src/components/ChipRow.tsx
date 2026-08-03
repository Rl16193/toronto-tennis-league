import React from 'react';
import { motion } from 'motion/react';
import { tapScale } from '../lib/motion';

// One horizontally scrollable row of selectable chips — replaces stacked rows of tab pills.
// The negative margin lets the row bleed to the screen edge so half-visible chips signal
// scrollability, while content stays aligned with the page padding.
export function ChipRow<T extends string>({ options, value, onChange, className = '', bleed = true }: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
  /** Bleed to the viewport edge (default) — set false inside cards/sheets. */
  bleed?: boolean;
}) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto no-scrollbar ${bleed ? '-mx-4 px-4 sm:-mx-6 sm:px-6' : ''} ${className}`}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <motion.button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            whileTap={tapScale.whileTap}
            transition={tapScale.transition}
            className={`shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-bold border transition-colors ${
              active
                ? 'bg-clay border-clay text-white'
                : 'bg-white border-white text-ink hover:bg-white/90'
            }`}
          >
            {o.label}
          </motion.button>
        );
      })}
    </div>
  );
}
