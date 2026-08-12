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
  isEditing?: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

// Compact field chrome: smaller labels, tighter inputs, and short fields paired two-across so
// the whole form fits in roughly one phone screen instead of eleven stacked full-width rows.
const fieldCls =
  'w-full rounded-xl bg-tennis-dark/70 px-3.5 py-2.5 text-sm text-fg ' +
  'placeholder-fg/30 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20';
const labelCls = 'block text-[11px] font-bold uppercase tracking-widest text-fg/70 mb-1.5';
const req = <span className="text-clay">*</span>;

const Toggle: React.FC<{
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ label, options, value, onChange }) => (
  <div>
    <span className={labelCls}>{label}</span>
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
            value === o.value
              ? 'bg-clay text-white border-clay'
              : 'bg-tennis-dark/70 text-fg/70 border-fg/10 hover:border-fg/30'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

export const CreatorEventModal: React.FC<Props> = ({
  eventForm,
  setEventForm,
  eventFormMessage,
  creatingEvent,
  organizerPlaceholder,
  isEditing,
  onSubmit,
  onClose,
}) => {
  const set = (patch: Partial<EventFormState>) => setEventForm({ ...eventForm, ...patch });
  const isTournament = eventForm.type === 'Tournament';

  return (
    <Sheet maxWidthClassName="max-w-md" onClose={onClose} title={isEditing ? 'Edit Event' : 'Add an Event'}>
      <form onSubmit={onSubmit} className="p-5 pt-2 space-y-3.5">
        {eventFormMessage && (
          <div className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
            eventFormMessage.type === 'success'
              ? 'border-green-500/20 bg-green-500/10 text-green-300'
              : 'border-red-500/20 bg-red-500/10 text-red-300'
          }`}>
            {eventFormMessage.text}
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="ev-title">Title {req}</label>
          <input id="ev-title" value={eventForm.title} onChange={(e) => set({ title: e.target.value })}
            className={fieldCls} placeholder="Spring Ladder Tournament" />
        </div>

        {/* Type and Skill are both short selects — pairing them saves a row. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-type">Type {req}</label>
            <select id="ev-type" value={eventForm.type} onChange={(e) => set({ type: e.target.value })} className={fieldCls}>
              {EVENT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-skill">Skill level</label>
            <select id="ev-skill" value={eventForm.skillLevel} onChange={(e) => set({ skillLevel: e.target.value })} className={fieldCls}>
              {EVENT_SKILL_OPTIONS.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-loc">Location</label>
            <input id="ev-loc" value={eventForm.location} onChange={(e) => set({ location: e.target.value })}
              className={fieldCls} placeholder="High Park" />
          </div>
        </div>

        {/* The three dates sit together — a native date input is narrow enough to pair. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-start">Start date {req}</label>
            <input id="ev-start" type="date" value={eventForm.startDate}
              onChange={(e) => set({ startDate: e.target.value })} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-end">End date {req}</label>
            <input id="ev-end" type="date" value={eventForm.endDate}
              onChange={(e) => set({ endDate: e.target.value })} className={fieldCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ev-join">Join by</label>
            <input id="ev-join" type="date" value={eventForm.joinLastDate}
              onChange={(e) => set({ joinLastDate: e.target.value })} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-time">Time</label>
            <input id="ev-time" value={eventForm.time} onChange={(e) => set({ time: e.target.value })}
              className={fieldCls} placeholder="10:00 AM - 2:00 PM" />
          </div>
        </div>

        {isTournament && (
          <div className="grid grid-cols-2 gap-3">
            <Toggle
              label="Format"
              options={[{ value: 'knockout', label: 'Knockout' }, { value: 'rr', label: 'Round Robin' }]}
              value={eventForm.tournamentFormat}
              onChange={(v) => set({ tournamentFormat: v as EventFormState['tournamentFormat'] })}
            />
            <Toggle
              label="Participants"
              options={[{ value: 'Singles', label: 'Singles' }, { value: 'Doubles', label: 'Doubles' }]}
              value={eventForm.tournamentChoice}
              onChange={(v) => set({ tournamentChoice: v as EventFormState['tournamentChoice'] })}
            />
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="ev-about">About {req}</label>
          <textarea id="ev-about" value={eventForm.about} onChange={(e) => set({ about: e.target.value })}
            rows={3} className={fieldCls}
            placeholder="Format, expectations, and anything players should know." />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="clay" isLoading={creatingEvent} className="flex-1">{isEditing ? 'Save' : 'Add Event'}</Button>
        </div>
      </form>
    </Sheet>
  );
};
