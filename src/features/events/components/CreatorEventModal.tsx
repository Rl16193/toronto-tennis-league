import React from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../../../components/Button';
import { ModalShell } from '../../../components/ModalShell';
import {
  EVENT_SKILL_OPTIONS,
  EVENT_TYPE_OPTIONS,
  EventFormState,
} from '../services/eventService';

type FormMessage = { type: 'success' | 'error'; text: string } | null;

type Props = {
  eventForm: EventFormState;
  setEventForm: (eventForm: EventFormState) => void;
  eventImageFile: File | null;
  eventFormMessage: FormMessage;
  creatingEvent: boolean;
  organizerPlaceholder: string;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

export const CreatorEventModal: React.FC<Props> = ({
  eventForm,
  setEventForm,
  eventImageFile,
  eventFormMessage,
  creatingEvent,
  organizerPlaceholder,
  onImageChange,
  onSubmit,
  onClose,
}) => (
  <ModalShell maxWidthClassName="max-w-4xl" onClose={onClose}>
    <form onSubmit={onSubmit} className="p-6 md:p-8">
      <div className="mb-6 pr-12">
        <p className="text-xs uppercase tracking-widest text-clay font-black mb-2">Creator</p>
        <h2 className="text-3xl font-display font-black text-white">Add an Event</h2>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">Title <span className="text-orange-500">*</span></span>
          <input
            value={eventForm.title}
            onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
            placeholder="Spring Ladder Tournament"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">Type <span className="text-orange-500">*</span></span>
          <select
            value={eventForm.type}
            onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
          >
            {EVENT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">Location</span>
          <input
            value={eventForm.location}
            onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
            placeholder="High Park"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">Organizer <span className="text-orange-500">*</span></span>
          <input
            value={eventForm.organizer}
            onChange={(e) => setEventForm({ ...eventForm, organizer: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
            placeholder={organizerPlaceholder}
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">Start Date <span className="text-orange-500">*</span></span>
          <input
            type="date"
            value={eventForm.startDate}
            onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">End Date <span className="text-orange-500">*</span></span>
          <input
            type="date"
            value={eventForm.endDate}
            onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">Join Last Date</span>
          <input
            type="date"
            value={eventForm.joinLastDate}
            onChange={(e) => setEventForm({ ...eventForm, joinLastDate: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">Time</span>
          <input
            value={eventForm.time}
            onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
            placeholder="10:00 AM - 2:00 PM"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">Skill Level</span>
          <select
            value={eventForm.skillLevel}
            onChange={(e) => setEventForm({ ...eventForm, skillLevel: e.target.value })}
            className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
          >
            {EVENT_SKILL_OPTIONS.map((skill) => (
              <option key={skill} value={skill}>{skill}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="block text-sm font-medium text-white">Image</span>
          <div className="rounded-2xl border border-dashed border-white/20 bg-tennis-dark/60 px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <Upload className="w-5 h-5 text-clay" />
              <span className="text-sm font-semibold truncate">{eventImageFile?.name || 'Upload event image'}</span>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg,image/webp,image/gif,image/heic,image/heif"
              onChange={onImageChange}
              className="mt-3 block w-full text-sm text-white file:mr-4 file:rounded-xl file:border-0 file:bg-clay file:px-4 file:py-2 file:font-semibold file:text-white"
            />
          </div>
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="block text-sm font-medium text-white">About <span className="text-orange-500">*</span></span>
          <textarea
            value={eventForm.about}
            onChange={(e) => setEventForm({ ...eventForm, about: e.target.value })}
            className="min-h-32 w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
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
  </ModalShell>
);
