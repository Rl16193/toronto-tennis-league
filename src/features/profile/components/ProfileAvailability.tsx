import React, { useState } from 'react';
import { Calendar, Pencil, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/Button';
import { DAY_CODES, DAY_LABELS, getAvailabilityGrid, type AvailabilityGrid, type TimeSlot } from '../../../utils/availability';

interface Props {
  updateAvailabilityGrid: (grid: AvailabilityGrid) => Promise<boolean>;
  updateLoading: boolean;
}

export const ProfileAvailability: React.FC<Props> = ({ updateAvailabilityGrid, updateLoading }) => {
  const { profile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AvailabilityGrid>({});

  if (!profile) return null;

  const grid = getAvailabilityGrid(profile.preferences);
  const source = editing ? draft : grid;
  const has = (day: string, slot: TimeSlot) => (source[day] ?? []).includes(slot);

  const startEdit = () => { setDraft(getAvailabilityGrid(profile.preferences)); setEditing(true); };
  const toggle = (day: string, slot: TimeSlot) => setDraft((prev) => {
    const cur = prev[day] ?? [];
    const next = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot];
    const copy = { ...prev };
    if (next.length) copy[day] = next; else delete copy[day];
    return copy;
  });
  const save = async () => { if (await updateAvailabilityGrid(draft)) setEditing(false); };

  return (
    <div className="rounded-[2.5rem] border border-white/5 bg-tennis-surface/30 shadow-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-clay" />Availability
        </h2>
        <button type="button" onClick={editing ? () => setEditing(false) : startEdit}
          className="text-white/40 hover:text-white transition-colors" aria-label={editing ? 'Cancel' : 'Edit availability'}>
          {editing ? <X className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 items-center">
        <span />
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 text-center w-10">AM</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 text-center w-10">PM</span>
        {DAY_CODES.map((d) => (
          <React.Fragment key={d}>
            <span className="text-sm text-white/80 py-1.5">{DAY_LABELS[d]}</span>
            {(['AM', 'PM'] as TimeSlot[]).map((slot) => (
              <div key={slot} className="flex justify-center">
                <button type="button" disabled={!editing} onClick={() => toggle(d, slot)}
                  className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                    has(d, slot) ? 'bg-clay border-clay' : 'bg-white/5 border-white/15'
                  } ${editing ? 'cursor-pointer hover:border-clay/60' : 'cursor-default'}`}>
                  {has(d, slot) && <span className="text-white text-[10px]">✓</span>}
                </button>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      {editing && <Button size="sm" className="mt-4" onClick={save} isLoading={updateLoading}>Save</Button>}
    </div>
  );
};
