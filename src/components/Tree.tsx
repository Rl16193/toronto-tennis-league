import React from 'react';
import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * Accordion tree: one card holding collapsible groups, each holding rows with a right-hand
 * value. Shared by the Leaderboard (division → standings), the tournament creator's draw
 * picker (division → draws with fill counts) and Services (category → provider → offers).
 *
 * Distinct from `Accordion`, which is one card *per* section. Here every group lives inside a
 * single bordered card separated by hairlines, and the caret sits on the left — the shape the
 * groups form is the point, so they have to read as one object.
 *
 * Controlled: the parent owns which group is open, so both single-open and multi-open work.
 */

export const Tree: React.FC<{
  title?: React.ReactNode;
  /** Small print under the last group — e.g. a legend for the dot. */
  footnote?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, footnote, className = '', children }) => (
  <div className={`rounded-3xl bg-tennis-surface/30 overflow-hidden ${className}`}>
    {title && <h2 className="px-5 pt-5 pb-3.5 text-base font-black text-fg">{title}</h2>}
    <div className={`divide-y divide-fg/5 ${title ? 'border-t border-fg/5' : ''}`}>{children}</div>
    {footnote && <p className="px-5 py-3 border-t border-fg/5 text-[11px] text-fg/70 text-center">{footnote}</p>}
  </div>
);

export const TreeGroup: React.FC<{
  id: string;
  label: React.ReactNode;
  /** Right-hand summary, e.g. "42 signed up" or "3 offers" — or an interactive element like a
   * button. Rendered outside the toggle button so it can hold its own click handlers. */
  right?: React.ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  /** 0 = top level, 1 = nested one deep (indents to line up under the parent's label). */
  level?: 0 | 1;
  disabled?: boolean;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ id, label, right, open, onToggle, level = 0, disabled, bodyClassName = '', children }) => (
  <div
    className={
      level === 1
        ? 'relative before:absolute before:left-5 before:top-0 before:bottom-0 before:w-px before:bg-fg/10'
        : ''
    }
  >
    <div
      className={`w-full flex items-center gap-2 py-3.5 pr-5 ${level === 1 ? 'pl-10' : 'pl-5'} ${disabled ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        onClick={() => !disabled && onToggle(id)}
        disabled={disabled}
        aria-expanded={open}
        className={`flex items-center gap-2 flex-1 min-w-0 text-left transition-colors ${
          disabled ? 'cursor-not-allowed' : 'hover:text-fg'
        }`}
      >
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-fg/70 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className={`min-w-0 flex-1 ${level === 1 ? 'text-sm font-bold' : 'text-sm font-black'} text-fg`}>
          {label}
        </span>
      </button>
      {right && <span className="shrink-0 text-xs font-bold text-fg/70">{right}</span>}
    </div>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className={`pb-2 ${bodyClassName}`}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export const TreeRow: React.FC<{
  label: React.ReactNode;
  /** Right-hand value, e.g. "14/16". Ignored when `fill` is given. */
  right?: React.ReactNode;
  /** Renders a thin fill bar instead of a plain "count/size" fraction. */
  fill?: { count: number; size: number };
  /** Small clay dot before the right value — callers supply their own legend via Tree's footnote. */
  dot?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  level?: 0 | 1;
}> = ({ label, right, fill, dot, active, disabled, onClick, level = 0 }) => {
  // The indent is a left MARGIN plus a smaller padding, not one big padding. The selected row
  // paints a solid background, and with the whole indent as padding that background started at
  // x=0 — running back underneath the parent group's own label instead of beginning where the
  // group's content does. Margin moves the box; padding only moves the text inside it.
  // The two add up to the same text position as before, so nothing shifts.
  // The width is stated explicitly rather than left to a block-level flex box stretching on its
  // own, so the row is guaranteed to run all the way to the right edge of the group.
  const shared = `flex items-center gap-2.5 py-2 pr-3.5 text-left rounded-xl transition-colors ${
    level === 1 ? 'ml-10 w-[calc(100%-2.5rem)] pl-4' : 'ml-5 w-[calc(100%-1.25rem)] pl-5'
  }`;
  const pct = fill ? Math.min(100, Math.round((fill.count / Math.max(1, fill.size)) * 100)) : 0;
  const body = (
    <>
      <span className={`min-w-0 flex-1 text-sm truncate ${active ? 'font-bold' : 'text-fg'}`}>{label}</span>
      {fill ? (
        <span className="shrink-0 flex items-center gap-1.5 w-20">
          <span className={`flex-1 h-1.5 rounded-full overflow-hidden ${active ? 'bg-clay/15' : 'bg-fg/10'}`}>
            <span
              className={`block h-full rounded-full ${active ? 'bg-clay' : 'bg-fg/30'}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className={`shrink-0 text-[10px] tabular-nums ${active ? 'text-clay/70' : 'text-fg/70'}`}>
            {fill.count}/{fill.size}
          </span>
        </span>
      ) : right ? (
        <span
          className={`shrink-0 flex items-center gap-1.5 text-xs tabular-nums ${active ? 'text-clay/70' : 'text-fg/70'}`}
        >
          {right}
          {dot && <span className="w-1.5 h-1.5 rounded-full bg-clay" aria-hidden="true" />}
        </span>
      ) : null}
    </>
  );

  const activeClass = active ? 'bg-white text-clay' : '';
  if (!onClick) return <div className={`${shared} ${activeClass}`}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${shared} ${activeClass} ${
        disabled ? 'opacity-40 cursor-not-allowed' : active ? '' : 'hover:bg-fg/[0.03]'
      }`}
    >
      {body}
    </button>
  );
};
