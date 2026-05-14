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
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateLabel = (value?: FirestoreDateLike) => {
  const parsed = parseValidDate(value);
  if (!parsed) return 'Date TBD';
  return parsed.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const sortEventsByStartDate = <T extends TennisEvent>(events: T[]) =>
  [...events].sort((a, b) => {
    const aTime = parseValidDate(getEventStartDate(a))?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = parseValidDate(getEventStartDate(b))?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const safeATime = Number.isNaN(aTime) ? Number.MAX_SAFE_INTEGER : aTime;
    const safeBTime = Number.isNaN(bTime) ? Number.MAX_SAFE_INTEGER : bTime;
    return safeATime - safeBTime;
  });
