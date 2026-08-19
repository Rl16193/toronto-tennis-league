// Synthetic-only Firestore fixtures for local emulator smoke tests.
// Never replace these values with production exports or real member contact data.
export const LOCAL_AUTH_FIXTURES = [
  {
    uid: 'member-a',
    email: 'member-a@example.invalid',
    password: 'local-member-a-123!',
    displayName: 'Synthetic Member',
  },
  {
    uid: 'organizer-a',
    email: 'organizer-a@example.invalid',
    password: 'local-organizer-a-123!',
    displayName: 'Synthetic Organizer',
  },
  {
    uid: 'provider-a',
    email: 'provider-a@example.invalid',
    password: 'local-provider-a-123!',
    displayName: 'Synthetic Provider',
  },
  {
    uid: 'multi-role-a',
    email: 'multi-role-a@example.invalid',
    password: 'local-multi-role-a-123!',
    displayName: 'Synthetic Multi-role User',
  },
];

export const LOCAL_FIXTURES = [
  {
    path: 'users/member-a',
    data: { uid: 'member-a', name: 'Synthetic Member', avatar: '', created_at: '2026-01-01T00:00:00.000Z' },
  },
  {
    path: 'users/organizer-a',
    data: { uid: 'organizer-a', name: 'Synthetic Organizer', avatar: '', created_at: '2026-01-01T00:00:00.000Z' },
  },
  {
    path: 'users/provider-a',
    data: { uid: 'provider-a', name: 'Synthetic Provider', avatar: '', created_at: '2026-01-01T00:00:00.000Z' },
  },
  {
    path: 'users/multi-role-a',
    data: {
      uid: 'multi-role-a',
      name: 'Synthetic Multi-role User',
      avatar: '',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  },
  {
    path: 'stats/member-a',
    data: {
      uid: 'member-a',
      name: 'Synthetic Member',
      leaguePoints26: 0,
      wins: 0,
      loses: 0,
      matchesPlayed: 0,
      tournamentsPlayed: 0,
    },
  },
  {
    path: 'stats/organizer-a',
    data: {
      uid: 'organizer-a',
      name: 'Synthetic Organizer',
      leaguePoints26: 12,
      wins: 2,
      loses: 1,
      matchesPlayed: 3,
      tournamentsPlayed: 1,
    },
  },
  {
    path: 'stats/provider-a',
    data: {
      uid: 'provider-a',
      name: 'Synthetic Provider',
      leaguePoints26: 6,
      wins: 1,
      loses: 1,
      matchesPlayed: 2,
      tournamentsPlayed: 0,
    },
  },
  {
    path: 'preferences/member-a',
    data: { uid: 'member-a', event_creator: false, preferred_courts: ['synthetic-court'], preferred_zone: 'north' },
  },
  {
    path: 'preferences/organizer-a',
    data: { uid: 'organizer-a', event_creator: true, preferred_courts: [], preferred_zone: '' },
  },
  {
    path: 'preferences/provider-a',
    data: { uid: 'provider-a', event_creator: false, stringer: true, stringer_id: 'synthetic-stringer' },
  },
  {
    path: 'preferences/multi-role-a',
    data: { uid: 'multi-role-a', event_creator: true, stringer: true, stringer_id: 'synthetic-stringer' },
  },
  {
    path: 'contacts/member-a',
    data: { uid: 'member-a', email: 'member-a@example.invalid', phone: '+14165550100', contactable: true },
  },
  {
    path: 'events/synthetic-event',
    data: {
      id: 'synthetic-event',
      name: 'Synthetic Summer Ladder',
      creator_id: 'organizer-a',
      status: 'open',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  },
  {
    path: 'events/synthetic-event/rr_drafts/draw-a',
    data: { draw_key: 'draw-a', event_id: 'synthetic-event', status: 'draft', groups: [] },
  },
  {
    path: 'event_participants/participant-a',
    data: {
      id: 'participant-a',
      event_id: 'synthetic-event',
      uid: 'member-a',
      created_at: '2026-01-01T00:00:00.000Z',
      doubles: false,
    },
  },
  {
    path: 'matches/match-a',
    data: {
      id: 'match-a',
      event_id: 'synthetic-event',
      category: 'singles',
      tournament_choice: 'Singles',
      player_1_uid: 'member-a',
      player_2_uid: 'organizer-a',
      status: 'pending',
    },
  },
  {
    path: 'tasks/member-a',
    data: { uid: 'member-a', name: 'Synthetic Member', profileComplete: true, updatedAt: '2026-01-01T00:00:00.000Z' },
  },
  {
    path: 'tasks/synthetic-offer',
    data: {
      type: 'offer',
      provider_id: 'synthetic-stringer',
      provider_name: 'Synthetic Stringer',
      offer: 'Synthetic restring',
      active: true,
      points_cost: 10,
    },
  },
  { path: 'offers/member-a', data: { uid: 'member-a', pointsSpent: 0, balance: 12 } },
  {
    path: 'redemptions/SYNTHETIC-001',
    data: {
      uid: 'member-a',
      stringer_id: 'synthetic-stringer',
      stringer_name: 'Synthetic Stringer',
      status: 'active',
      offer: 'Synthetic restring',
    },
  },
  {
    path: 'listings/listing-a',
    data: { id: 'listing-a', uid: 'member-a', kind: 'sell', status: 'available', title: 'Synthetic racquet' },
  },
  {
    path: 'notifications/notification-a',
    data: { uid: 'member-a', type: 'synthetic', title: 'Synthetic notification', read: false },
  },
  {
    path: 'courts/synthetic-court',
    data: { id: 'synthetic-court', type: 'court', name: 'Synthetic Court', status: 'open' },
  },
  { path: 'site_stats/summary', data: { players: 4, events: 1, synthetic: true } },
  { path: 'admin_stats/dashboard', data: { headline: 'Synthetic dashboard', synthetic: true } },
];
