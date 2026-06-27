import React from 'react';
import { ScoreSubmissionDoc } from './types';
import { formatPlayerName } from './utils';

type Props = {
  submissions: ScoreSubmissionDoc[];
  onConfirm: (sub: ScoreSubmissionDoc) => void;
  onReject: (sub: ScoreSubmissionDoc) => void;
};

const setScoreString = (s: ScoreSubmissionDoc): string => {
  const pairs: [number, number][] = [
    [s.set_1_player_1 ?? 0, s.set_1_player_2 ?? 0],
    [s.set_2_player_1 ?? 0, s.set_2_player_2 ?? 0],
    [s.set_3_player_1 ?? 0, s.set_3_player_2 ?? 0],
  ];
  return pairs.filter(([a, b]) => a > 0 || b > 0).map(([a, b]) => `${a}-${b}`).join('  ');
};

export const PendingScoresPanel: React.FC<Props> = ({ submissions, onConfirm, onReject }) => {
  if (submissions.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-clay/40 bg-clay/[0.06] overflow-hidden">
      <div className="px-4 py-3 border-b border-clay/20 flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full bg-clay text-white text-[10px] font-bold">{submissions.length}</span>
        <span className="text-sm font-bold text-white">Pending score{submissions.length !== 1 ? 's' : ''} to confirm</span>
      </div>
      <div className="divide-y divide-white/5">
        {submissions.map((s) => {
          const winnerIsP1 = s.claimed_winner_user_id && s.claimed_winner_name === s.player_1_name;
          const scoreStr = s.is_walkover ? 'Walkover' : setScoreString(s);
          return (
            <div key={s.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="text-sm text-white/90 truncate">
                  <span className="text-white/40 text-xs mr-2">{s.match_round}{s.draw_label ? ` · ${s.draw_label}` : ''}</span>
                  <span className={winnerIsP1 ? 'font-bold text-white' : ''}>{formatPlayerName(s.player_1_name)}</span>
                  <span className="text-white/30 mx-1.5">vs</span>
                  <span className={!winnerIsP1 ? 'font-bold text-white' : ''}>{formatPlayerName(s.player_2_name)}</span>
                </p>
                <p className="text-xs text-white/50 mt-0.5">
                  {scoreStr && <span className="font-mono mr-2">{scoreStr}</span>}
                  Winner: <span className="text-white/70">{formatPlayerName(s.claimed_winner_name)}</span>
                  <span className="text-white/30"> · submitted by {formatPlayerName(s.submitted_by_name)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onConfirm(s)}
                  className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-500 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => onReject(s)}
                  className="px-3 py-1.5 rounded-lg border border-white/15 text-white/60 text-xs font-bold hover:text-white hover:border-white/30 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
