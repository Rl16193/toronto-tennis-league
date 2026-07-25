import { TennisEvent } from '../types';

export const isRecurringWeekly = (event: TennisEvent) =>
  event.recurring_weekly === true || event.recurring === true || event.recurring === 'Yes';

export const isTournamentEvent = (event: TennisEvent) => event.type.toLowerCase().includes('tournament');

export const isLadderEvent = (event: TennisEvent) => event.type.toLowerCase().includes('league ladder');

export const isSeasonOpener = (event: TennisEvent) => event.title.toLowerCase().includes('season opener 2026');

export const isWeekendMatchdaysEvent = (event: TennisEvent) => event.title.toLowerCase().includes('weekend matchdays');

export const isTopspinMeetupEvent = (event: TennisEvent) => {
  const title = event.title.toLowerCase();
  return title.includes('topspin tuesdays') || title.includes('topspin thursdays');
};
