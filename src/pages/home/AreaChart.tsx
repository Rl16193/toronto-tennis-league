import React from 'react';

// Tiny dependency-free area chart. Green when the series ends at/above where it started
// (trending up), red when it ends lower (trending down).
export const AreaChart: React.FC<{ data: number[]; className?: string }> = ({ data, className }) => {
  const id = React.useId();
  if (data.length < 2) {
    return <div className={`flex items-center justify-center text-white/30 text-xs ${className ?? ''}`}>Not enough matches yet</div>;
  }

  const W = 300, H = 80, PAD = 6;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const up = data[data.length - 1] >= data[0];
  const color = up ? '#22c55e' : '#ef4444';

  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - 2 * PAD);
    const y = PAD + (1 - (v - min) / range) * (H - 2 * PAD);
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - PAD} L${pts[0][0].toFixed(1)},${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" role="img" aria-label="Ranking trend">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
