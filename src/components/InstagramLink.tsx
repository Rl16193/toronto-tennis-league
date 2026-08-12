import React from 'react';
import { Instagram } from 'lucide-react';
import { INSTAGRAM_URL } from '../features/tasks/useTasks';

/**
 * The one Instagram link. Previously five hand-rolled copies across Home, Profile, Tasks and
 * StaticPages disagreed on icon size, gap, and label (two read "Instagram", two read
 * "@racqnstringstoronto", one was bare text with the URL hardcoded past the constant).
 * Everything now renders the logo plus the word "Instagram" and points at INSTAGRAM_URL.
 */
export const InstagramLink: React.FC<{ className?: string }> = ({ className = '' }) => (
  <a
    href={INSTAGRAM_URL}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center gap-1.5 hover:text-clay transition-colors ${className}`}
  >
    <Instagram className="w-3.5 h-3.5 shrink-0" />
    Instagram
  </a>
);
