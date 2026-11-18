import React, { useId } from 'react';
import { cn } from '../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/**
 * The field recipe, exported so anything field-SHAPED can wear it without copying the string.
 * `SelectField` uses it for its trigger, which is why a dropdown lines up with the inputs beside
 * it. Change it here and every field changes together.
 */
export const field =
  'w-full rounded-2xl bg-tennis-surface/50 border border-fg/25 px-4 py-3 text-fg placeholder-fg/70 transition-[border-color,box-shadow] duration-200 focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none';

/** The label above a field. Same reason as above — one copy, shared by Input and SelectField. */
export const fieldLabelCls = 'block text-sm font-medium text-fg';

/** Table and stat-tile recipes: the leaderboard, group cards and dashes all read from these. */
export const tableHeadCls = 'text-xs font-bold uppercase tracking-widest text-fg/70';
export const statTileCls = 'min-w-0 rounded-2xl bg-fg/5 py-2 flex flex-col items-center justify-center text-center';
export const numCls = 'font-black tabular-nums text-fg';

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  required,
  id,
  ...props
}) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className={fieldLabelCls}>
          {label}
          {required && <span className="text-clay ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          field,
          error && 'border-badge-loss focus:border-badge-loss focus:ring-badge-loss/20',
          className
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs text-badge-loss mt-1 ml-1">{error}</p>
      )}
    </div>
  );
};
