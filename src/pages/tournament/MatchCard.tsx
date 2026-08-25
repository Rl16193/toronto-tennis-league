import React from 'react';
import { Trash2 } from 'lucide-react';
import { TournamentMatch, TournamentPlayer } from './types';
import { BYE, PLAYER_LOADING, formatPlayerName, getMatchDisplayFlags } from './utils';
import { AlertMessage } from '../../components/AlertMessage';

// One match cell, shared by the desktop grid (BracketView) and the mobile accordion
// (BracketAccordion). The sections and the conditions that show them are identical in both —
// status dot, two player rows, score line, final-winner banner, creator/player submit buttons —
// so only the sizing differs. Those differences live in VARIANTS below; everything else is shared.
//
// PlayerSelect lives here rather than in BracketView so this file has no import back into either
// bracket component (that would be a cycle).

type Variant = 'grid' | 'stack';

const VARIANTS = {
  // Desktop: dense cells sized to the bracket grid.
  grid: {
    card: 'relative rounded-sm bg-tennis-dark/60 shadow-sm',
    dot: 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full z-10',
    row: 'h-8 border-b border-fg/10 flex items-center px-2 text-sm font-semibold',
    lastRowBorder: true,
    check: false,
    score: 'border-t border-fg/10 px-2 py-0.5 text-[10px] text-fg/70 font-mono tracking-wide',
    winner: 'border-t border-fg/10 px-2 py-1 text-xs font-black text-clay',
    creatorBtn:
      'w-full border-t border-fg/10 px-2 py-1 text-[10px] text-fg/70 hover:text-clay transition-colors text-center leading-tight',
    playerBtn:
      'w-full border-t border-fg/10 px-2 py-1 text-[10px] text-fg/70 hover:text-clay transition-colors text-center leading-tight',
    submitted: 'w-full border-t border-fg/10 px-2 py-1 text-[10px] text-badge-win text-center leading-tight',
  },
  // Mobile: roomier, with 44px touch targets.
  stack: {
    card: 'relative rounded-xl bg-tennis-dark/60 overflow-hidden',
    dot: 'absolute top-2 right-2 w-2 h-2 rounded-full z-10',
    row: 'min-h-[44px] flex items-center px-3 text-sm font-semibold',
    lastRowBorder: false,
    check: true,
    score: 'border-t border-fg/10 px-3 py-1 text-[11px] text-fg/70 font-mono tracking-wide',
    winner: 'border-t border-fg/10 px-3 py-1.5 text-xs font-black text-clay',
    creatorBtn:
      'w-full border-t border-fg/10 px-3 py-2 text-xs font-bold text-fg/70 hover:text-clay transition-colors text-center bg-fg/[0.03]',
    playerBtn:
      'w-full border-t border-fg/10 px-3 py-2 text-xs font-bold text-clay transition-colors text-center bg-clay/10',
    submitted: 'w-full border-t border-fg/10 px-3 py-2 text-xs text-badge-win text-center',
  },
} as const;

type PlayerSelectProps = {
  matchId: string;
  slot: 'player_1' | 'player_2';
  currentUserId: string;
  currentName: string;
  players: TournamentPlayer[];
  onSelect: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  /** Organizer removes this player from the draw entirely (soft delete). */
  onRemovePlayer?: (uid: string) => void;
};

