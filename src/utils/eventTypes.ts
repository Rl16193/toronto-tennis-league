import { TennisEvent } from '../types';

/** The app owner. Mirrors SUPER_ADMIN_UID in functions/lib/constants.js and isSuperAdmin() in firestore.rules. */
export const SUPER_ADMIN_UID = '7PvfzNtDmsOq5GLMieId7QRT7wH3';

/**
 * Whether this account manages this event: the super admin, its creator or its organizer_ids.
 * Same rule as isCreatorOfEvent() in firestore.rules and isOrganizer() in functions/lib/roles.js.
 */
export const isEventManager = (event: Pick<TennisEvent, 'creator_id' | 'organizer_ids'> | null | undefined, uid: string | undefined) =>
  !!uid && !!event && (uid === SUPER_ADMIN_UID || event.creator_id === uid || !!event.organizer_ids?.includes(uid));

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
