import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/Button';

type Props = {
  isEventCreator: boolean;
  onAddEvent: () => void;
};

export const EventsHeader: React.FC<Props> = ({ isEventCreator, onAddEvent }) => (
  <div className="rounded-[2rem] border border-clay/20 bg-gradient-to-r from-clay/10 via-tennis-surface/40 to-tennis-surface/20 p-5 md:p-6 shadow-xl">
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-display font-black text-white">Events</h1>
        <p className="text-white text-base md:text-lg max-w-xl">Explore Toronto events and join the right draw for your level.</p>
      </div>
      {isEventCreator && (
        <Button onClick={onAddEvent}>
          <Plus className="w-4 h-4 mr-2" />
          Add an Event
        </Button>
      )}
    </div>
  </div>
);
