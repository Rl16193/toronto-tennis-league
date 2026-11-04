import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Sheet } from './Sheet';
import { field, fieldLabelCls } from './Input';
import { cn } from '../lib/cn';

/**
 * The site's one dropdown. A field-shaped trigger that opens a Sheet of options, NOT a native
 * `<select>`.
 *
 * Native selects were rejected for three reasons that all showed up in real use: the popup ignores
 * the app's theme on several platforms, its rows are far below the 44px tap target, and it cannot
 * show a description under an option. This renders as an ordinary field so it lines up with the
 * inputs beside it, and the option list is the same Sheet every other modal uses.
 *
 * Intended to replace every remaining native `<select>` in the app — see CLAUDE.md. Add options as
 * a plain array of strings, or as `{ value, label, hint }` when an option needs explaining.
 */

export type SelectOption = { value: string; label: string; hint?: string };

const normalise = (options: readonly (string | SelectOption)[]): SelectOption[] =>
  options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

export const SelectField: React.FC<{
  label?: string;
  value: string;
  options: readonly (string | SelectOption)[];
  onChange: (value: string) => void;
  /** Shown on the trigger while nothing is chosen. */
  placeholder?: string;
  /** Heading on the option sheet. Falls back to the label. */
  title?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  className?: string;
  /** Adds a search box above the options, matching label and hint (long lists, e.g. members). */
  searchable?: boolean;
}> = ({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  title,
  required,
  error,
  disabled,
  className,
  searchable,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const items = normalise(options);
  const chosen = items.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q)) : items;

  const close = () => { setOpen(false); setQuery(''); };
  const pick = (next: string) => {
    onChange(next);
    close();
  };

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {label && (
        <label className={fieldLabelCls}>
          {label}
          {required && <span className="text-clay ml-0.5">*</span>}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          field,
          'flex items-center justify-between gap-3 text-left',
          !chosen && 'text-fg/70',
          error && 'border-badge-loss',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay',
        )}
      >
        <span className="truncate">{chosen ? chosen.label : placeholder}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-fg/70" aria-hidden="true" />
      </button>

      {error && <p className="text-xs text-badge-loss mt-1 ml-1">{error}</p>}

      <AnimatePresence>
        {open && (
          <Sheet onClose={close} title={title ?? label ?? 'Choose'} maxWidthClassName="max-w-md">
            <div className="p-3 pt-1 space-y-1">
              {searchable && (
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  aria-label="Search options"
                  className={cn(field, 'mb-2')}
                />
              )}
              {shown.length === 0 && <p className="px-3 py-3 text-sm text-fg/70">No matches</p>}
              {shown.map((option) => {
                const active = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => pick(option.value)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'w-full min-h-11 flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay',
                      active ? 'bg-clay/15 text-fg font-bold' : 'text-fg hover:bg-fg/10',
                    )}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm">{option.label}</span>
                      {option.hint && <span className="block text-xs text-fg/70 mt-0.5">{option.hint}</span>}
                    </span>
                    {active && <Check className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
};
