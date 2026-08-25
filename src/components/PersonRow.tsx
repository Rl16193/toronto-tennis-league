import React from 'react';
import { cn } from '../lib/cn';

export const formatPersonName = (name: string, fallback = 'Player') => name.trim() || fallback;
export const initialOf = (name: string) => formatPersonName(name).slice(0, 1).toUpperCase();

export const PersonRow: React.FC<{
  name: string;
  subtitle?: React.ReactNode;
  avatar?: string;
  zone?: React.ReactNode;
  action?: React.ReactNode;
  density?: 'compact' | 'default' | 'comfortable';
  className?: string;
}> = ({ name, subtitle, avatar, zone, action, density = 'default', className }) => {
  const padding = density === 'compact' ? 'py-2' : density === 'comfortable' ? 'py-4' : 'py-3';
  return (
    <div className={cn('flex min-h-11 items-center gap-3 border-b border-fg/10', padding, className)}>
      {avatar ? (
        <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-clay/15 text-xs font-black text-clay-fg">
          {initialOf(name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-fg">{formatPersonName(name)}</p>
        {subtitle && <p className="truncate text-xs text-fg/70">{subtitle}</p>}
      </div>
      {zone && <span className="shrink-0 text-xs text-fg/70">{zone}</span>}
      {action && <div className="flex w-[78px] shrink-0 justify-end">{action}</div>}
    </div>
  );
};
