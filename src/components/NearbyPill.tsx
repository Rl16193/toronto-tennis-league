import React from 'react';
import { MapPin } from 'lucide-react';

// Shown wherever two players share a preferred court. Theme-safe neutral pill (matches the
// "Friendly"/"Challenge" tag pattern already used across the app — `text-fg`/`border-fg` opacity
// tokens flip automatically with the theme, no hardcoded white/black).
export const NearbyPill: React.FC<{ show: boolean; className?: string }> = ({ show, className }) => {
  if (!show) return null;
  return (
    <span
      className={`shrink-0 rounded-full bg-fg/5 text-fg text-[9px] font-bold px-2 py-0.5 inline-flex items-center gap-1 ${className ?? ''}`}
    >
      <MapPin className="w-2.5 h-2.5 shrink-0" />Nearby
    </span>
  );
};
