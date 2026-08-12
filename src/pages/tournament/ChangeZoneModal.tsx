import React, { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { ZONE_NAMES } from '../../utils/zones';
import { ZONE_COURT_COUNTS } from '../../utils/zoneCourtCounts';

/**
 * Player-facing zone picker. Replaces the old notify-only button: the request now names the zone
 * they actually want, so the organizer can action it without a conversation.
 *
 * Court counts are shown against each option because that's the practical difference between
 * zones — a zone with 118 courts is a different proposition from one with 70.
 */
export const ChangeZoneModal: React.FC<{
  currentZone: string;
  onClose: () => void;
  onSubmit: (zone: string) => Promise<void> | void;
}> = ({ currentZone, onClose, onSubmit }) => {
  const [picked, setPicked] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!picked || picked === currentZone) return;
    setSaving(true);
    try {
      await onSubmit(picked);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} title="Change Zone" maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-4">
        <p className="text-sm text-fg/70">
          You&apos;re currently in <span className="font-bold text-fg">{currentZone || 'no zone'}</span>.
          Pick the zone you&apos;d like to play in — the organizer reviews every request.
        </p>

        <div className="space-y-2">
          {ZONE_NAMES.map((z) => {
            const isCurrent = z === currentZone;
            const isPicked = z === picked;
            return (
              <button
                key={z}
                type="button"
                disabled={isCurrent}
                onClick={() => setPicked(z)}
                className={`w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                  isPicked ? 'bg-clay/15 border border-clay/50'
                    : isCurrent ? 'bg-fg/[0.03] opacity-50 cursor-not-allowed'
                    : 'bg-fg/5 hover:bg-fg/[0.08] border border-transparent'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-fg truncate">{z}</span>
                  <span className="block text-[11px] text-fg/70">
                    {ZONE_COURT_COUNTS[z].courts} courts · {ZONE_COURT_COUNTS[z].sites} locations
                  </span>
                </span>
                {isCurrent && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-fg/70">Current</span>}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">Cancel</Button>
          <Button size="sm" onClick={submit} isLoading={saving} disabled={!picked} className="flex-1">
            Request move
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
