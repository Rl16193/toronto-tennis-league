import React, { useEffect, useMemo, useState } from 'react';
import { Accordion } from '../../components/Accordion';
import { TournamentMatch, TournamentPlayer } from './types';
import { formatDeadline } from './utils';
import { getRoundLabels } from './bracketImage';
import { getRoundState } from './BracketView';
import { MatchCard } from './MatchCard';

// Mobile bracket (wireframe 1b): instead of panning a 900px grid sideways, each round is a
// vertical accordion section — one open at a time — with round chips (R16 ✓ / QF / SF / F) that
// jump between rounds. Same match semantics as BracketView (status dot, score line, submit and
// edit affordances); only the layout differs. Everyone gets this on mobile, players included —
// the old PNG-in-new-tab fallback is retired.
type Props = {
  matches: TournamentMatch[];
  editMode?: boolean;
  editPlayers?: TournamentPlayer[];
  onEditPlayer?: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  onRemovePlayer?: (uid: string) => void;
  isCreator?: boolean;
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
  pendingMatchIds?: Set<string>;
  roundDeadlines?: Record<string, string>;
  onUpdateDeadline?: (round: string, date: string) => void;
};

const STATE_LABEL = { preview: 'Live Preview', loading: 'Loading', started: 'Started', finished: 'Finished' } as const;

export const BracketAccordion: React.FC<Props> = ({
  matches, editMode, editPlayers = [], onEditPlayer, onRemovePlayer,
  isCreator, onSubmitScore, submittableMatchIds, pendingMatchIds,
  roundDeadlines = {}, onUpdateDeadline,
}) => {
  const drawSize = Math.max(8, matches[0]?.drawsize || 8);
  const roundLabels = getRoundLabels(drawSize);

  const rounds = useMemo(
    () => roundLabels.map((round) => {
      const roundMatches = matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position);
      return { round, matches: roundMatches, state: getRoundState(roundMatches) };
    }),
    [matches, roundLabels],
  );

  // Default open: the first round that's still in play (loading/started/preview after a
  // finished one), else the final.
  const defaultOpen = useMemo(() => {
    const live = rounds.find((r) => r.state === 'started') || rounds.find((r) => r.state === 'loading') || rounds.find((r) => r.state === 'preview');
    return (live ?? rounds[rounds.length - 1])?.round ?? null;
  }, [rounds]);

  const [openRound, setOpenRound] = useState<string | null>(defaultOpen);
  useEffect(() => { setOpenRound(defaultOpen); }, [defaultOpen]);

  return (
    <section className="rounded-[2rem] bg-tennis-surface/20 p-4">
      {editMode && (
        <p className="text-center text-xs text-badge font-semibold mb-3">
          Edit mode — use dropdowns to reassign players
        </p>
      )}

      {/* Round chips — jump to a section instead of panning sideways */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
        {rounds.map((r) => (
          <button
            key={r.round}
            type="button"
            onClick={() => setOpenRound(r.round)}
            className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              openRound === r.round
                ? 'bg-clay border-clay text-white'
                : 'bg-fg/5 border-fg/10 text-fg/70 hover:border-fg/30'
            }`}
          >
            {r.round}{r.state === 'finished' ? ' ✓' : ''}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {rounds.map((r) => (
          <Accordion
            key={r.round}
            id={r.round}
            title={`${r.round}: ${STATE_LABEL[r.state]}`}
            open={openRound === r.round}
            onToggle={(id) => setOpenRound((cur) => (cur === id ? null : id))}
            highlight={r.state === 'started'}
            right={
              onUpdateDeadline ? (
                <input
                  type="date"
                  value={roundDeadlines[r.round] ?? ''}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onUpdateDeadline(r.round, e.target.value)}
                  className="text-[10px] text-fg/70 bg-transparent border-none outline-none cursor-pointer hover:text-fg [color-scheme:dark]"
                  title={`Set deadline for ${r.round}`}
                />
              ) : roundDeadlines[r.round] ? (
                <span className="text-[10px] text-fg/70">Till {formatDeadline(roundDeadlines[r.round])}</span>
              ) : undefined
            }
          >
            <div className="space-y-2.5 pt-1">
              {r.matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  variant="stack"
                  isFinal={r.round === 'F'}
                  editMode={editMode}
                  editPlayers={editPlayers}
                  onEditPlayer={onEditPlayer}
                  onRemovePlayer={onRemovePlayer}
                  isCreator={isCreator}
                  onSubmitScore={onSubmitScore}
                  submittableMatchIds={submittableMatchIds}
                  pendingMatchIds={pendingMatchIds}
                />
              ))}
            </div>
          </Accordion>
        ))}
      </div>
    </section>
  );
};
