import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

type Opponent = { name: string; userId: string; contact: string };

type Props = {
  opponent: Opponent;
  eventId?: string;
};

export const OpponentCard: React.FC<Props> = ({ opponent }) => (
  <section className="mb-8 rounded-[2rem] bg-tennis-surface/40 border border-white/10 p-5 md:p-6">
    <div>
      <h2 className="text-2xl font-black text-white">Your opponent is {opponent.name}</h2>
      <p className="text-white mt-2">
        Contact your opponent to schedule your matches:{' '}
        <span className="text-clay font-semibold">{opponent.contact || 'Contact not available'}</span>
      </p>
      <Link
        to={`/players/${opponent.userId}`}
        className="inline-flex items-center gap-1.5 mt-3 text-sm text-clay font-semibold hover:underline"
      >
        View Profile <ExternalLink size={14} />
      </Link>
    </div>
  </section>
);
