import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../components/Button';
import { RRConfig } from './types';

type Props = {
  playerCount: number;
  isConversion?: boolean;
  isLoading?: boolean;
  onConfirm: (config: RRConfig) => void;
  onClose: () => void;
};

const KNOCKOUT_LABELS: Record<string, string> = {
  '2': 'Final',
  '4': 'Semi-finals + Final',
};

function deriveKnockout(numGroups: number, advancementCount: number): string {
  const total =
    numGroups === 3
      ? 4 // special: globally ranked top 4
      : numGroups * advancementCount;
  if (numGroups === 1) return 'Top 2 → Final';
  return `${total} players → ${KNOCKOUT_LABELS[String(total)] ?? `${total}-player knockout`}`;
}

export const RRConfigModal: React.FC<Props> = ({
  playerCount, isConversion = false, isLoading = false, onConfirm, onClose,
}) => {
  const [groupSize, setGroupSize] = useState<4 | 5>(4);
  const [advancementCount, setAdvancementCount] = useState<1 | 2>(2);
  const [convertConfirmed, setConvertConfirmed] = useState(false);

  const preview = useMemo(() => {
    if (playerCount < 3) return null;
    let numGroups = Math.max(1, Math.ceil(playerCount / groupSize));
    // Reduce if any group < 3
    while (numGroups > 1) {
      const base = Math.floor(playerCount / numGroups);
      if (base >= 3) break;
      numGroups--;
    }
    const base = Math.floor(playerCount / numGroups);
    const extras = playerCount % numGroups;
    const groupDesc =
      extras === 0
        ? `${numGroups} group${numGroups > 1 ? 's' : ''} of ${base}`
        : `${numGroups - extras} group${numGroups - extras > 1 ? 's' : ''} of ${base}, ${extras} group${extras > 1 ? 's' : ''} of ${base + 1}`;
    const knockout = deriveKnockout(numGroups, advancementCount);
    return { numGroups, groupDesc, knockout };
  }, [playerCount, groupSize, advancementCount]);

  const canConfirm = !isConversion || convertConfirmed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-3xl bg-tennis-dark border border-white/10 shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {isConversion ? 'Convert to Round Robin' : 'Round Robin Setup'}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conversion warning */}
        {isConversion && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 space-y-2">
            <p className="text-sm font-semibold text-red-400">
              This will delete all existing bracket matches and rebuild as Round Robin.
            </p>
            <p className="text-xs text-red-400/70">
              Stats from any completed matches will not be reversed. Only convert before play has begun.
            </p>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-red-300 mt-1">
              <input
                type="checkbox"
                checked={convertConfirmed}
                onChange={(e) => setConvertConfirmed(e.target.checked)}
                className="accent-clay"
              />
              I understand — proceed with conversion
            </label>
          </div>
        )}

        {/* Player count */}
        <p className="text-sm text-white/60">
          <span className="font-bold text-white">{playerCount}</span> players registered
        </p>

        {/* Group size */}
        <div>
          <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Target Group Size</p>
          <div className="flex gap-2">
            {([4, 5] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setGroupSize(size)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  groupSize === size
                    ? 'bg-clay text-white border-clay'
                    : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                }`}
              >
                {size} players / group
              </button>
            ))}
          </div>
        </div>

        {/* Advancement per group */}
        <div>
          <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Players Advancing per Group</p>
          <div className="flex gap-2">
            {([1, 2] as const).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setAdvancementCount(count)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  advancementCount === count
                    ? 'bg-clay text-white border-clay'
                    : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                }`}
              >
                Top {count}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview */}
        {preview ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1 text-sm">
            <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Preview</p>
            <p className="text-white">{preview.groupDesc}</p>
            <p className="text-white/60">{preview.knockout}</p>
            {preview.numGroups === 3 && advancementCount === 2 && (
              <p className="text-xs text-amber-300/70 mt-1">
                3 groups: top 2 from each (6 total) — globally ranked, top 4 advance.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-red-400">Need at least 3 registered players to generate a group draw.</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm({ groupSize, advancementCount })}
            disabled={!preview || !canConfirm || isLoading}
            isLoading={isLoading}
            className="flex-1"
          >
            {isConversion ? 'Convert' : 'Generate'}
          </Button>
        </div>
      </div>
    </div>
  );
};
