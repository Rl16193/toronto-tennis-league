import { TennisEvent } from '../../../types';
import { isMeetupEvent, isRecurringWeekly, isSpecialEvent } from '../../../utils/eventTypes';
import { getEventEndDate, getEventStartDate, parseValidDate } from '../../../utils/eventDates';

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const getEventDays = (event: TennisEvent): number[] => {
  const raw = event.day;
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/,|&|and|\//i).map((p) => p.trim()).filter(Boolean)
      : [];
  return parts.map((d) => WEEKDAY_MAP[d.toLowerCase()]).filter((d): d is number => d !== undefined);
};

export const formatEventSchedule = (event: TennisEvent): string | null => {
  const days = getEventDays(event);
  const dayLabel = days.length > 0 ? days.map((d) => DAY_LABELS[d]).join(', ') : null;
  if (isRecurringWeekly(event) && dayLabel && event.time) return `Every ${dayLabel} • ${event.time}`;
  if (isRecurringWeekly(event) && dayLabel) return `Every ${dayLabel}`;
  return event.time || null;
};

export const formatTournamentRange = (event: TennisEvent): string | null => {
  const start = parseValidDate(getEventStartDate(event));
  const end = parseValidDate(getEventEndDate(event));
  if (!start || !end) return null;
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${fmt(start)} - ${fmt(end)}`;
};

export const getRecurringEventLabel = (event: TennisEvent): string | null => {
  if (!isRecurringWeekly(event)) return null;
  if (isMeetupEvent(event)) return 'Weekly Skill-Based Meetups';
  if (isSpecialEvent(event)) return 'Play Tourney Matches on Selected Matchdays';
  return null;
};
