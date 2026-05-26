import React from 'react';
import { Link } from 'react-router-dom';

type Opponent = { name: string; userId: string; contact: string; email: string; phone: string };

type Props = {
  opponent: Opponent;
  eventId?: string;
};

export const OpponentCard: React.FC<Props> = ({ opponent }) => {
  const loaded = opponent.name !== 'Player Loading';
  return (
    <div className="mb-6 flex items-center gap-4 flex-wrap">
      <span className="text-white font-semibold">Your opponent is {opponent.name}</span>
      {loaded && (
        <Link
          to={`/players/${opponent.userId}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-clay text-white text-sm font-bold hover:bg-clay/80 transition-colors"
        >
          Go to Opponent's Profile
        </Link>
      )}
    </div>
  );
};
