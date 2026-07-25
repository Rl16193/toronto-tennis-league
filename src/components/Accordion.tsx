import React from 'react';
import { ChevronDown } from 'lucide-react';

// Collapsible card section — extracted from the Tasks page's inline `Section` so brackets,
// RR groups, and profile sections share one pattern. Controlled: the parent owns open state,
// which supports both single-open (accordion) and independently-open groups.
export const Accordion: React.FC<{
  id: string;
  title: React.ReactNode;
  right?: React.ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  locked?: boolean;
  highlight?: boolean; // clay border — "this is the live/current section"
  children: React.ReactNode;
}> = ({ id, title, right, open, onToggle, locked, highlight, children }) => (
  <div
    className={`rounded-3xl border p-5 ${
      locked
        ? 'bg-tennis-surface/15 border-fg/5'
        : highlight
          ? 'bg-tennis-surface/30 border-clay/40'
          : 'bg-tennis-surface/30 border-fg/5'
    }`}
  >
    <button
      type="button"
      onClick={() => onToggle(id)}
      className="w-full flex items-center justify-between gap-3 text-left"
      aria-expanded={open}
    >
      <h2 className={`font-bold text-sm ${locked ? 'text-fg/40' : 'text-fg'}`}>{title}</h2>
      <span className="flex items-center gap-2 shrink-0">
        {right}
        <ChevronDown className={`w-4 h-4 text-fg/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </span>
    </button>
    {open && <div className="mt-2">{children}</div>}
  </div>
);
