import React from 'react';
import { Button } from '../../../components/Button';
import { Sheet } from '../../../components/Sheet';
import {
  EVENT_SKILL_OPTIONS,
  EVENT_TYPE_OPTIONS,
  EventFormState,
} from '../services/eventService';

type FormMessage = { type: 'success' | 'error'; text: string } | null;

type Props = {
  eventForm: EventFormState;
  setEventForm: (eventForm: EventFormState) => void;
  eventFormMessage: FormMessage;
  creatingEvent: boolean;
  organizerPlaceholder: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

export const CreatorEventModal: React.FC<Props> = ({
  eventForm,
  setEventForm,
  eventFormMessage,
  creatingEvent,
  organizerPlaceholder,
  onSubmit,
  onClose,
}) => (
  <Sheet maxWidthClassName="max-w-4xl" onClose={onClose}>
    <form onSubmit={onSubmit} className="p-6 md:p-8">
      <div className="mb-6 pr-12">
        <h2 className="text-3xl font-display font-black text-fg">Add an Event</h2>
      </div>

      {eventFormMessage && (
        <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${
          eventFormMessage.type === 'success'
            ? 'border-green-500/20 bg-green-500/10 text-green-300'
            : 'border-red-500/20 bg-red-500/10 text-red-300'
        }`}>
          {eventFormMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5">
        <label className="space-y-2">
          <span className="block text-sm font-medium text-fg">Title <span className="text-orange-500">*</span></span>
          <input
            value={eventForm.title}
            onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
            placeholder="Spring Ladder Tournament"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-fg">Type <span className="text-orange-500">*</span></span>
          <select
            value={eventForm.type}
            onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
          >
            {EVENT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-fg">Location</span>
          <input
            value={eventForm.location}
            onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
            placeholder="High Park"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-fg">Organizer <span className="text-orange-500">*</span></span>
          <input
            value={eventForm.organizer}
            onChange={(e) => setEventForm({ ...eventForm, organizer: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
            placeholder={organizerPlaceholder}
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-fg">Start Date <span className="text-orange-500">*</span></span>
          <input
            type="date"
            value={eventForm.startDate}
            onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-fg">End Date <span className="text-orange-500">*</span></span>
          <input
            type="date"
            value={eventForm.endDate}
            onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-fg">Join Last Date <span className="text-fg/50 font-normal">(Optional)</span></span>
          <input
            type="date"
            value={eventForm.joinLastDate}
            onChange={(e) => setEventForm({ ...eventForm, joinLastDate: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-fg">Time</span>
          <input
            value={eventForm.time}
            onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
            placeholder="10:00 AM - 2:00 PM"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-fg">Skill Level</span>
          <select
            value={eventForm.skillLevel}
            onChange={(e) => setEventForm({ ...eventForm, skillLevel: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
          >
            {EVENT_SKILL_OPTIONS.map((skill) => (
              <option key={skill} value={skill}>{skill}</option>
            ))}
          </select>
        </label>

        {eventForm.type === 'Tournament' && (
          <div className="space-y-2">
            <span className="block text-sm font-medium text-fg">Format</span>
            <div className="flex gap-2">
              {(['knockout', 'rr'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setEventForm({ ...eventForm, tournamentFormat: f })}
                  className={`flex-1 py-3 rounded-2xl text-sm font-semibold border transition-colors ${
                    eventForm.tournamentFormat === f
                      ? 'bg-clay text-white border-clay'
                      : 'bg-tennis-dark/70 text-fg/60 border-fg/10 hover:border-fg/30'
                  }`}
                >
                  {f === 'knockout' ? 'Knockout' : 'Round Robin'}
                </button>
              ))}
            </div>
          </div>
        )}

        {eventForm.type === 'Tournament' && (
          <div className="space-y-2">
            <span className="block text-sm font-medium text-fg">Participant Type</span>
            <div className="flex gap-2">
              {(['Singles', 'Doubles'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEventForm({ ...eventForm, tournamentChoice: c })}
                  className={`flex-1 py-3 rounded-2xl text-sm font-semibold border transition-colors ${
                    eventForm.tournamentChoice === c
                      ? 'bg-clay text-white border-clay'
                      : 'bg-tennis-dark/70 text-fg/60 border-fg/10 hover:border-fg/30'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="space-y-2 md:col-span-2">
          <span className="block text-sm font-medium text-fg">About <span className="text-orange-500">*</span></span>
          <textarea
            value={eventForm.about}
            onChange={(e) => setEventForm({ ...eventForm, about: e.target.value })}
            className="min-h-32 w-full rounded-2xl bg-tennis-dark/70 border border-fg/10 px-4 py-3 text-fg outline-none focus:border-clay"
            placeholder="Describe the event format, expectations, and anything players should know."
          />
        </label>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row sm:justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" isLoading={creatingEvent}>
          Add Event
        </Button>
      </div>
    </form>
  </Sheet>
);
