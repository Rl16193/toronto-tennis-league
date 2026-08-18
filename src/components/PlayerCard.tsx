import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronDown, Minus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

// Rank movement since the last weekly snapshot. Lives here rather than on a page because it now
// renders on every surface that shows a player row.
export const RankMove: React.FC<{ t?: 'up' | 'down' | 'flat'; move?: number }> = ({ t, move }) =>
  t === 'up' ? (
    <span className="inline-flex items-center gap-0.5 text-badge-win" aria-label={`rising${move ? ` ${move}` : ''}`}>
      <ArrowUp className="w-3 h-3" />{!!move && <span className="text-[10px] font-bold">{move}</span>}
    </span>
  ) : t === 'down' ? (
    <span className="inline-flex items-center gap-0.5 text-badge-loss" aria-label={`falling${move ? ` ${move}` : ''}`}>
      <ArrowDown className="w-3 h-3" />{!!move && <span className="text-[10px] font-bold">{move}</span>}
    </span>
  ) : (
    <Minus className="w-3 h-3 text-fg/70 inline" aria-label="no change" />
  );

// Where a row came from, as a single letter on the name line: T tournament, C challenge,
// R friendly (rally). Clay for the two competitive sources, plain foreground for friendlies —
// which is white in dark theme and dark green in light, from the --color-fg token.
export const SourceLetter: React.FC<{ source: 'tournament' | 'challenge' | 'rally' }> = ({ source }) => (
  <span
    className={`text-[11px] font-black ${source === 'rally' ? 'text-fg' : 'text-clay'}`}
    aria-label={source === 'tournament' ? 'Tournament' : source === 'challenge' ? 'Challenge' : 'Friendly'}
  >
    {source === 'tournament' ? 'T' : source === 'challenge' ? 'C' : 'R'}
  </span>
);

// One compact, expandable player row shared by the leaderboards, challenges, rallies and
// tournament groups — each had grown its own copy, which is why the boards drifted apart.
//
// Presentational: owns no open state and fetches nothing. The parent keeps its `Set<string>` of
// open ids and passes `open`/`onToggle`, so migrating a surface never changes how it loads data.
// Row identity is normalised here — callers pass `user_id` or `uid` as `id`.

export type PlayerCardStat = {
  label: string;
  value: React.ReactNode;
};

export type PlayerCardProps = {
  id: string;
  name: string;
  /** Secondary line under the name, e.g. "Skill 3.5". */
  subtitle?: React.ReactNode;
  /** Makes the name a link. Surfaces gate this on an accepted challenge or rally existing. */
  nameHref?: string;
  /** Leading position number. Omit on non-ranked surfaces. */
  rank?: number;
  /** Marks the signed-in user's own row. */
  isYou?: boolean;
  /** Right-aligned headline figure, e.g. league points. */
  primary?: React.ReactNode;
  /** Slot after `primary`, e.g. a rank-trend arrow. */
  trailing?: React.ReactNode;
  /**
   * Small marker on the name line, before the name — the single-letter source tag (T/C/R).
   * Kept out of `pills`: a full-width pill row made every row two lines tall just to say which
   * kind of match it was.
   */
  nameBadge?: React.ReactNode;
  /** Pills shown on the collapsed row (availability, nearby, …). */
  pills?: React.ReactNode;
  /** Extra pills revealed only when expanded. */
  expandedPills?: React.ReactNode;
  /** Stat tiles in the drawer. */
  stats?: PlayerCardStat[];
  /**
   * Fixed-width action slot on the collapsed row. Space is reserved even when empty, so names stay
   * in one vertical line down the list.
   */
  action?: React.ReactNode;
  /**
   * Width of that slot. Defaults to the leaderboards' single-button column; a multi-control stack
   * (randomize / reset / score) passes its own so the row doesn't squash.
   */
  actionClassName?: string;
  /** Extra drawer content below the stats grid. */
  children?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  className?: string;
};

export const PlayerCard: React.FC<PlayerCardProps> = ({
  name, subtitle, nameHref, rank, isYou, primary, trailing, nameBadge, pills, expandedPills, stats,
  action, actionClassName = 'w-[78px]', children, open, onToggle, className = '',
}) => {
  const hasDrawer = !!(stats?.length || expandedPills || children);

  return (
    <div className={`${isYou ? 'bg-clay/10' : ''} px-3 py-2.5 ${className}`}>
      <div className="flex items-center gap-3">
        {rank !== undefined && (
          <span className="text-fg/70 font-mono text-xs w-6 shrink-0">{rank}</span>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-fg font-semibold text-sm truncate">
            {nameBadge ? <span className="mr-1.5">{nameBadge}</span> : null}
            {nameHref
              ? <Link to={nameHref} className="hover:text-clay transition-colors">{name}</Link>
              : name}
            {isYou ? <span className="ml-1 text-clay text-[10px]">(you)</span> : null}
          </p>
          {subtitle ? <p className="text-fg/70 text-[11px]">{subtitle}</p> : null}
          {pills ? <div className="flex items-center gap-1.5 flex-wrap mt-1">{pills}</div> : null}
        </div>

        {action !== undefined && (
          <div className={`${actionClassName} shrink-0 flex justify-center`}>{action}</div>
        )}
        {primary !== undefined && (
          <span className="font-black text-fg text-sm shrink-0 w-8 text-right">{primary}</span>
        )}
        {trailing !== undefined && (
          <span className="shrink-0 w-7 flex justify-center">{trailing}</span>
        )}

        {hasDrawer && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`Stats for ${name}`}
            className="shrink-0 p-1 -m-1"
          >
            <ChevronDown className={`w-4 h-4 text-fg/70 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {hasDrawer && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={`${rank !== undefined ? 'pl-9' : 'pl-0'} pr-3 pb-3 pt-1 border-t border-fg/5 space-y-2`}>
              {expandedPills ? <div className="flex items-center gap-1.5 flex-wrap">{expandedPills}</div> : null}

              {/* Two columns; an odd trailing tile spans the full width so 4, 5 and 6 tiles all
                  lay out without a per-caller column setting. Tiles take a ReactNode value, so a
                  surface can drop a status control or a pill cluster into the grid as one. */}
              {!!stats?.length && (
                <div className="grid grid-cols-2 gap-2">
                  {/* Index key, not label: several cells now render with no label at all (their
                      content speaks for itself), so labels are no longer unique. */}
                  {/* Tiles in a row stretch to the tallest, so the value area is a centring flex
                      box and the label is pinned under it. Without this a Contact button sat
                      glued to the top of its tile while the pills beside it wrapped, and the
                      labels underneath ended up at different heights across the row. */}
                  {stats.map((s, i) => (
                    <div
                      key={i}
                      className={`rounded-xl bg-fg/[0.03] px-2 py-2 text-center flex flex-col ${
                        stats.length % 2 === 1 && i === stats.length - 1 ? 'col-span-2' : ''
                      }`}
                    >
                      <div className="text-fg font-bold text-sm flex-1 flex items-center justify-center">{s.value}</div>
                      {/* An empty label renders no header — used by cells whose content already
                          speaks for itself (the tags cell), so they don't get a redundant title. */}
                      {!!s.label && <p className="text-fg/70 text-[9px] uppercase tracking-wide mt-0.5">{s.label}</p>}
                    </div>
                  ))}
                </div>
              )}

              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
