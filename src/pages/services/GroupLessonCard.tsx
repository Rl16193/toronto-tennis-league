import React, { useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/Button';
import { ContactOpponentButton } from '../tournament/ContactOpponentButton';
import {
  GROUP_LESSON_CAPACITY, useGroupLesson, useProviderRole,
} from '../../features/services/useServices';
import {
  joinGroupLesson, leaveGroupLesson, serviceErrorMessage,
} from '../../features/services/servicesApi';
import { useContacts } from '../../features/contacts/useContacts';

const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
};

/**
 * The free monthly group lesson — 2-4 players, no points. Laid out like the round-robin group
 * cards: a header with the roster count, and an expandable player list.
 *
 * Spots reset on the 1st because the roster lives in a per-month document, so a new month is
 * simply a doc that doesn't exist yet. The coach who owns this offer sees names and gets a
 * Contact button per player; everyone else sees names only.
 */
export const GroupLessonCard: React.FC = () => {
  const { user } = useAuth();
  const { month, players, joined, loading } = useGroupLesson();
  const { role } = useProviderRole();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isCoach = role === 'coach';
  const spotsLeft = Math.max(0, GROUP_LESSON_CAPACITY - players.length);
  const full = spotsLeft === 0;

  // Only the coach needs these, and only once the roster is expanded.
  const rosterIds = isCoach && open ? players.map((p) => p.uid) : [];
  const rosterContacts = useContacts(rosterIds);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(serviceErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl bg-clay/[0.06] border border-clay/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg leading-snug">30 min group lesson</p>
          <p className="text-[11px] text-fg/70 mt-0.5">
            Free · 2–4 players · {monthLabel(month)}
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-clay border border-clay/45 rounded-full px-2 py-0.5">
          Free
        </span>
      </div>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      <div className="flex items-center justify-between gap-2.5 mt-3.5 pt-3 border-t border-clay/20">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-fg/70 hover:text-fg transition-colors"
          aria-expanded={open}
        >
          <Users className="w-3.5 h-3.5" />
          {loading ? '—' : `${players.length}/${GROUP_LESSON_CAPACITY} joined`}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* The coach runs the session, so they get the roster rather than a Join button. */}
        {!isCoach && (
          joined ? (
            <Button size="sm" variant="outline" onClick={() => act(() => leaveGroupLesson({}))} isLoading={busy}>
              Leave
            </Button>
          ) : (
            <Button
              size="sm"
              variant="clay"
              disabled={full || !user || busy}
              isLoading={busy}
              onClick={() => act(() => joinGroupLesson({}))}
            >
              {full ? 'Full' : !user ? 'Log in to join' : 'Join'}
            </Button>
          )
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-clay/20 space-y-1.5">
              {players.length === 0 ? (
                <p className="text-xs text-fg/70">
                  No one has joined yet. All {GROUP_LESSON_CAPACITY} spots are open.
                </p>
              ) : (
                players.map((p) => (
                  <div key={p.uid} className="flex items-center gap-2 min-h-[32px]">
                    <span className="min-w-0 flex-1 text-sm text-fg truncate">
                      {p.name || 'Player'}
                      {user?.uid === p.uid && <span className="ml-1 text-clay text-[10px]">(you)</span>}
                    </span>
                    {/* Contact details are resolved live from `contacts/{uid}` rather than being
                        snapshotted onto the roster — group_lessons is world-readable, so storing
                        them there exposed every player's phone and email to signed-out visitors. */}
                    {isCoach && (
                      <ContactOpponentButton
                        name={p.name || 'Player'}
                        phone={rosterContacts[p.uid]?.phone}
                        email={rosterContacts[p.uid]?.email}
                        whatsappContact={rosterContacts[p.uid]?.whatsapp_contact}
                        whatsappSameAsPhone={rosterContacts[p.uid]?.whatsapp_same_as_phone}
                        size="sm"
                        variant="white"
                      />
                    )}
                  </div>
                ))
              )}
              {!full && players.length > 0 && (
                <p className="text-[11px] text-fg/70 pt-1">
                  {spotsLeft} spot{spotsLeft === 1 ? '' : 's'} left this month.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
