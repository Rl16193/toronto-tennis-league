import React from 'react';
import { cn } from '../lib/cn';

type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
const tone: Record<PillTone, string> = {
  neutral: 'bg-fg/10 text-fg/80',
  accent: 'bg-clay/15 text-clay-fg',
  success: 'bg-green-500/10 text-badge-win',
  warning: 'bg-amber-500/10 text-badge',
  danger: 'bg-red-500/10 text-badge-loss',
};

export const Pill: React.FC<React.PropsWithChildren<{ tone?: PillTone; className?: string }>> = ({
  tone: value = 'neutral',
  className,
  children,
}) => (
  <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold', tone[value], className)}>
    {children}
  </span>
);
