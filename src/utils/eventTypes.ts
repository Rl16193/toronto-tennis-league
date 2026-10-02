import { TennisEvent, UserProfile } from '../types';

/** The app owner. Mirrors SUPER_ADMIN_UID in functions/lib/constants.js and isSuperAdmin() in firestore.rules. */
export const SUPER_ADMIN_UID = '7PvfzNtDmsOq5GLMieId7QRT7wH3';

/**
 * Whether this account manages this event: the super admin or anyone in its organizer_ids.
 * Same rule as isEventManager() in firestore.rules and isOrganizer() in functions/lib/roles.js.
 */
export const isEventManager = (event: Pick<TennisEvent, 'organizer_ids'> | null | undefined, uid: string | undefined) =>
  !!uid && !!event && (uid === SUPER_ADMIN_UID || !!event.organizer_ids?.includes(uid));

/** An organizer (may create events, sees the Organizer Dash): the super admin or the organizer role. */
export const isOrganizerProfile = (profile: Pick<UserProfile, 'id' | 'roles'> | null | undefined) =>
  !!profile && (profile.id === SUPER_ADMIN_UID || profile.roles.includes('organizer'));

/** A stringer or coach; their provider id is their uid. */
export const isProviderProfile = (profile: Pick<UserProfile, 'roles'> | null | undefined) =>
  !!profile && (profile.roles.includes('stringer') || profile.roles.includes('coach'));

/** A weekly meetup (the card shows its next occurrence); a special is one-off. */
export const isRecurringWeekly = (event: Pick<TennisEvent, 'sub_category'>) => event.sub_category === 'meetup';

/** A cancelled event is hidden from every list and never current. */
export const isCancelledEvent = (event: { status?: string } | null | undefined) => event?.status === 'cancelled';

export const isTournamentEvent = (event: Pick<TennisEvent, 'category'>) => /_tournament$/.test(event.category || '');

export const isDoublesEvent = (event: Pick<TennisEvent, 'category'>) => event.category === 'doubles_tournament';

export const isLadderEvent = (event: Pick<TennisEvent, 'category'>) => event.category === 'ladder';

// Events page split: tournaments and the ladder count as "Tournaments"; socials and coaching
// clinics as "Socials". Takes a raw category so it works for lighter list rows too.
export const isTournamentCategoryType = (category: string) => /_tournament$/.test(category) || category === 'ladder';

export const isTournamentCategoryEvent = (event: Pick<TennisEvent, 'category'>) => isTournamentCategoryType(event.category);

export const isSeasonOpener = (event: TennisEvent) => event.title.toLowerCase().includes('season opener 2026');

export const isWeekendMatchdaysEvent = (event: TennisEvent) => event.title.toLowerCase().includes('weekend matchdays');

export const isTopspinMeetupEvent = (event: TennisEvent) => {
  const title = event.title.toLowerCase();
  return title.includes('topspin tuesdays') || title.includes('topspin thursdays');
};
