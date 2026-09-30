import React, { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, ChevronRight, Gift } from 'lucide-react';
import { motion } from 'motion/react';
import { useContacts } from '../features/contacts/useContacts';
import { ContactOpponentButton } from '../components/ContactOpponentButton';
import { fadeUp, staggerDelay, tapScale } from '../lib/motion';
import { AppNotification, timeAgo, useNotifications } from '../features/notifications/useNotifications';
import { MIN_REWARD_COST, useRedeemablePoints } from '../features/services/useServices';
import { useTasks } from '../features/tasks/useTasks';

// Full-screen notifications feed (replaces the old bell dropdown). Opening the page marks
// everything read, matching the dropdown's old behavior; tapping an item deep-links to it.
export const Notifications: React.FC = () => {
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const { balance: redeemable } = useRedeemablePoints(useTasks());
  const claimableRewards = Math.floor(Math.max(0, redeemable) / MIN_REWARD_COST);
  const navigate = useNavigate();

  useEffect(() => { document.title = 'Notifications · Racquets & Strings'; }, []);

  useEffect(() => {
    if (!loading && unreadCount > 0) markAllRead();
  }, [loading, unreadCount, markAllRead]);

  const openItem = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
    if (n.link) navigate(n.link);
  };

  // Contact details for anyone a notification names as the counterpart — the person who asked to
  // arrange a match. Reading `contacts` needs a connection, so a denial is the normal case for
  // someone you aren't matched with, never an error: each read carries its own catch so one
  // refusal can't reject the batch and blank out everybody else's buttons.
  const counterpartIds = useMemo(
    () => [...new Set(items.map((n) => n.counterpart_uid).filter((id): id is string => !!id))],
    [items],
  );
  const contactMap = useContacts(counterpartIds);

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      <div className="flex items-center gap-2 mb-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-xl text-fg/70 hover:text-fg hover:bg-fg/5 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Bell className="w-5 h-5 text-clay" />
        <h1 className="sr-only">Notifications</h1>
      </div>

      {/* Pinned, not a stored notification. It's derived from the current balance, so it can't
          go stale, can't fire again on every point earned, and needs no Cloud Function writing
          a doc per member. Only shown once there's enough to actually spend. */}
      {claimableRewards > 0 && (
        <motion.div {...fadeUp} className="mb-3">
          <Link
            to="/marketplace"
            className="flex items-center gap-3 rounded-2xl bg-clay/[0.08] px-4 py-3 hover:bg-clay/[0.12] transition-colors"
          >
            <Gift className="w-5 h-5 text-clay shrink-0" />
            <p className="min-w-0 flex-1 text-sm font-bold text-fg">
              You have collected {redeemable} Points. {claimableRewards} Reward{claimableRewards === 1 ? '' : 's'} available.
            </p>
            <ChevronRight className="w-4 h-4 text-clay shrink-0" />
          </Link>
        </motion.div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : items.length === 0 && claimableRewards === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 py-16 text-center">
          <Bell className="w-8 h-8 text-fg/70 mx-auto mb-3" />
          <p className="text-sm text-fg/70">Nothing yet. Match updates and task news land here.</p>
        </div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 overflow-hidden divide-y divide-fg/5">
          {items.map((n, i) => {
            const contact = n.counterpart_uid ? contactMap[n.counterpart_uid] : undefined;
            return (
              // A div, not a button: the contact pills are anchors, and an anchor inside a button
              // is invalid HTML whose click would also open the notification instead of dialling.
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
                className={n.read ? '' : 'bg-clay/[0.07]'}
              >
                <motion.button
                  type="button"
                  onClick={() => openItem(n)}
                  whileTap={tapScale.whileTap}
                  className="w-full text-left px-4 py-3.5 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-clay shrink-0" />}
                    <div className={`min-w-0 flex-1 ${n.read ? 'pl-3.5' : ''}`}>
                      <p className="text-sm font-semibold text-fg leading-snug">{n.title}</p>
                      {n.body && <p className="text-xs text-fg/70 mt-0.5 leading-snug">{n.body}</p>}
                      <p className="text-[10px] text-fg/70 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </motion.button>
                {contact && (
                  <div className={`px-4 pb-3 ${n.read ? 'pl-[1.875rem]' : 'pl-[1.875rem]'}`}>
                    <ContactOpponentButton
                      name={n.counterpart_name || 'Your opponent'}
                      phone={contact.phone}
                      email={contact.email}
                      whatsappContact={contact.whatsapp_contact}
                      preferred={contact.preferred_mode_of_contact}
                    />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
