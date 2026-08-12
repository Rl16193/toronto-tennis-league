import React from 'react';
import { cn } from '../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

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
        <label className="block text-sm font-medium text-fg">
          {label}
          {required && <span className="text-orange-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        required={required}
        className={cn(
          'w-full rounded-2xl bg-tennis-surface/50 border border-fg/25 px-4 py-3 text-fg placeholder-gray-500 transition-all duration-200 focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-500 mt-1 ml-1">{error}</p>
      )}
    </div>
  );
};
