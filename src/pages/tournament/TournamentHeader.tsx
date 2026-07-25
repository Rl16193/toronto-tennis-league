import React, { useState } from 'react';
import { Download, Pencil, Play, Settings2, X, XCircle } from 'lucide-react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { TournamentFormat } from './types';

type Props = {
  isCreator: boolean;
  hasMatches: boolean;
  isProcessing: boolean;
  editMode: boolean;
  started: boolean;
  mergeMensSingles: boolean;
  mergeWomensSingles: boolean;
  consolidateDoubles: boolean;
  currentDrawFormat: TournamentFormat;
  onDownload: () => void;
  onGenerateMatches: () => void;
  onCancelMatches: () => void;
  onToggleEdit: () => void;
  onToggleMergeMens: () => void;
  onToggleMergeWomens: () => void;
  onToggleConsolidateDoubles: () => void;
};

// Organizer controls, mobile remodel (wireframe 1a): the old Download / Generate / Edit / Merge
// button rows collapse into one "Manage Draw" button that opens a bottom sheet listing every
// action. Non-creators never render this (gated at the call site).
export const TournamentHeader: React.FC<Props> = ({
  isCreator, hasMatches, isProcessing, editMode, started,
  mergeMensSingles, mergeWomensSingles, consolidateDoubles,
  currentDrawFormat,
  onDownload, onGenerateMatches, onCancelMatches, onToggleEdit,
  onToggleMergeMens, onToggleMergeWomens, onToggleConsolidateDoubles,
}) => {
  const [open, setOpen] = useState(false);

  if (!isCreator) return null;

  const canMerge = !started && (currentDrawFormat === 'bracket' || currentDrawFormat === 'rr');
  const mergeItems = [
    { label: "Merge Men's Singles", active: mergeMensSingles, onToggle: onToggleMergeMens },
    { label: "Merge Women's Singles", active: mergeWomensSingles, onToggle: onToggleMergeWomens },
    { label: 'Merge Doubles', active: consolidateDoubles, onToggle: onToggleConsolidateDoubles },
  ];

  const Row: React.FC<{
    icon: React.ReactNode; label: string; hint?: string; danger?: boolean; active?: boolean;
    onClick: () => void; busy?: boolean;
  }> = ({ icon, label, hint, danger, active, onClick, busy }) => (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`w-full flex items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition-colors disabled:opacity-50 ${
        active
          ? 'border-clay/50 bg-clay/10'
          : danger
            ? 'border-red-500/25 bg-red-500/5 hover:border-red-500/50'
            : 'border-fg/10 bg-fg/5 hover:border-fg/30'
      }`}
    >
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        danger ? 'bg-red-500/15 text-red-400' : active ? 'bg-clay/20 text-clay' : 'bg-fg/5 text-fg/70'
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-bold ${danger ? 'text-red-400' : 'text-fg'}`}>{label}</span>
        {hint && <span className="block text-xs text-fg/40 mt-0.5">{hint}</span>}
      </span>
      {active && <span className="text-[10px] font-black uppercase tracking-wide text-clay shrink-0">On</span>}
    </button>
  );

  return (
    <div className="mb-8">
      <Button variant="white" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Settings2 className="w-4 h-4 mr-2" />Manage Draw
      </Button>

      {open && (
        <Sheet onClose={() => setOpen(false)} title="Manage Draw" maxWidthClassName="max-w-md">
          <div className="p-6 pt-3 space-y-2.5">
            <Row
              icon={<Download className="w-4 h-4" />}
              label="Download Draw"
              hint="Save the current draw as an image"
              onClick={() => { onDownload(); setOpen(false); }}
            />
            {hasMatches ? (
              <Row
                icon={<XCircle className="w-4 h-4" />}
                label="Cancel Matches"
                hint="Delete this draw's generated matches"
                danger
                busy={isProcessing}
                onClick={() => { onCancelMatches(); setOpen(false); }}
              />
            ) : (
              <Row
                icon={<Play className="w-4 h-4" />}
                label="Generate Matches"
                hint="Lock the draw in and create matches"
                busy={isProcessing}
                onClick={() => { onGenerateMatches(); setOpen(false); }}
              />
            )}
            <Row
              icon={editMode ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              label={editMode ? 'Done Editing' : 'Edit Draw'}
              hint={editMode ? undefined : 'Reassign players, set draw size'}
              active={editMode}
              onClick={() => { onToggleEdit(); setOpen(false); }}
            />
            {canMerge && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest text-fg/40 pt-2">Merge Draws</p>
                {mergeItems.map((m) => (
                  <Row
                    key={m.label}
                    icon={<Settings2 className="w-4 h-4" />}
                    label={m.label}
                    hint={m.active ? 'Tap to unmerge' : undefined}
                    active={m.active}
                    onClick={() => { m.onToggle(); setOpen(false); }}
                  />
                ))}
              </>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
};
