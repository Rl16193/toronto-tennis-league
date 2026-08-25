import React from 'react';

export const Checkbox: React.FC<{
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <label className="inline-flex min-h-11 items-center gap-2 text-sm text-fg">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange?.(event.target.checked)}
      className="h-4 w-4 accent-clay"
    />
    {label}
  </label>
);
