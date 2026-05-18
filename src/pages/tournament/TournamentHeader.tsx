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

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap mb-8">
      {/* Download — always visible */}
      <Button variant="outline" onClick={onDownload}>
        <Download className="w-4 h-4 mr-2" />
        Download Draw
      </Button>
      {!isCreator && (
        <span className="text-xs text-orange-500 font-medium">
          Draw updates after scores are submitted to the organizer in person, WhatsApp or Instagram.
        </span>
      )}

      {isCreator && (
        <>
          {/* Merge Draws dropdown */}
          {!started && (
            <div className="relative">
              <Button
                variant={anyMergeActive ? 'clay' : 'outline'}
                onClick={() => setMergeOpen((v) => !v)}
              >
                Merge Draws
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${mergeOpen ? 'rotate-180' : ''}`} />
              </Button>

              {mergeOpen && (
                <div className="absolute left-0 top-full mt-2 z-20 min-w-[200px] rounded-2xl border border-white/10 bg-tennis-dark shadow-2xl p-2 space-y-1">
                  {[
                    { label: "Men's Singles", active: mergeMensSingles, onToggle: onToggleMergeMens },
                    { label: "Women's Singles", active: mergeWomensSingles, onToggle: onToggleMergeWomens },
                    { label: 'Doubles', active: consolidateDoubles, onToggle: onToggleConsolidateDoubles },
                  ].map(({ label, active, onToggle }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { onToggle(); setMergeOpen(false); }}
                      className={`w-full flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                        active
                          ? 'bg-clay/20 text-clay'
                          : 'text-gray-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {label}
                      {active && <span className="text-xs font-bold text-clay">Unmerge</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasMatches ? (
            <Button variant="danger" onClick={onCancelMatches} isLoading={isProcessing}>
              <XCircle className="w-4 h-4 mr-2" />
              Cancel Matches
            </Button>
          ) : (
            <Button onClick={onGenerateMatches} isLoading={isProcessing}>
              <Play className="w-4 h-4 mr-2" />
              Generate Matches
            </Button>
          )}

          <Button variant={editMode ? 'danger' : 'outline'} onClick={onToggleEdit}>
            {editMode ? (
              <><X className="w-4 h-4 mr-2" />Done Editing</>
            ) : (
              <><Pencil className="w-4 h-4 mr-2" />Edit Draw</>
            )}
          </Button>
        </>
      )}
    </div>
  );
};
