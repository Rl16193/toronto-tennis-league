import React from 'react';

export const FieldError: React.FC<{ children?: React.ReactNode; id?: string }> = ({ children, id }) =>
  children ? (
    <p id={id} role="alert" className="mt-1.5 text-xs font-semibold text-badge-loss">
      {children}
    </p>
  ) : null;
