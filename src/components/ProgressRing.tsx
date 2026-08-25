import React from 'react';

export const ProgressRing: React.FC<{ value: number; label?: string; size?: number }> = ({
  value,
  label,
  size = 44,
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={label}
      role="img"
    >
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-fg/10" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          className="text-clay transition-[stroke-dashoffset]"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <span className="absolute text-[10px] font-black text-fg">{Math.round(clamped)}%</span>
    </div>
  );
};
