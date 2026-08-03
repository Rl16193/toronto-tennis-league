import { TennisEvent } from '../types';

export const isRecurringWeekly = (event: TennisEvent) =>
  event.recurring_weekly === true || event.recurring === true || event.recurring === 'Yes';

export const isTournamentEvent = (event: TennisEvent) => event.type.toLowerCase().includes('tournament');

export const isLadderEvent = (event: TennisEvent) => event.type.toLowerCase().includes('league ladder');

// Events page category split: Tournament/League Ladder/League Event count as "Tournaments";
// everything else (Meetup, Special Event, Social) is "Socials". Takes a raw type string so it
// works for both full TennisEvent objects and lighter list rows that only carry `type`.
export const isTournamentCategoryType = (type: string) => {
  const t = type.toLowerCase();
  return t.includes('tournament') || t.includes('league ladder') || t.includes('league event');
};

export const isTournamentCategoryEvent = (event: TennisEvent) => isTournamentCategoryType(event.type);

export const isSeasonOpener = (event: TennisEvent) => event.title.toLowerCase().includes('season opener 2026');

export const isWeekendMatchdaysEvent = (event: TennisEvent) => event.title.toLowerCase().includes('weekend matchdays');

export const isTopspinMeetupEvent = (event: TennisEvent) => {
  const title = event.title.toLowerCase();
  return title.includes('topspin tuesdays') || title.includes('topspin thursdays');
};
