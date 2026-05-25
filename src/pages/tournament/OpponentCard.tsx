import React from 'react';
import { Link } from 'react-router-dom';

type Opponent = { name: string; userId: string; contact: string; email: string; phone: string };

type Props = {
  opponent: Opponent;
  eventId?: string;
};

export const OpponentCard: React.FC<Props> = ({ opponent }) => (
  <section className="mb-8 rounded-[2rem] bg-tennis-surface/40 border border-white/10 p-5 md:p-6">
    <h2 className="text-2xl font-black text-white mb-1">Your opponent is {opponent.name}</h2>
    <p className="text-white/70 text-sm mb-2">Contact your opponent to schedule your matches:</p>
    <div className="flex flex-col gap-0.5 mb-4">
      {opponent.email && <span className="text-clay font-semibold">{opponent.email}</span>}
      {opponent.phone && <span className="text-clay font-semibold">{opponent.phone}</span>}
      {!opponent.email && !opponent.phone && <span className="text-clay font-semibold">Contact not available</span>}
    </div>
    <Link
      to={`/players/${opponent.userId}`}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-clay text-white text-sm font-bold hover:bg-clay/80 transition-colors"
    >
      Go to Opponent's Profile
    </Link>
  </section>
);
