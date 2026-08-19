import React, { useState } from 'react';
import { Sheet } from '../../../components/Sheet';
import { Button } from '../../../components/Button';
import { useAuth } from '../../../context/AuthContext';
import { useProfileActions } from '../hooks/useProfileActions';
import { AVAILABILITY_TAGS } from '../../../utils/availability';

// Simplified availability picker — any number of preset windows (multi-select chips), replacing
// the old 7-day × AM/PM grid. Writes straight to the real profile via updateAvailabilityTags.
export const AvailabilityModal: React.FC<{ onClose: () => void; onDone?: () => void }> = ({ onClose, onDone }) => {
  const { profile } = useAuth();
  const { updateLoading, actions } = useProfileActions();
  const [selected, setSelected] = useState<string[]>(profile?.preferences.availability_tags || []);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const handleSave = async () => {
    if (await actions.updateAvailabilityTags(selected)) {
      onDone?.();
      onClose();
    }
  };

  return (
    <Sheet onClose={onClose} title="Your Availability" maxWidthClassName="max-w-md">
      <div className="p-6 pt-2 space-y-5">
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY_TAGS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors ${
                selected.includes(t.id)
                  ? 'bg-clay border-clay text-white'
                  : 'bg-white text-ink border-fg/10 hover:bg-white/90'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button onClick={handleSave} isLoading={updateLoading} className="w-full">
          Save Availability
        </Button>
      </div>
    </Sheet>
  );
};
