import React from 'react';
import { Download, Pencil, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Button } from '../../components/Button';

type Props = {
  title: string;
  isCreator: boolean;
  generating: boolean;
  updatingDraw: boolean;
  resettingDraw: boolean;
  canReset: boolean;
  editMode: boolean;
  started: boolean;
  mergeWomensSingles: boolean;
  consolidateDoubles: boolean;
  onDownload: () => void;
  onGenerateAll: () => void;
  onUpdateDraw: () => void;
  onResetDraw: () => void;
  onToggleEdit: () => void;
  onToggleMergeWomens: () => void;
  onToggleConsolidateDoubles: () => void;
};

export const TournamentHeader: React.FC<Props> = ({
  title, isCreator, generating, updatingDraw, resettingDraw, canReset,
  editMode, started, mergeWomensSingles, consolidateDoubles,
  onDownload, onGenerateAll, onUpdateDraw, onResetDraw, onToggleEdit,
  onToggleMergeWomens, onToggleConsolidateDoubles,
}) => (
  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
    <div>
      <h1 className="text-3xl md:text-5xl font-display font-black text-white">{title}</h1>
      <p className="text-gray-400 mt-3 max-w-2xl">
        Draw updates after scores are submitted either in person or online.
      </p>
    </div>
    <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
      <Button variant="outline" onClick={onDownload}>
        <Download className="w-4 h-4 mr-2" />
        Download Draw
      </Button>
      {isCreator && (
        <>
          {!started && (
            <>
              <Button
                variant={mergeWomensSingles ? 'danger' : 'outline'}
                onClick={onToggleMergeWomens}
              >
                {mergeWomensSingles ? "Unmerge Women's" : "Merge Women's"}
              </Button>
              <Button
                variant={consolidateDoubles ? 'danger' : 'outline'}
                onClick={onToggleConsolidateDoubles}
              >
                {consolidateDoubles ? 'Split Doubles' : 'Consolidate Doubles'}
              </Button>
            </>
          )}
          <Button onClick={onGenerateAll} isLoading={generating}>
            <ShieldCheck className="w-4 h-4 mr-2" />
            Finalize Draw
          </Button>
          <Button variant="outline" onClick={onUpdateDraw} isLoading={updatingDraw}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Update Draw
          </Button>
          <Button variant={editMode ? 'danger' : 'outline'} onClick={onToggleEdit}>
            {editMode ? (
              <><X className="w-4 h-4 mr-2" />Done Editing</>
            ) : (
              <><Pencil className="w-4 h-4 mr-2" />Edit Draw</>
            )}
          </Button>
          <Button variant="danger" onClick={onResetDraw} isLoading={resettingDraw} disabled={!canReset}>
            Reset Draw
          </Button>
        </>
      )}
    </div>
  </div>
);
