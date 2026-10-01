import type { EventCategory } from '../../types';

export type JoinFormState = {
  division: '' | "Men's" | "Women's" | 'Mixed Doubles';
  // Singles only: opt into the age-based Retired Pro (55+) division instead of skill routing.
  seniors: boolean;
  partnerName: string;
  /** The picked member's uid; '' for a partner not on the app, or no partner (the partner pool). */
  partnerUid: string;
  combinedSkill: string;
};

/** One of the member's ACTIVE registrations. */
export type JoinedRegistration = {
  eventId: string;
  category: EventCategory;
};

export type SlotResult = {
  status: 'available' | 'fallback' | 'full';
  skillOverride: number;
  intendedGroup?: string;
  actualGroup?: string;
};

export const INITIAL_JOIN_FORM: JoinFormState = {
  division: '',
  seniors: false,
  partnerName: '',
  partnerUid: '',
  combinedSkill: '',
};
