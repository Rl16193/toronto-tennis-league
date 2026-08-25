import React from 'react';
import { cn } from '../lib/cn';

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}> = ({ label, value, hint, className }) => (
  <div className={cn('rounded-2xl border border-fg/10 bg-tennis-surface/50 p-4', className)}>
    <p className="text-xs font-bold uppercase tracking-wide text-fg/60">{label}</p>
    <p className="mt-2 text-2xl font-black text-fg">{value}</p>
    {hint && <p className="mt-1 text-xs text-fg/70">{hint}</p>}
  </div>
);