export const PlayerSelect: React.FC<PlayerSelectProps> = ({
  matchId,
  slot,
  currentUserId,
  currentName,
  players,
  onSelect,
  onRemovePlayer,
}) => {
  const selectValue = currentName === PLAYER_LOADING ? PLAYER_LOADING : currentUserId || '';
  return (
    <div className="h-8 border-b border-fg/10 flex items-center px-1 bg-clay/10">
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === PLAYER_LOADING) {
            onSelect(matchId, slot, { uid: '', name: PLAYER_LOADING, participantId: '' });
          } else {
            const p = e.target.value ? (players.find((p) => p.uid === e.target.value) ?? null) : null;
            onSelect(matchId, slot, p);
          }
        }}
        className="w-full text-xs bg-transparent border-none outline-none cursor-pointer text-fg [&>option]:text-black"
      >
        <option value="">{BYE}</option>
        <option value={PLAYER_LOADING}>{PLAYER_LOADING}</option>
        {players.map((p) => (
          <option key={p.uid} value={p.uid}>
            {p.name}
          </option>
        ))}
      </select>
      {/* Removing takes the player out of the whole draw; the slot falls back to Player Loading so
          there's still somewhere visible to drop a replacement. */}
      {onRemovePlayer && currentUserId && currentName !== PLAYER_LOADING && (
        <button
          type="button"
          aria-label={`Remove ${currentName} from the draw`}
          title="Remove from draw"
          onClick={() => {
            if (
              window.confirm(
                `Remove ${currentName} from this event draw?\n\nThis unregisters them and deletes pending matches. Players with completed matches cannot be removed.`,
              )
            ) {
              onRemovePlayer(currentUserId);
            }
          }}
          className="shrink-0 p-1 rounded text-fg/70 opacity-70 hover:opacity-100 hover:text-badge-loss hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

type Props = {
  match: TournamentMatch;
  variant: Variant;
  isFinal: boolean;
  editMode?: boolean;
  editPlayers?: TournamentPlayer[];
  onEditPlayer?: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  onRemovePlayer?: (uid: string) => void;
  isCreator?: boolean;
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
  pendingMatchIds?: Set<string>;
};

export const MatchCard: React.FC<Props> = ({
  match,
  variant,
  isFinal,
  editMode,
  editPlayers = [],
  onEditPlayer,
  onRemovePlayer,
  isCreator,
  onSubmitScore,
  submittableMatchIds,
  pendingMatchIds,
}) => {
  const v = VARIANTS[variant];
  const { isEditable, scoreText, showDot, showCreatorSubmit, showPlayerSubmit, alreadySubmitted } =
    getMatchDisplayFlags(match, {
      editMode,
      hasEditHandler: !!onEditPlayer,
      isCreator,
      hasSubmitHandler: !!onSubmitScore,
      submittableMatchIds,
      pendingMatchIds,
    });

  return (
    <div className={v.card}>
      {showDot && (
        <span
          className={`${v.dot} ${match.status === 'complete' ? 'bg-green-400' : 'bg-orange-400'}`}
          title={match.status === 'complete' ? 'Score recorded' : 'Pending'}
        />
      )}

      {(['player_1', 'player_2'] as const).map((slot) => {
        const name = slot === 'player_1' ? match.player_1_name : match.player_2_name;
        const uid = slot === 'player_1' ? match.player_1_uid : match.player_2_uid;
        const isWinner = !!match.winner_uid && match.winner_uid === uid;
        const border = slot === 'player_1' || v.lastRowBorder ? 'border-b border-fg/10' : '';

        return isEditable ? (
          <PlayerSelect
            key={slot}
            matchId={match.id}
            slot={slot}
            currentUserId={uid}
            currentName={name}
            players={editPlayers}
            onSelect={onEditPlayer!}
            onRemovePlayer={onRemovePlayer}
          />
        ) : (
          <div key={slot} className={`${v.row} ${border} ${isWinner ? 'text-clay' : 'text-fg'}`}>
            <span className="truncate">{formatPlayerName(name) || ' '}</span>
            {v.check && isWinner && <span className="ml-auto text-xs">✓</span>}
          </div>
        );
      })}

      {scoreText && <div className={v.score}>{scoreText}</div>}

      {match.score_disputed && (
        <AlertMessage tone="error" className="m-2 text-[11px]">
          Conflicting result reported. The organizer must review this match.
        </AlertMessage>
      )}

      {isFinal && match.winner_name ? (
        <div className={v.winner}>Winner: {formatPlayerName(match.winner_name)}</div>
      ) : null}

      {showCreatorSubmit && (
        <button type="button" onClick={() => onSubmitScore!(match)} className={v.creatorBtn}>
          {match.status === 'complete' ? 'Edit score' : 'Enter score'}
        </button>
      )}

      {showPlayerSubmit &&
        (alreadySubmitted ? (
          <div className={v.submitted}>Recorded ✓</div>
        ) : (
          <button type="button" onClick={() => onSubmitScore!(match)} className={v.playerBtn}>
            Submit score
          </button>
        ))}
    </div>
  );
};
