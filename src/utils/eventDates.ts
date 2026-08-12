import { TennisEvent } from '../types';

export type FirestoreDateLike = string | { toDate?: () => Date; seconds?: number; nanoseconds?: number } | undefined;

export const getEventStartDate = (event: TennisEvent): FirestoreDateLike =>
  event.startDate || event.start_date || event.date;

export const getEventEndDate = (event: TennisEvent): FirestoreDateLike =>
  event.endDate || event.end_date || event.startDate || event.start_date || event.date;

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
