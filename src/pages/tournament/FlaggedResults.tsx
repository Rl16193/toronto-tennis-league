import React from 'react';
import { Check, Flag } from 'lucide-react';
import { Button } from '../../components/Button';
import { ScoreSubmission, TournamentMatch } from './types';

type Props = {
  submissions: ScoreSubmission[];
  matches: TournamentMatch[];
  onResolve: (match: TournamentMatch, submission: ScoreSubmission) => void;
};

const SetScores: React.FC<{ submission: ScoreSubmission; match: TournamentMatch }> = ({ submission, match }) => {
  const sets = [
    [submission.set_1_player_1, submission.set_1_player_2],
    [submission.set_2_player_1, submission.set_2_player_2],
    [submission.set_3_player_1, submission.set_3_player_2],
  ].filter(([p1, p2]) => (p1 ?? 0) + (p2 ?? 0) > 0);

  const p1First = match.player_1_name.split(' ')[0];
  const p2First = match.player_2_name.split(' ')[0];

  return (
    <div className="text-sm text-gray-300 space-y-1">
      {sets.map(([p1, p2], i) => (
        <p key={i}>
          Set {i + 1}:{' '}
          <span className="font-semibold text-white">{p1First} {p1}</span>
          {' — '}
          <span className="font-semibold text-white">{p2First} {p2}</span>
        </p>
      ))}
    </div>
  );
};

export const FlaggedResults: React.FC<Props> = ({ submissions, matches, onResolve }) => {
  const flagged = submissions.filter((s) => s.status === 'flagged');
  if (flagged.length === 0) return null;

  const byMatch = new Map<string, ScoreSubmission[]>();
  flagged.forEach((s) => {
    byMatch.set(s.match_doc_id, [...(byMatch.get(s.match_doc_id) ?? []), s]);
  });

  return (
    <section className="mt-8 rounded-[2rem] bg-red-500/10 border border-red-500/20 p-6">
      <div className="flex items-center gap-3 mb-5">
        <Flag className="w-5 h-5 text-red-300" />
        <h2 className="text-xl font-black text-white">Disputed Results</h2>
        <span className="ml-auto text-xs text-red-300 font-semibold">{byMatch.size} dispute{byMatch.size !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-6">
        {[...byMatch.entries()].map(([matchDocId, subs]) => {
          const match = matches.find((m) => m.id === matchDocId);
          if (!match) return null;

          return (
            <div key={matchDocId} className="rounded-2xl bg-tennis-dark/50 border border-white/10 p-5">
              <p className="text-xs uppercase tracking-widest text-red-300 font-black mb-1">Disputed match</p>
              <p className="text-white font-bold text-lg mb-0.5">
                {match.player_1_name} vs {match.player_2_name}
              </p>
              <p className="text-sm text-gray-400 mb-4">{match.round} · Match {match.match_id}</p>

              <p className="text-sm text-gray-400 mb-3">
                Both players submitted different results. Pick the correct one:
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                {subs.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl bg-tennis-surface/60 border border-white/10 p-4 flex flex-col gap-3"
                  >
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Submitted by {s.submitted_by_name}</p>
                      <p className="text-white font-bold">Winner: {s.claimed_winner_name}</p>
                    </div>

                    <SetScores submission={s} match={match} />

                    <Button
                      variant="outline"
                      onClick={() => onResolve(match, s)}
                      className="mt-auto"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Use this result
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
