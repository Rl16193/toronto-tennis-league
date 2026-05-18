import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Button } from '../../components/Button';

type Opponent = { name: string; userId: string; contact: string };

type Props = {
  opponent: Opponent;
  eventId?: string;
};

export const OpponentCard: React.FC<Props> = ({ opponent, eventId }) => (
  <section className="mb-8 rounded-[2rem] bg-tennis-surface/40 border border-white/10 p-5 md:p-6">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black text-white">Your opponent is {opponent.name}</h2>
        <p className="text-white mt-2">
          Contact your opponent to schedule your matches:{' '}
          <span className="text-clay font-semibold">{opponent.contact || 'Contact not available'}</span>
        </p>
      </div>
      {opponent.userId && (
        <Link to={`/players/${opponent.userId}${eventId ? `?event=${eventId}` : ''}`}>
          <Button variant="ghost">
            <ExternalLink className="w-4 h-4 mr-2" />
            Profile
          </Button>
        </Link>
      )}
    </div>
  </section>
);
