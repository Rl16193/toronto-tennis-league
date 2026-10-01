import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ContactData } from '../../types';
import { useContacts } from '../../features/contacts/useContacts';
import {
  type BookingRow, type BookingStage, OPEN_BOOKING_STATUSES, bookingStage, isGroupLesson,
  useProviderBookings, useProviderOffers, useProviderRole,
} from '../../features/services/useServices';
import { toMillis } from '../../utils/eventDates';
import {
  declineBooking, finishBooking, lessonGroup, serviceErrorMessage, startBooking,
} from '../../features/services/servicesApi';
import { formatPlayerName } from '../tournament/utils';

// Data for the Provider Dash on /profile: the signed-in stringer's or coach's bookings, offers and
// counts. Profile mounts it for everyone (it comes back empty for non-providers) because the switch
// shows a count. Every step is a callable in functions/bookings.js. Presentation lives in
// ProviderDashElements.tsx.

export type ProviderJob = {
  booking: BookingRow;
  stage: BookingStage;
  member: { uid: string; name: string };
  contact?: ContactData;
};

/** One group lesson offer: who is waiting to be grouped, and each group the coach has made. */
export type LessonRow = {
  serviceId: string;
  offer: string;
  price: number;
  capacity: number;
  waiting: ProviderJob[];
  groups: { n: number; members: ProviderJob[] }[];
};

export type ServiceShare = {
  id: string;
  offer: string;
  count: number;
  price: number;
  points: number;
  brands: string;
};

export function useProviderDash() {
  const { profile } = useAuth();
  const { providerId, role } = useProviderRole();
  const { bookings, loading } = useProviderBookings(providerId);
  const offers = useProviderOffers(providerId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  // Contacts only for open jobs, where the provider has someone to reach. Booking created the
  // connection that allows the read; useContacts catches each denial on its own.
  const contacts = useContacts(
    bookings.filter((b) => OPEN_BOOKING_STATUSES.includes(b.status)).map((b) => b.uid),
  );

  const jobs: ProviderJob[] = useMemo(() => bookings.map((b) => ({
    booking: b,
    stage: bookingStage(b),
    member: { uid: b.uid, name: formatPlayerName(b.user_name) || 'A member' },
    contact: contacts[b.uid],
  })), [bookings, contacts]);

  // Open group lesson bookings leave the one-row-per-booking list: they show under their offer,
  // as the players waiting to be grouped and each group (functions/bookings.js lessonGroup).
  const inLesson = (j: ProviderJob) => isGroupLesson(j.booking)
    && (j.stage === 'new' || j.stage === 'in_progress' || j.stage === 'confirming');
  const lessons: LessonRow[] = [...new Set(jobs.filter(inLesson).map((j) => j.booking.service_id))].map((id) => {
    const open = jobs.filter((j) => inLesson(j) && j.booking.service_id === id);
    const o = offers.find((x) => x.id === id);
    const numbers = [...new Set(open.map((j) => j.booking.lesson_group).filter((n): n is number => !!n))].sort((a, b) => a - b);
    return {
      serviceId: id,
      offer: o?.offer || open[0].booking.offer,
      price: o?.total_price ?? open[0].booking.price,
      capacity: o?.capacity || 0,
      waiting: open.filter((j) => j.stage === 'new'),
      groups: numbers.map((n) => ({ n, members: open.filter((j) => j.stage !== 'new' && j.booking.lesson_group === n) })),
    };
  });

  // New requests first, then work in progress, oldest first so the longest wait is on top.
  const needsYou = jobs
    .filter((j) => !inLesson(j) && (j.stage === 'new' || j.stage === 'in_progress'))
    .sort((a, b) => Number(a.stage !== 'new') - Number(b.stage !== 'new')
      || toMillis(a.booking.created_at) - toMillis(b.booking.created_at));
  const waiting = jobs.filter((j) => !inLesson(j) && j.stage === 'confirming');
  const closed = jobs
    .filter((j) => j.stage === 'completed' || j.stage === 'cancelled')
    .sort((a, b) => toMillis(b.booking.updated_at) - toMillis(a.booking.updated_at));

  const completed = bookings.filter((b) => b.status === 'completed');
  const stats = {
    players: new Set(bookings.map((b) => b.uid)).size,
    total: bookings.length,
    fresh: jobs.filter((j) => j.stage === 'new').length,
    inProgress: jobs.filter((j) => j.stage === 'in_progress').length,
    open: needsYou.length + waiting.length,
    completed: completed.length,
    earned: completed.reduce((n, b) => n + (b.price || 0), 0),
    pointsBurned: completed.reduce((n, b) => n + (b.points || 0), 0),
  };

  // Active offers, plus any retired offer that still has bookings against it.
  const services: ServiceShare[] = offers
    .map((o) => ({
      id: o.id,
      offer: o.offer,
      count: bookings.filter((b) => b.service_id === o.id).length,
      price: o.total_price,
      points: o.points_cost,
      brands: o.brands || '',
      active: o.active !== false,
    }))
    .filter((s) => s.active || s.count > 0)
    .map(({ active: _active, ...s }) => s);

  const first = offers[0];
  const identity = providerId
    ? {
      name: first?.provider_name || bookings[0]?.providerName || formatPlayerName(profile?.user.name || ''),
      category: role === 'coach' ? 'coaching' as const : 'stringing' as const,
      area: first?.area || '',
      // Their own number (contacts/{uid}); offers carry no contact details.
      phone: profile?.contacts.phone || '',
      manager: formatPlayerName(profile?.user.name || ''),
      active: offers.some((o) => o.active !== false),
    }
    : null;

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setRowError(null);
    try { await fn(); } catch (err) { setRowError({ id, text: serviceErrorMessage(err) }); } finally { setBusyId(null); }
  };

  return {
    providerId,
    identity,
    loading,
    needsYou,
    waiting,
    lessons,
    closed,
    stats,
    services,
    /** The switch count: new requests and work in progress, group lessons included. */
    count: jobs.filter((j) => j.stage === 'new' || j.stage === 'in_progress').length,
    busyId,
    rowError,
    start: (id: string) => run(id, () => startBooking({ bookingId: id })),
    decline: (id: string) => run(id, () => declineBooking({ bookingId: id })),
    finish: (id: string) => run(id, () => finishBooking({ bookingId: id })),
    /** Busy and error rows are keyed `serviceId:group`, 0 for the players waiting to be grouped. */
    lessonGroup: (serviceId: string, action: 'create' | 'add' | 'remove' | 'done' | 'cancel', group = 0, bookingIds?: string[]) =>
      run(`${serviceId}:${group}`, () => lessonGroup({ action, serviceId, group: group || undefined, bookingIds })),
  };
}
