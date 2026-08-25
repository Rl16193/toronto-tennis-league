import React from 'react';

// Shared loading overlay: dark backdrop, label, slim progress bar, percentage. Originated on
// the Courts page (CourtMap.tsx) and extracted here for reuse wherever a page needs to show
// data-loading progress instead of a plain spinner or (worse) a flash of empty/stale content.
export const LoadingBar: React.FC<{
  label: string;
  progress: number;
  className?: string;
}> = ({ label, progress, className }) => (
  <div className={className ?? 'absolute inset-0 z-20 bg-tennis-dark flex flex-col items-center justify-center gap-4'}>
    <p className="text-fg font-semibold text-sm tracking-wide">{label}</p>
    <div
      className="w-56 h-1.5 bg-fg/10 rounded-full overflow-hidden"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={`${progress}%`}
    >
      <div
        className="h-full bg-clay rounded-full transition-all duration-500 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
    <p className="text-fg/70 text-xs">{progress}%</p>
  </div>
);
