import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Send } from 'lucide-react';
import { Button } from '../../components/Button';
import { TournamentMatch } from './types';

type Opponent = { name: string; userId: string; contact: string };

type Props = {
  opponent: Opponent;
  myActiveMatch: TournamentMatch | null;
  hasSubmittedScore: boolean;
  onSubmitScore: () => void;
};

export const OpponentCard: React.FC<Props> = ({ opponent, myActiveMatch, hasSubmittedScore, onSubmitScore }) => (
  <section className="mb-8 rounded-[2rem] bg-tennis-surface/40 border border-white/10 p-5 md:p-6">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black text-white">Your opponent is {opponent.name}</h2>
        <p className="text-gray-400 mt-2">
          Contact opponent to schedule match outside of weekend matchdays:{' '}
          <span className="text-clay font-semibold">{opponent.contact || 'Preferred contact not available'}</span>
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {opponent.userId && (
          <Link to={`/players/${opponent.userId}`}>
            <Button variant="ghost">
              <ExternalLink className="w-4 h-4 mr-2" />
              Profile
            </Button>
          </Link>
        )}
        {myActiveMatch ? (
          hasSubmittedScore ? (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              Score submitted
            </div>
          ) : (
            <Button onClick={onSubmitScore}>
              <Send className="w-4 h-4 mr-2" />
              Submit Score
            </Button>
          )
        ) : (
          <p className="text-sm text-gray-400 max-w-xs">Submit Score here after you play your match.</p>
        )}
      </div>
    </div>
  </section>
);
