import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { CheckCircle2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { MemberSearchInput } from '../members/MemberSearchInput';
import { useAuth } from '../../context/AuthContext';
import { createAmbassadorClaim, createHostClaim, createVolunteerClaim, type ClaimType } from './claimService';

const TITLES: Record<ClaimType, string> = {
  volunteer: 'Volunteer at an Event',
  ambassador: 'Invite a Player',
  host: 'Host a Meetup',
};

// Volunteer / Host / Ambassador all submit a claim that waits in the organizer's review queue —
// clicking the task never completes it outright, points land only once approved.
export const ClaimModal: React.FC<{ type: ClaimType; onClose: () => void }> = ({ type, onClose }) => {
  const { user, profile } = useAuth();
  const name = profile?.user.name || '';

  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [eventId, setEventId] = useState('');
  const [meetupTitle, setMeetupTitle] = useState('');
  const [meetupDate, setMeetupDate] = useState('');
  const [note, setNote] = useState('');

  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (type === 'volunteer') {
      getDocs(collection(db, 'events')).then((snap) =>
        setEvents(snap.docs.map((d) => ({ id: d.id, title: (d.data().title as string) || 'Untitled event' }))
          .sort((a, b) => a.title.localeCompare(b.title))));
    }
    // The member roster is loaded by MemberSearchInput (shared, cached) — not here.
  }, [type, user?.uid]);

  const submit = async () => {
    if (!user) return;
    setError('');
    if (type === 'volunteer' && !eventId) { setError('Please select an event.'); return; }
    if (type === 'host' && !meetupTitle.trim()) { setError('Please name the meetup.'); return; }
    if (type === 'ambassador' && !selected) { setError('Please select who you invited.'); return; }

    setSubmitting(true);
    try {
      if (type === 'volunteer') {
        const ev = events.find((e) => e.id === eventId);
        await createVolunteerClaim(user.uid, name, eventId, ev?.title || '', note);
        setSuccess(true);
      } else if (type === 'host') {
        await createHostClaim(user.uid, name, meetupTitle.trim(), meetupDate, note);
        setSuccess(true);
      } else if (selected) {
        const errorMsg = await createAmbassadorClaim(user.uid, name, selected.id, selected.name);
        if (errorMsg) { setError(errorMsg); return; }
        setSuccess(true);
      }
    } catch {
      setError('Could not submit your claim. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={TITLES[type]} maxWidthClassName="max-w-md">
      <div className="p-6 pt-2 space-y-5">
        {success ? (
          <div className="text-center space-y-4 py-6">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-fg">Sent for review</h3>
              <p className="text-fg/70 text-sm">An organizer will approve it before it counts.</p>
            </div>
            <Button variant="outline" className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3">{error}</div>
            )}

            {type === 'volunteer' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-fg/70 uppercase tracking-widest">Which event?</label>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full rounded-2xl bg-tennis-surface/50 px-4 py-2.5 text-sm text-fg outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
                >
                  <option value="">Select an event…</option>
                  {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </div>
            )}

            {type === 'host' && (
              <>
                <Input label="Meetup name" value={meetupTitle} onChange={(e) => setMeetupTitle(e.target.value)} placeholder="e.g. Saturday doubles at High Park" />
                <Input label="Date" type="date" value={meetupDate} onChange={(e) => setMeetupDate(e.target.value)} />
              </>
            )}

            {/* An invite must name a real account, so no guest fallback here. */}
            {type === 'ambassador' && (
              <MemberSearchInput
                label="Who did you invite?"
                value={selected ? { name: selected.name, memberId: selected.id } : null}
                onChange={(pick) => setSelected(pick?.memberId ? { id: pick.memberId, name: pick.name } : null)}
                excludeId={user?.uid}
                hint="Only counts once they’ve played their first match."
              />
            )}

            {/* Ambassador claims have no note: createAmbassadorClaim takes no `note` argument and
                never writes the field, so the box was collecting text that went nowhere. */}
            {type !== 'ambassador' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-fg/70 uppercase tracking-widest">Note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="border border-fg/25 w-full rounded-2xl bg-tennis-surface/50 px-4 py-3 text-fg placeholder-gray-500 text-sm outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
                />
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button onClick={submit} isLoading={submitting} className="flex-1">Submit</Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};
