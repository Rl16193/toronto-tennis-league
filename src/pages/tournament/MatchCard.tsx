import React from 'react';
import { Check, Send, Trash2 } from 'lucide-react';
import { SelectField } from '../../components/SelectField';
import { TournamentMatch, TournamentPlayer } from './types';
import { BYE, PLAYER_LOADING, formatPlayerName, getMatchDisplayFlags } from './utils';
import { isGuest } from '../../utils/guest';

/** Set by the Tournament page for organizers only: opens a player's profile. null = names are text. */
export const PlayerLinkContext = React.createContext<((uid: string) => void) | null>(null);

/** uid → seed for the draw on screen (Tournament.tsx). A seeded name reads "(1) Name". */
export const SeedContext = React.createContext<Record<string, number>>({});

/** Set by the Tournament page for organizers only: queues the WhatsApp/SMS reminder for 8:00am, resolving to how many players. */
export const RemindContext = React.createContext<((matchId: string) => Promise<number>) | null>(null);

/** Paper plane on an unplayed match with two players: tap, tap again to send. Organizers only. */
export const RemindButton: React.FC<{ match: TournamentMatch; className?: string }> = ({ match, className = '' }) => {
  const remind = React.useContext(RemindContext);
  const [state, setState] = React.useState<'idle' | 'confirm' | 'sending' | 'done'>('idle');
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    if (state !== 'confirm' && state !== 'done') return undefined;
    const t = setTimeout(() => { setState('idle'); setNote(''); }, state === 'done' ? 4000 : 3000);
    return () => clearTimeout(t);
  }, [state]);
  const real = (uid: string, name: string) => !!uid && name !== BYE && name !== PLAYER_LOADING;
  if (!remind || match.status !== 'accepted' || !real(match.player_1_uid, match.player_1_name)
    || !real(match.player_2_uid, match.player_2_name)) return null;
  const tap = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'idle') { setState('confirm'); return; }
    if (state !== 'confirm') return;
    setState('sending');
    try {
      const sent = await remind(match.id);
      setNote(sent ? 'Queued for 8:00am' : 'No number on file');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not send');
    }
    setState('done');
  };
  const label = state === 'confirm' ? 'Tap again to send the reminder' : 'Send both players a WhatsApp reminder at 8:00am';
  return (
    <button
      type="button"
      onClick={tap}
      disabled={state === 'sending'}
      aria-label={label}
      title={label}
      className={`shrink-0 inline-flex items-center justify-center gap-1 min-h-11 min-w-11 px-2 rounded-2xl text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay ${state === 'confirm' ? 'text-clay bg-clay/10' : 'text-fg/70 hover:text-clay'} ${state === 'sending' ? 'opacity-50' : ''} ${className}`}
    >
      {state === 'done' ? <><Check className="w-4 h-4" aria-hidden />{note}</> : <><Send className="w-4 h-4" aria-hidden />{state === 'confirm' ? 'Send?' : ''}</>}
    </button>
  );
};

