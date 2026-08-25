import React from 'react';

export const EmptyState: React.FC<{ title: string; description?: string; action?: React.ReactNode }> = ({
  title,
  description,
  action,
}) => (
  <div className="rounded-2xl border border-fg/10 bg-tennis-surface/40 px-5 py-8 text-center">
    <h2 className="text-base font-black text-fg">{title}</h2>
    {description && <p className="mt-2 text-sm text-fg/70">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
