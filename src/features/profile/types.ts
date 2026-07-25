import type { TennisEvent } from '../../types';

export type JoinedEventCard = TennisEvent & { participantId: string; dateselected?: string[] };