import React from 'react';
import { cn } from '../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
}

export const field =
  'w-full min-h-11 rounded-2xl bg-tennis-surface/50 border border-fg/25 px-4 py-2.5 text-base text-fg placeholder-fg/70 transition-all duration-200 focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none';
export const fieldLabelCls = 'block text-[11px] font-bold uppercase tracking-widest text-fg/70 mb-1.5';

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  required,
  startAdornment,
  endAdornment,
  ...props
}) => {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className={fieldLabelCls}>
          {label}
          {required && <span className="text-clay-fg ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {startAdornment && <span className="absolute left-3 top-1/2 -translate-y-1/2">{startAdornment}</span>}
        <input
          required={required}
          className={cn(
            field,
            startAdornment && 'pl-10',
            endAdornment && 'pr-10',
            error && 'border-badge-loss focus:border-badge-loss focus:ring-badge-loss/20',
            className,
          )}
          {...props}
        />
        {endAdornment && <span className="absolute right-3 top-1/2 -translate-y-1/2">{endAdornment}</span>}
      </div>
      {error && <p className="text-xs text-badge-loss mt-1 ml-1">{error}</p>}
    </div>
  );
};