/** A player's name in the draw; a link to their profile for organizers (never a guest, BYE or loading slot). */
export const PlayerName: React.FC<{ uid?: string; name: string }> = ({ uid, name }) => {
  const open = React.useContext(PlayerLinkContext);
  const seed = React.useContext(SeedContext)[uid ?? ''];
  const label = formatPlayerName(name);
  const prefix = seed ? <span className="text-fg/70">({seed}) </span> : null;
  if (!open || !uid || isGuest(uid) || name === BYE || name === PLAYER_LOADING) return <>{prefix}{label}</>;
  const go = (e: React.SyntheticEvent) => { e.stopPropagation(); open(uid); };
  return (
    <>
      {prefix}
      <span
        role="link"
        tabIndex={0}
        onClick={go}
        onKeyDown={(e) => { if (e.key === 'Enter') go(e); }}
        className="cursor-pointer underline decoration-fg/30 underline-offset-2 hover:text-clay focus-visible:outline-2 focus-visible:outline-clay"
      >
        {label}
      </span>
    </>
  );
};

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
    score: 'border-t border-fg/10 px-2 py-0.5 text-xs text-fg/70 font-mono tracking-wide',
    winner: 'border-t border-fg/10 px-2 py-1 text-xs font-black text-clay',
    creatorBtn: 'w-full border-t border-fg/10 px-2 py-1 text-xs text-fg/70 hover:text-clay transition-colors text-center leading-tight',
    playerBtn: 'w-full border-t border-fg/10 px-2 py-1 text-xs text-fg/70 hover:text-clay transition-colors text-center leading-tight',
  },
  // Mobile: roomier, with 44px touch targets.
  stack: {
    card: 'relative rounded-2xl bg-tennis-dark/60 overflow-hidden',
    dot: 'absolute top-2 right-2 w-2 h-2 rounded-full z-10',
    row: 'min-h-[44px] flex items-center px-3 text-sm font-semibold',
    lastRowBorder: false,
    check: true,
    score: 'border-t border-fg/10 px-3 py-1 text-xs text-fg/70 font-mono tracking-wide',
    winner: 'border-t border-fg/10 px-3 py-1.5 text-xs font-black text-clay',
    creatorBtn: 'w-full border-t border-fg/10 px-3 py-2 text-xs font-bold text-fg/70 hover:text-clay transition-colors text-center bg-fg/5',
    playerBtn: 'w-full border-t border-fg/10 px-3 py-2 text-xs font-bold text-clay transition-colors text-center bg-clay/10',
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

export const PlayerSelect: React.FC<PlayerSelectProps> = ({ matchId, slot, currentUserId, currentName, players, onSelect, onRemovePlayer }) => {
  const selectValue = currentName === PLAYER_LOADING ? PLAYER_LOADING : (currentUserId || '');
  return (
    <div className="min-h-8 border-b border-fg/10 flex items-center px-1 py-1 bg-clay/10">
      <SelectField
        title="Choose player"
        className="min-w-0"
        value={selectValue}
        options={[
          { value: '', label: BYE },
          PLAYER_LOADING,
          ...players.map((p) => ({ value: p.uid, label: p.name })),
        ]}
        onChange={(value) => {
          if (value === PLAYER_LOADING) {
            onSelect(matchId, slot, { uid: '', name: PLAYER_LOADING, participantId: '' });
          } else {
            const p = value ? players.find((p) => p.uid === value) ?? null : null;
            onSelect(matchId, slot, p);
          }
        }}
      />
      {/* Removing takes the player out of the whole draw; the slot falls back to Player Loading so
          there's still somewhere visible to drop a replacement. */}
      {onRemovePlayer && currentUserId && currentName !== PLAYER_LOADING && (
        <button
          type="button"
          aria-label={`Remove ${currentName} from the draw`}
          title="Remove from draw"
          onClick={() => {
            if (window.confirm(`Remove ${currentName} ?\n\nPlayer will be removed, matches played will be unaffected, and for future matches the opponent gets a walkover.`)) {
              onRemovePlayer(currentUserId);
            }
          }}
          className="shrink-0 p-1 rounded text-fg/70 opacity-70 hover:opacity-100 hover:text-badge-loss hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
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
};

export const MatchCard: React.FC<Props> = ({
  match, variant, isFinal, editMode, editPlayers = [], onEditPlayer, onRemovePlayer,
  isCreator, onSubmitScore, submittableMatchIds,
}) => {
  const v = VARIANTS[variant];
  const {
    isEditable, scoreText, showDot, showCreatorSubmit, showPlayerSubmit,
  } = getMatchDisplayFlags(match, {
    editMode, hasEditHandler: !!onEditPlayer, isCreator, hasSubmitHandler: !!onSubmitScore,
    submittableMatchIds,
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
            <span className="truncate">{formatPlayerName(name) ? <PlayerName uid={uid} name={name} /> : ' '}</span>
            {v.check && isWinner && <Check className="ml-auto size-3.5 shrink-0" aria-label="Winner" />}
          </div>
        );
      })}

      {scoreText && <div className={v.score}>{scoreText}</div>}

      {isFinal && match.result?.winner_name ? (
        <div className={v.winner}>Winner: {formatPlayerName(match.result.winner_name)}</div>
      ) : null}

      {showCreatorSubmit && (
        <div className="flex">
          <button type="button" onClick={() => onSubmitScore!(match)} className={`${v.creatorBtn} min-w-0 flex-1`}>
            {match.status === 'complete' ? 'Edit score' : 'Enter score'}
          </button>
          <RemindButton match={match} className="border-t border-fg/10" />
        </div>
      )}

      {showPlayerSubmit && (
        <button type="button" onClick={() => onSubmitScore!(match)} className={v.playerBtn}>
          Submit score
        </button>
      )}
    </div>
  );
};
