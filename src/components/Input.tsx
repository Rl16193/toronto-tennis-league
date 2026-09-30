import React from 'react';
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
  'w-full rounded-2xl bg-tennis-surface/50 border border-fg/25 px-4 py-3 text-fg placeholder-fg/70 transition-all duration-200 focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none';

/** The label above a field. Same reason as above — one copy, shared by Input and SelectField. */
export const fieldLabelCls = 'block text-sm font-medium text-fg';

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  required,
  ...props
}) => {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className={fieldLabelCls}>
          {label}
          {required && <span className="text-clay ml-0.5">*</span>}
        </label>
      )}
      <input
        required={required}
        className={cn(
          field,
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-badge-loss mt-1 ml-1">{error}</p>
      )}
    </div>
  );
};
