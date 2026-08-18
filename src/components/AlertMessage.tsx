import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

type AlertTone = 'success' | 'error' | 'warning';

type Props = {
  tone: AlertTone;
  children: React.ReactNode;
  className?: string;
};

// Text uses the theme-aware badge tokens, never raw palette classes — those wash out on the light
// theme. Tinted background/border are safe in both. See CLAUDE.md, "Text colour".
const toneClasses: Record<AlertTone, string> = {
  success: 'bg-green-500/10 border-green-500/20 text-badge-win',
  error: 'bg-red-500/10 border-red-500/20 text-badge-loss',
  warning: 'bg-amber-500/10 border-amber-500/20 text-badge',
};

export const AlertMessage: React.FC<Props> = ({ tone, children, className = '' }) => {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 ${toneClasses[tone]} ${className}`}>
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="font-semibold">{children}</div>
    </div>
  );
};
