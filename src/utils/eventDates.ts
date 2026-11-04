import { TennisEvent } from '../types';
import { isCancelledEvent, isLadderEvent, isTournamentEvent } from './eventTypes';

export type FirestoreDateLike = string | { toDate?: () => Date; seconds?: number; nanoseconds?: number } | null | undefined;

/** Any stored time (Timestamp, {seconds}, Date, ISO string) as a Date, or null. */
export const toDate = (value: FirestoreDateLike | Date | number): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  return parseValidDate(value);
};

/** Any stored time as epoch millis (0 when absent) — for sorting and comparing. */
export const toMillis = (value: FirestoreDateLike | Date | number): number => toDate(value)?.getTime() ?? 0;

export const getEventStartDate = (event: TennisEvent): FirestoreDateLike => event.start_date;

export const getEventEndDate = (event: TennisEvent): FirestoreDateLike => event.end_date || event.start_date;

export const parseValidDate = (value?: FirestoreDateLike) => {
  if (!value) return null;
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const parsed = value.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value.seconds === 'number') {
      const parsed = new Date(value.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }
  // Plain "YYYY-MM-DD" (from <input type="date">) parses as UTC midnight, which rolls back a
  // day once formatted in a timezone behind UTC (e.g. Toronto) — parse those as local instead.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const parsed = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * The instant an event actually stops being current.
 *
 * A date-only "YYYY-MM-DD" end names a whole day, so parsing it to midnight retires the event a
 * full day early — an event ending today vanished at 00:00 today. Stretch it to end-of-day.
 */
export const parseEndInstant = (value?: FirestoreDateLike) => {
  const parsed = parseValidDate(value);
  if (parsed && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed;
};

/**
 * Is this event still current — i.e. upcoming OR under way right now?
 *
 * Shared by the Events page (`useEvents`) and the homepage strip so there is exactly one copy.
 * Do NOT re-implement it with `new Date(str)`: a plain "YYYY-MM-DD" parses as UTC midnight, which
 * in Toronto is 8pm the previous evening, so events vanished most of a day early. parseEndInstant
 * reads a date-only value as local AND stretches it to end-of-day, which is what makes a
 * single-day fixture survive the day it runs on.
 *
 * An event is current until it ENDS. It used to retire at its START unless it was a tournament or
 * a ladder, which hid every meetup and social the moment it began — the one time people most want
 * to see it. Ending is now the only thing that retires anything.
 *
 * With no end date recorded: a tournament or ladder stays listed, because it runs for weeks and
 * guessing an end from its start would hide a live draw after day one; anything else is treated as
 * a single-day fixture that finishes at the end of its own day.
 */
/**
 * How long a tournament keeps showing past its end date when nothing has marked it complete.
 *
 * This is a LONG STOP, not the real rule. `completed_at` is the real rule. The window covers two
 * cases: events that finished before the server job existed, and draws that were abandoned so
 * their final was never played. Without it an unfinished tournament would sit on the homepage
 * forever, and with it the worst case is one that lingers a month.
 */
const STALE_TOURNAMENT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export const isCurrentEvent = (event: TennisEvent, now = Date.now()) => {
  // Server-stamped when the event's LAST final is played (recordScore in functions/lib/scoring.js), and authoritative
  // when present. `matches` needs auth to read, so a signed-out visitor cannot work this out for
  // itself — which is the whole reason the answer is written onto the world-readable event doc.
  if (event.completed_at || isCancelledEvent(event)) return false;

  const endMs = parseEndInstant(getEventEndDate(event))?.getTime() ?? null;

  // A tournament or a ladder is over when its final is played, not on a date somebody typed in
  // weeks earlier. It keeps its place in the list while matches are still outstanding.
  if (isTournamentEvent(event) || isLadderEvent(event)) {
    return endMs === null || now <= endMs + STALE_TOURNAMENT_GRACE_MS;
  }

  // A social or meetup has no matches to finish, so its date IS the end of it. getEventEndDate
  // falls back to the start date, and parseEndInstant stretches a date-only value to end-of-day,
  // which is what keeps a one-day fixture listed for the whole day it runs on.
  return endMs === null || endMs >= now;
};

/**
 * Latest end date FIRST. The homepage strip uses this rather than the start-date sort.
 *
 * Running longest leads, which puts season-long fixtures at the front and pushes anything that has
 * just finished — still listed by the grace window in `isCurrentEvent` — to the back. Sorting the
 * other way led with events that had already ended, which is a poor first thing to show.
 *
 * An undated event scores zero rather than infinity, so "no end date" sorts last here instead of
 * jumping to the front.
 */
export const sortEventsByEndDate = <T extends TennisEvent>(events: T[]) => {
  const endOf = (e: T) => parseEndInstant(getEventEndDate(e))?.getTime() ?? 0;
  return [...events].sort((a, b) => endOf(b) - endOf(a));
};

export const sortEventsByStartDate = <T extends TennisEvent>(events: T[]) => {
  const now = Date.now();
  return [...events].sort((a, b) => {
    const aTime = parseValidDate(getEventStartDate(a))?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = parseValidDate(getEventStartDate(b))?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const safeATime = Number.isNaN(aTime) ? Number.MAX_SAFE_INTEGER : aTime;
    const safeBTime = Number.isNaN(bTime) ? Number.MAX_SAFE_INTEGER : bTime;
    const aStarted = safeATime < now;
    const bStarted = safeBTime < now;
    if (aStarted !== bStarted) return aStarted ? 1 : -1;
    return safeATime - safeBTime;
  });
};
