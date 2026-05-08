import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SkillGroup, TournamentPlayer } from './types';

type MoveablePlayer = TournamentPlayer & { currentGroup: SkillGroup };

type Props = {
  players: MoveablePlayer[];
  onMove: (userIds: string[], target: SkillGroup) => void;
};

export const PlayerMovePanel: React.FC<Props> = ({ players, onMove }) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (players.length === 0) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const move = (target: SkillGroup) => {
    if (selected.size === 0) return;
    onMove([...selected], target);
    setSelected(new Set());
    setOpen(false);
  };

  const selectedPlayers = players.filter((p) => selected.has(p.user_id));

  return (
    <div className="mb-6">
      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Move Players</p>

      <div className="relative inline-block">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-tennis-surface/60 text-gray-300 hover:text-white border border-white/10 text-sm font-medium min-w-52"
        >
          <span>
            {selected.size === 0
              ? 'Select players…'
              : `${selected.size} player${selected.size > 1 ? 's' : ''} selected`}
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 mt-1 min-w-full w-72 bg-[#1a2332] border border-white/10 rounded-xl shadow-xl max-h-64 overflow-y-auto">
              {players.map((player) => (
                <button
                  key={player.user_id}
                  onClick={() => toggle(player.user_id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 text-left gap-3"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      selected.has(player.user_id) ? 'bg-clay border-clay' : 'border-white/30'
                    }`}>
                      {selected.has(player.user_id) && (
                        <svg viewBox="0 0 10 8" className="w-2.5 h-2.5">
                          <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="text-sm text-gray-200 truncate">{player.name}</span>
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    player.currentGroup === 'Masters'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    {player.currentGroup}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {selectedPlayers.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedPlayers.map((p) => (
              <span key={p.user_id} className="flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-sm text-gray-200">
                {p.name}
                <button onClick={() => toggle(p.user_id)} className="text-gray-400 hover:text-white leading-none">×</button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => move('Masters')}
              className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-sm font-bold transition-colors"
            >
              Move to Masters
            </button>
            <button
              onClick={() => move('Challengers')}
              className="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 text-sm font-bold transition-colors"
            >
              Move to Challengers
            </button>
          </div>
        </>
      )}
    </div>
  );
};
