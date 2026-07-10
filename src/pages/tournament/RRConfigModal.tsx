import React, { useState } from 'react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { RRConfig } from './types';

type Props = {
  playerCount: number;
  isConversion?: boolean;
  isLoading?: boolean;
  onConfirm: (config: RRConfig) => void;
  onClose: () => void;
};

export const RRConfigModal: React.FC<Props> = ({
  playerCount, isConversion = false, isLoading = false, onConfirm, onClose,
}) => {
  const [convertConfirmed, setConvertConfirmed] = useState(false);
  const canConfirm = playerCount >= 3 && (!isConversion || convertConfirmed);

  return (
    <Sheet onClose={onClose} maxWidthClassName="max-w-md">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="pr-10">
          <h2 className="text-lg font-bold text-white">
            {isConversion ? 'Convert to Round Robin' : 'Round Robin Setup'}
          </h2>
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

        {/* How groups + knockout are formed (sizes are automatic — see the preview on the page) */}
        {playerCount >= 3 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5 text-sm">
            <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">How it works</p>
            <p className="text-white/70">
              Groups are formed automatically by <span className="text-white">skill band</span> and{' '}
              <span className="text-white">preferred-court zone</span>, in balanced groups of 3–5.
            </p>
            <p className="text-white/70">
              Every group winner advances to the knockout, then the best runners-up fill up to the next
              4 / 8 / 16-player bracket.
            </p>
            <p className="text-white/40 text-xs pt-1">The exact groups are shown in the preview on the page.</p>
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
            onClick={() => onConfirm({ advancementCount: 1 })}
            disabled={!canConfirm || isLoading}
            isLoading={isLoading}
            className="flex-1"
          >
            {isConversion ? 'Convert' : 'Generate'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
