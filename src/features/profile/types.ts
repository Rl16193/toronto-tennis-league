import type { UserProfile, TennisEvent, EventParticipant } from '../../types';

export type JoinedEventCard = TennisEvent & { participantId: string };

export type ProfileEditData = Partial<UserProfile> & {
  customCourtInput?: string;
  customFavouritePlayerInput?: string;
};