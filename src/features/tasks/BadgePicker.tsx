import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { BADGES, BADGE_BY_ID, BADGE_PILL_CLASS, MAX_DISPLAY_BADGES, earnedBadges } from './badges';
import { Counters } from './useTasks';
import type { TaskProgress } from './taskCatalog';

// Profile section: shows the badges the player chose to feature, with an Edit button that opens
// the full earned list in a sheet.
// `progress`/`counters` come from the caller's own useTasks() call rather than calling it again
// here — this component always renders alongside a parent that already has one (ProfileInfo, via
// Profile.tsx), and a second independent listener + auto-award write-effect on the same
// stats/{uid} doc caused visible flicker on first load (two listeners racing each other).
export const BadgePicker: React.FC<{
  selected: string[];
  onSave: (ids: string[]) => Promise<boolean>;
  saving: boolean;
  progress: TaskProgress | null;
  counters: Counters;
}> = ({ selected, onSave, saving, progress, counters }) => {
  const earned = earnedBadges(progress, counters);
  const earnedIds = new Set(earned.map((b) => b.id));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);

  // Only badges still actually earned, in catalogue order, so the row never shows a stale pick.
  const shown = BADGES.filter((b) => selected.includes(b.id) && earnedIds.has(b.id));

  if (earned.length === 0) {
    return null;
  }

  const open = () => { setDraft(selected); setEditing(true); };

  const toggle = (id: string) => {
    setDraft((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_DISPLAY_BADGES) return cur; // silently capped at three
      return [...cur, id];
    });
  };

  // Rendered as bare children so the pills share one flex row with the skill tag in ProfileInfo.
  return (
    <>
      {shown.map((b) => (
        <span key={b.id} title={b.requirement} className={BADGE_PILL_CLASS}>{b.name}</span>
      ))}
      <button
        type="button"
        onClick={open}
        className="px-2.5 py-1 rounded-2xl text-xs font-bold text-clay hover:bg-clay/10 transition-colors"
      >
        Edit
      </button>

      <AnimatePresence>
        {editing && (
          <Sheet onClose={() => setEditing(false)} title="Your badges" maxWidthClassName="max-w-md">
            <div className="p-6 pt-3 space-y-5">
              <p className="text-xs text-fg/70">
                {draft.length} of {MAX_DISPLAY_BADGES} selected.
              </p>

              <div className="flex flex-wrap gap-2">
                {BADGES.filter((b) => earnedIds.has(b.id)).map((b) => {
                  const on = draft.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(b.id)}
                      title={b.requirement}
                      className={`px-2.5 py-1 rounded-2xl text-xs font-bold border transition-all ${
                        on
                          ? 'bg-amber-500/15 text-badge border-amber-500/25'
                          : 'bg-fg/5 text-fg/70 border-fg/10 hover:text-fg'
                      }`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
                <Button
                  variant="clay"
                  className="flex-1"
                  isLoading={saving}
                  onClick={async () => { if (await onSave(draft)) setEditing(false); }}
                >
                  Save
                </Button>
              </div>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  );
};

// ─── Badge row (player profile) ────────────────────────────────────────────────────────────────

// The badges a player chose to display, as text pills. Used on profile cards.
// Deliberately not rendered beside leaderboard names — three text pills there crowded the
// player name out of the row on a phone.
export const BadgeRow: React.FC<{ ids?: string[]; className?: string }> = ({ ids, className }) => {
  const badges = (ids || []).map((id) => BADGE_BY_ID[id]).filter(Boolean);
  if (badges.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {badges.map((b) => (
        <span key={b.id} title={b.requirement} className={BADGE_PILL_CLASS}>
          {b.name}
        </span>
      ))}
    </span>
  );
};
