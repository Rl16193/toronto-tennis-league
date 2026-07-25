import React, { useState } from 'react';
import { Button } from '../../components/Button';
import { BADGES, MAX_DISPLAY_BADGES, earnedBadges } from './badges';
import { useTasks } from './useTasks';

// Profile section: shows every badge earned so far and lets the player pick up to three to
// display on their profile card and beside their name on the leaderboards.
export const BadgePicker: React.FC<{
  selected: string[];
  onSave: (ids: string[]) => Promise<boolean>;
  saving: boolean;
}> = ({ selected, onSave, saving }) => {
  const { progress, counters } = useTasks();
  const earned = earnedBadges(progress, counters);
  const earnedIds = new Set(earned.map((b) => b.id));
  const [draft, setDraft] = useState<string[]>(selected);
  const [dirty, setDirty] = useState(false);

  const toggle = (id: string) => {
    setDirty(true);
    setDraft((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_DISPLAY_BADGES) return cur; // silently capped at three
      return [...cur, id];
    });
  };

  if (earned.length === 0) {
    return (
      <p className="text-sm text-fg/40 mt-1">
        No badges yet — complete tasks to earn them.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      <p className="text-xs text-fg/50">
        Pick up to {MAX_DISPLAY_BADGES} to show on your profile and next to your name.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {BADGES.filter((b) => earnedIds.has(b.id)).map((b) => {
          const on = draft.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => toggle(b.id)}
              title={b.requirement}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                on ? 'bg-clay text-white border-clay' : 'bg-white text-ink border-fg hover:bg-white/90'
              }`}
            >
              <span className="mr-1">{b.icon}</span>{b.name}
            </button>
          );
        })}
      </div>
      {dirty && (
        <Button size="sm" isLoading={saving} onClick={async () => { if (await onSave(draft)) setDirty(false); }}>
          Save badges
        </Button>
      )}
    </div>
  );
};
