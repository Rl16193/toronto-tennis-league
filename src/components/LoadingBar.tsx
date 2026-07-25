import React from 'react';

// Shared loading overlay: dark backdrop, label, slim progress bar, percentage. Originated on
// the Courts page (CourtMap.tsx) and extracted here for reuse wherever a page needs to show
// data-loading progress instead of a plain spinner or (worse) a flash of empty/stale content.
export const LoadingBar: React.FC<{
  label: string;
  progress: number;
  className?: string;
  /** Tailwind bg-* class for the progress fill. Defaults to the app's clay accent. */
  barColorClassName?: string;
}> = ({ label, progress, className, barColorClassName = 'bg-clay' }) => (
  <div className={className ?? 'absolute inset-0 z-20 bg-tennis-dark flex flex-col items-center justify-center gap-4'}>
    <p className="text-fg font-semibold text-sm tracking-wide">{label}</p>
    <div className="w-56 h-1.5 bg-fg/10 rounded-full overflow-hidden">
      <div
        className={`h-full ${barColorClassName} rounded-full transition-all duration-500 ease-out`}
        style={{ width: `${progress}%` }}
      />
    </div>
    <p className="text-fg/40 text-xs">{progress}%</p>
  </div>
);
