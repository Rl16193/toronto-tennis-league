import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { tapScale } from '../lib/motion';

// +/− number input for score entry — fewer mis-taps than a number keyboard on a phone.
export const Stepper: React.FC<{
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string; // for screen readers: "A. Chen set 1 score"
  className?: string;
}> = ({ value, onChange, min = 0, max = 99, label, className = '' }) => (
  <div className={`flex items-center justify-between rounded-xl border border-fg/10 bg-fg/5 px-1.5 py-1 ${className}`}>
    <motion.button
      type="button"
      onClick={() => onChange(Math.max(min, value - 1))}
      disabled={value <= min}
      aria-label={`Decrease ${label}`}
      whileTap={value <= min ? undefined : tapScale.whileTap}
      transition={tapScale.transition}
      className="w-10 h-10 flex items-center justify-center rounded-lg text-fg/60 hover:text-fg hover:bg-fg/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      <Minus className="w-4 h-4" />
    </motion.button>
    <span className="text-base font-black text-fg tabular-nums min-w-[2ch] text-center" aria-label={label}>
      {value}
    </span>
    <motion.button
      type="button"
      onClick={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      aria-label={`Increase ${label}`}
      whileTap={value >= max ? undefined : tapScale.whileTap}
      transition={tapScale.transition}
      className="w-10 h-10 flex items-center justify-center rounded-lg text-fg/60 hover:text-fg hover:bg-fg/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      <Plus className="w-4 h-4" />
    </motion.button>
  </div>
);
