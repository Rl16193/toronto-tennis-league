import React, { useState } from 'react';
import { ChevronDown, Download, Pencil, Play, X, XCircle } from 'lucide-react';
import { Button } from '../../components/Button';

type Props = {
  isCreator: boolean;
  hasMatches: boolean;
  isProcessing: boolean;
  editMode: boolean;
  started: boolean;
  mergeMensSingles: boolean;
  mergeWomensSingles: boolean;
  consolidateDoubles: boolean;
  onDownload: () => void;
  onGenerateMatches: () => void;
  onCancelMatches: () => void;
  onToggleEdit: () => void;
  onToggleMergeMens: () => void;
  onToggleMergeWomens: () => void;
  onToggleConsolidateDoubles: () => void;
};

export const TournamentHeader: React.FC<Props> = ({
  isCreator, hasMatches, isProcessing, editMode, started,
  mergeMensSingles, mergeWomensSingles, consolidateDoubles,
  onDownload, onGenerateMatches, onCancelMatches, onToggleEdit,
  onToggleMergeMens, onToggleMergeWomens, onToggleConsolidateDoubles,
}) => {
  const [mergeOpen, setMergeOpen] = useState(false);

  const anyMergeActive = mergeMensSingles || mergeWomensSingles || consolidateDoubles;

  const mergeMenuItems = [
    { label: "Men's Singles", active: mergeMensSingles, onToggle: onToggleMergeMens },
    { label: "Women's Singles", active: mergeWomensSingles, onToggle: onToggleMergeWomens },
    { label: 'Doubles', active: consolidateDoubles, onToggle: onToggleConsolidateDoubles },
  ];

  const mergeMenu = mergeOpen && (
    <div className="absolute left-0 top-full mt-2 z-20 min-w-[200px] rounded-2xl border border-white/10 bg-tennis-dark shadow-2xl p-2 space-y-1">
      {mergeMenuItems.map(({ label, active, onToggle }) => (
        <button
          key={label}
          type="button"
          onClick={() => { onToggle(); setMergeOpen(false); }}
          className={`w-full flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            active ? 'bg-clay/20 text-clay' : 'text-white hover:bg-white/5 hover:text-white'
          }`}
        >
          {label}
          {active && <span className="text-xs font-bold text-clay">Unmerge</span>}
        </button>
      ))}
    </div>
  );

  const mergeDropdown = !started && (
    <div className="relative">
      <Button
        variant={anyMergeActive ? 'clay' : 'outline'}
        onClick={() => setMergeOpen((v) => !v)}
      >
        Merge Draws
        <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${mergeOpen ? 'rotate-180' : ''}`} />
      </Button>
      {mergeMenu}
    </div>
  );

  return (
    <div className="mb-8">
      {/* Desktop: all in one row */}
      <div className="hidden sm:flex items-center gap-3 flex-wrap">
        <Button variant="outline" onClick={onDownload}>
          <Download className="w-4 h-4 mr-2" />Download Draw
        </Button>
        {!isCreator && (
          <span className="text-xs text-orange-500 font-medium">
            Draw updates after scores are submitted to the organizer in person, WhatsApp or Instagram.
          </span>
        )}
        {isCreator && (
          <>
            {hasMatches ? (
              <Button variant="danger" onClick={onCancelMatches} isLoading={isProcessing}>
                <XCircle className="w-4 h-4 mr-2" />Cancel Matches
              </Button>
            ) : (
              <Button onClick={onGenerateMatches} isLoading={isProcessing}>
                <Play className="w-4 h-4 mr-2" />Generate Matches
              </Button>
            )}
            <Button variant={editMode ? 'danger' : 'outline'} onClick={onToggleEdit}>
              {editMode ? <><X className="w-4 h-4 mr-2" />Done Editing</> : <><Pencil className="w-4 h-4 mr-2" />Edit Draw</>}
            </Button>
            {mergeDropdown}
          </>
        )}
      </div>

      {/* Mobile: 2-row 35/65 grid */}
      <div className="sm:hidden space-y-2">
        {!isCreator && (
          <span className="block text-xs text-orange-500 font-medium mb-2">
            Draw updates after scores are submitted to the organizer in person, WhatsApp or Instagram.
          </span>
        )}
        <div className="grid gap-2" style={{ gridTemplateColumns: '35fr 65fr' }}>
          <Button variant="outline" onClick={onDownload} className="w-full text-xs px-2">
            <Download className="w-3.5 h-3.5 mr-1 shrink-0" />Download
          </Button>
          {isCreator ? (
            hasMatches ? (
              <Button variant="danger" onClick={onCancelMatches} isLoading={isProcessing} className="w-full text-xs px-2">
                <XCircle className="w-3.5 h-3.5 mr-1 shrink-0" />Cancel Matches
              </Button>
            ) : (
              <Button onClick={onGenerateMatches} isLoading={isProcessing} className="w-full text-xs px-2">
                <Play className="w-3.5 h-3.5 mr-1 shrink-0" />Generate Matches
              </Button>
            )
          ) : <div />}
        </div>
        {isCreator && (
          <div className="grid gap-2" style={{ gridTemplateColumns: '35fr 65fr' }}>
            <Button variant={editMode ? 'danger' : 'outline'} onClick={onToggleEdit} className="w-full text-xs px-2">
              {editMode ? <><X className="w-3.5 h-3.5 mr-1 shrink-0" />Done</> : <><Pencil className="w-3.5 h-3.5 mr-1 shrink-0" />Edit</>}
            </Button>
            {!started ? (
              <div className="relative w-full">
                <Button
                  variant={anyMergeActive ? 'clay' : 'outline'}
                  className="w-full text-xs px-2"
                  onClick={() => setMergeOpen((v) => !v)}
                >
                  Merge Draws
                  <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${mergeOpen ? 'rotate-180' : ''}`} />
                </Button>
                {mergeMenu}
              </div>
            ) : <div />}
          </div>
        )}
      </div>
    </div>
  );
};
