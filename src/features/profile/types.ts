import type { TennisEvent } from '../../types';

export type JoinedEventCard = TennisEvent & { participantId: string; dateselected?: string[] };

// The hardcoded FAVOURITE_PLAYERS seed list lived here. Suggestions now come from what members
// have actually saved, ranked by how many picked each name — see features/profile/favouritePlayers.ts.