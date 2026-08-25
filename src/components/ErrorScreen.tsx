import React from 'react';
import { AlertTriangle } from 'lucide-react';

export const ErrorScreen: React.FC<{ title?: string; message?: string; onRetry?: () => void }> = ({
  title = 'Something went wrong',
  message = 'Please try again.',
  onRetry,
}) => (
  <div role="alert" className="flex min-h-48 items-center justify-center px-5 text-center">
    <div className="space-y-3">
      <AlertTriangle className="mx-auto h-7 w-7 text-badge-loss" aria-hidden="true" />
      <h1 className="text-lg font-black text-fg">{title}</h1>
      <p className="text-sm text-fg/70">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-xl bg-clay px-4 py-2 text-sm font-bold text-white">
          Try again
        </button>
      )}
    </div>
  </div>
);
