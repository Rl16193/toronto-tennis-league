import React from 'react';

export type TrendSeries = { label: string; color: string; data: number[] };

// Small dependency-free multi-line trend chart with a colored legend row below it.
export const AreaChart: React.FC<{ series: TrendSeries[]; className?: string }> = ({ series, className }) => {
  const longest = Math.max(0, ...series.map((s) => s.data.length));
  if (longest < 2) {
    return <div className={`flex items-center justify-center text-fg/30 text-xs ${className ?? ''}`}>Not enough matches yet</div>;
  }

  const W = 300, H = 80, PAD = 6;
  const allValues = series.flatMap((s) => s.data);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const lineFor = (data: number[]) => {
    const pts = data.map((v, i) => {
      const x = PAD + (i / (longest - 1)) * (W - 2 * PAD);
      const y = PAD + (1 - (v - min) / range) * (H - 2 * PAD);
      return [x, y] as const;
    });
    return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  };

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1 min-h-0" preserveAspectRatio="none" role="img" aria-label="Progress trend">
        {series.map((s) => (
          <path key={s.label} d={lineFor(s.data)} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex items-center justify-center gap-4 pt-1.5 shrink-0">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-fg/50">
            <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};
