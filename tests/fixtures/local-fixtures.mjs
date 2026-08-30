// Canonical synthetic fixtures for the local emulator, in the POST-REMODEL shape.
//
// TWO TIERS. This is the small one: a few documents per collection, chosen so that every lifecycle
// state in `docs/archive/planning-2026-08-23/notes/WORKFLOW-STATES.md` is represented exactly once. It seeds in seconds and is
// what the rules, fixture and browser tests run against. The volume tier is
// `scripts/build-sample-dataset.mjs`, which transforms the live snapshot into the same shape —
// use that when a screen needs realistic brackets, leaderboards or notification counts.
//
// SHAPE. Documents here are SPARSE, like production: a field is absent when it is unset. The full
// field list per collection lives in `shape-reference.mjs`, and `tests/unit/fixtureShape.test.mjs`
// checks these documents against it — a typo'd or retired field name fails the unit suite.
//
// Never replace these values with production exports or real member contact data. The live
// snapshot has its own pipeline, and it pseudonymises.
const currentMonthKey = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}`;
};

const fixtureMonth = currentMonthKey();
const AT = '2026-01-01T00:00:00.000Z';

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
  {
    uid: 'opponent-a',
    email: 'opponent-a@example.invalid',
    password: 'local-opponent-a-123!',
    displayName: 'Synthetic Opponent',
  },
  {
    uid: 'withdrawn-a',
    email: 'withdrawn-a@example.invalid',
    password: 'local-withdrawn-a-123!',
    displayName: 'Synthetic Withdrawer',
  },
];

/**
 * Documents in the new shape. Nothing here uses a field that the remodel retired.
 */
export const NEW_SHAPE_FIXTURES = [
  // ------------------------------------------------------------------ identity
  { path: 'users/member-a', data: { uid: 'member-a', name: 'Synthetic Member', avatar: '', created_at: AT } },
  { path: 'users/organizer-a', data: { uid: 'organizer-a', name: 'Synthetic Organizer', avatar: '', created_at: AT } },
  { path: 'users/provider-a', data: { uid: 'provider-a', name: 'Synthetic Provider', avatar: '', created_at: AT } },
  {
    path: 'users/multi-role-a',
    data: { uid: 'multi-role-a', name: 'Synthetic Multi-role User', avatar: '', created_at: AT },
  },
  {
    path: 'users/opponent-a',
    data: {
      uid: 'opponent-a',
      name: 'Synthetic Opponent',
      avatar: '',
      bio: 'Plays weeknights.',
      display_badges: ['play5'],
      created_at: AT,
    },
  },
  { path: 'users/withdrawn-a', data: { uid: 'withdrawn-a', name: 'Synthetic Withdrawer', avatar: '', created_at: AT } },

  {
    path: 'contacts/member-a',
    data: { uid: 'member-a', email: 'member-a@example.invalid', phone: '+14165550100', contactable: true },
  },
  {
    path: 'contacts/opponent-a',
    data: {
      uid: 'opponent-a',
      email: 'opponent-a@example.invalid',
      phone: '+14165550101',
      whatsapp_same_as_phone: true,
      preferred_mode_of_contact: ['whatsapp'],
      contactable: true,
    },
  },

  // stats — no `loses` (S1), no `pointswon` / `totalPointsPlayed` (L14), no `tournamentsPlayed`
  // (DC-12), no `rankPosition` (DC-11). Every one of those is derived or deleted.
  {
    path: 'stats/member-a',
    data: {
      uid: 'member-a',
      name: 'Synthetic Member',
      skill_level: 3,
      league: 'Challengers',
      leaguePoints26: 0,
      wins: 0,
      matchesPlayed: 0,
    },
  },
  {
    path: 'stats/organizer-a',
    data: {
      uid: 'organizer-a',
      name: 'Synthetic Organizer',
      skill_level: 3,
      league: 'Challengers',
      leaguePoints26: 12,
      wins: 2,
      matchesPlayed: 3,
    },
  },
  {
    path: 'stats/provider-a',
    data: {
      uid: 'provider-a',
      name: 'Synthetic Provider',
      skill_level: 3,
      league: 'Challengers',
      leaguePoints26: 6,
      wins: 1,
      matchesPlayed: 2,
    },
  },
  {
    path: 'stats/multi-role-a',
    data: {
      uid: 'multi-role-a',
      name: 'Synthetic Multi-role User',
      skill_level: 3,
      league: 'Challengers',
      leaguePoints26: 0,
      wins: 0,
      matchesPlayed: 0,
    },
  },
  {
    path: 'stats/opponent-a',
    data: {
      uid: 'opponent-a',
      name: 'Synthetic Opponent',
      skill_level: 3.5,
      league: 'Challengers',
      leaguePoints26: 34,
      wins: 6,
      matchesPlayed: 9,
      rankTrend: 'up',
      rankMove: 2,
      rankUpdatedAt: AT,
    },
  },
  {
    path: 'stats/withdrawn-a',
    data: {
      uid: 'withdrawn-a',
      name: 'Synthetic Withdrawer',
      skill_level: 3,
      league: 'Challengers',
      leaguePoints26: 4,
      wins: 1,
      matchesPlayed: 2,
    },
  },

  // preferences — public read (L9 / PD1 / R7). Role flags live in `providers`, not here.
  {
    path: 'preferences/member-a',
    data: {
      uid: 'member-a',
      preferred_courts: ['synthetic-court'],
      preferred_zone: 'Downtown - Midtown',
      // L5 — an explicit pick stops a later court edit silently re-zoning this member.
      preferred_zone_manual: true,
      available_to_play: true,
      availability_tags: ['weekday-evening'],
    },
  },
  { path: 'preferences/provider-a', data: { uid: 'provider-a', preferred_courts: [], preferred_zone: '' } },
  {
    path: 'preferences/opponent-a',
    // L16 — off shows an Away pill on challenge and rally cards.
    data: {
      uid: 'opponent-a',
      preferred_courts: ['synthetic-court'],
      preferred_zone: 'Downtown - Midtown',
      available_to_play: false,
    },
  },

  // ------------------------------------------------------- providers and services
  // R7 / PD4 — roles, never assignments. Event authority stays on `events.organizer_ids`.
  {
    path: 'providers/synthetic-stringer',
    data: {
      id: 'synthetic-stringer',
      name: 'Synthetic Stringer',
      roles: ['stringer'],
      member_uid: 'multi-role-a',
      area: 'Downtown - Midtown',
      updated_at: AT,
    },
  },
  {
    path: 'providers/archie',
    data: {
      id: 'archie',
      name: 'Synthetic Coach',
      roles: ['coach'],
      member_uid: 'provider-a',
      area: 'Downtown - Midtown',
      updated_at: AT,
    },
  },

  // N1 — the catalog. `tasks` rows with type:'offer' retire into this collection.
  {
    path: 'services/synthetic-service',
    data: {
      id: 'synthetic-service',
      category: 'stringing',
      provider_id: 'synthetic-stringer',
      provider_name: 'Synthetic Stringer',
      uid: 'multi-role-a',
      area: 'Downtown - Midtown',
      offer: 'Synthetic restring',
      brands: 'Head, MSV',
      discount: 20,
      total_price: 50,
      discounted_price: 40,
      points_cost: 15,
      active: true,
      sort: 1,
    },
  },
  {
    path: 'services/synthetic-coaching-service',
    data: {
      id: 'synthetic-coaching-service',
      category: 'coaching',
      provider_id: 'archie',
      provider_name: 'Synthetic Coach',
      uid: 'provider-a',
      area: 'Synthetic Toronto',
      offer: 'Synthetic coaching session',
      certified: true,
      discount: 0,
      total_price: 60,
      discounted_price: 60,
      points_cost: 15,
      active: true,
      sort: 2,
    },
  },

  // bookings — L11, one document per lifecycle state. `completion_requested_at` is a stamp on an
  // in_progress booking, never a fourth status; `cancelled` is reachable from `lead` only.
  {
    path: 'bookings/booking-lead',
    data: {
      id: 'booking-lead',
      service_id: 'synthetic-service',
      provider_id: 'synthetic-stringer',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      status: 'lead',
      created_at: AT,
      updated_at: AT,
    },
  },
  {
    path: 'bookings/booking-in-progress',
    data: {
      id: 'booking-in-progress',
      service_id: 'synthetic-service',
      provider_id: 'synthetic-stringer',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      status: 'in_progress',
      note: 'Blue grip, 52lb.',
      created_at: AT,
      updated_at: AT,
    },
  },
  {
    path: 'bookings/booking-awaiting-answer',
    // The stringer pressed Completed; the player has not answered "Got your racquet back?" yet.
    data: {
      id: 'booking-awaiting-answer',
      service_id: 'synthetic-service',
      provider_id: 'synthetic-stringer',
      uid: 'opponent-a',
      user_name: 'Synthetic Opponent',
      status: 'in_progress',
      completion_requested_at: '2026-01-02T00:00:00.000Z',
      created_at: AT,
      updated_at: AT,
    },
  },
  {
    path: 'bookings/booking-completed',
    data: {
      id: 'booking-completed',
      service_id: 'synthetic-service',
      provider_id: 'synthetic-stringer',
      uid: 'opponent-a',
      user_name: 'Synthetic Opponent',
      status: 'completed',
      completion_requested_at: '2026-01-02T00:00:00.000Z',
      completed_at: '2026-01-03T00:00:00.000Z',
      created_at: AT,
      updated_at: '2026-01-03T00:00:00.000Z',
    },
  },
  {
    path: 'bookings/booking-cancelled',
    data: {
      id: 'booking-cancelled',
      service_id: 'synthetic-coaching-service',
      provider_id: 'archie',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      status: 'cancelled',
      cancelled_at: '2026-01-02T00:00:00.000Z',
      created_at: AT,
      updated_at: '2026-01-02T00:00:00.000Z',
    },
  },

  // ------------------------------------------------------------- events and play
  {
    path: 'events/e2e-social',
    data: {
      id: 'e2e-social',
      title: 'Synthetic Social',
      type: 'Social',
      location: 'Synthetic Court',
      about: 'Local emulator event join fixture.',
      start_date: '2099-08-20',
      end_date: '2099-08-20',
      join_last_date: '2099-08-19',
      time: '18:00',
      creator_id: 'organizer-a',
      organizer_ids: ['organizer-a'],
      status: 'open',
      created_at: AT,
      // L8 / PD2 — the add-on block that replaces `group_lessons`. PROPOSED SHAPE: the schema is
      // not ratified (see FIRESTORE_SCHEMA_ASSESSMENT), so nothing reads this yet.
      lesson: {
        coach_provider_id: 'archie',
        coach_name: 'Synthetic Coach',
        capacity: 4,
        players: [{ uid: 'member-a', name: 'Synthetic Member', joined_at: AT }],
      },
    },
  },
  {
    path: 'events/e2e-tournament',
    data: {
      id: 'e2e-tournament',
      title: 'Synthetic Tournament',
      type: 'Tournament',
      location: 'Synthetic Court',
      about: 'Local emulator scoring fixture.',
      start_date: '2099-08-20',
      end_date: '2099-08-21',
      join_last_date: '2099-08-19',
      time: '09:00',
      creator_id: 'organizer-a',
      organizer_ids: ['organizer-a'],
      status: 'open',
      tournament_format: 'knockout',
      tournament_choice: 'Singles',
      // L17 — keyed by draw AND round. The RR group stage is deliberately absent.
      round_deadlines: { 'Challengers|SF': '2099-08-20', 'Challengers|F': '2099-08-21' },
      created_at: AT,
    },
  },
  {
    path: 'events/e2e-round-robin',
    data: {
      id: 'e2e-round-robin',
      title: 'Synthetic Round Robin',
      type: 'Tournament',
      location: 'Synthetic Court',
      about: 'Local emulator Round Robin generation and scoring fixture.',
      start_date: '2099-09-20',
      end_date: '2099-09-21',
      join_last_date: '2099-09-19',
      time: '09:00',
      creator_id: 'organizer-a',
      organizer_ids: ['organizer-a'],
      status: 'open',
      tournament_format: 'rr',
      tournament_choice: 'Singles',
      created_at: AT,
    },
  },
  {
    // L1 — the permanent ladder event, at the fixed id the remodel gives it. Challenges keep
    // `event_id` and point here.
    path: 'events/ladder',
    data: {
      id: 'ladder',
      title: 'Synthetic League Ladder',
      type: 'League Ladder',
      location: 'Synthetic Court',
      about: 'Year-round ladder.',
      creator_id: 'organizer-a',
      organizer_ids: ['organizer-a'],
      status: 'open',
      created_at: AT,
    },
  },
  {
    // Carries the participant and match states that would otherwise perturb the e2e counts on the
    // three events above.
    path: 'events/states-tournament',
    data: {
      id: 'states-tournament',
      title: 'Synthetic State Coverage',
      type: 'Tournament',
      location: 'Synthetic Court',
      about: 'One participant and one match in every lifecycle state.',
      start_date: '2099-10-01',
      end_date: '2099-10-31',
      join_last_date: '2099-09-30',
      time: '09:00',
      creator_id: 'organizer-a',
      organizer_ids: ['organizer-a'],
      status: 'open',
      tournament_format: 'rr',
      tournament_choice: 'Singles',
      zones: ['Downtown - Midtown', 'North York'],
      zone_draw_config: {
        enabled: true,
        buckets: [
          { id: 'downtown_midtown', label: 'Downtown - Midtown', zones: ['Downtown - Midtown'] },
          { id: 'north_york', label: 'North York', zones: ['North York'] },
        ],
        includeUnassigned: true,
      },
      created_at: AT,
    },
  },

  {
    path: 'events/e2e-round-robin/rr_drafts/draw-a',
    data: { draw_key: 'draw-a', event_id: 'e2e-round-robin', status: 'draft', groups: [] },
  },

  // event_participants — L12 status, L15 zone request, L18 doubles partner.
  {
    path: 'event_participants/e2e-organizer',
    data: {
      id: 'e2e-organizer',
      event_id: 'e2e-tournament',
      uid: 'organizer-a',
      user_name: 'Synthetic Organizer',
      tournament_choice: 'Singles',
      division: "Men's",
      status: 'active',
      created_at: AT,
    },
  },
  {
    path: 'event_participants/e2e-member',
    data: {
      id: 'e2e-member',
      event_id: 'e2e-tournament',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      tournament_choice: 'Singles',
      division: "Men's",
      status: 'active',
      created_at: AT,
    },
  },
  {
    path: 'event_participants/e2e-finalist',
    data: {
      id: 'e2e-finalist',
      event_id: 'e2e-tournament',
      uid: 'multi-role-a',
      user_name: 'Synthetic Multi Role',
      tournament_choice: 'Singles',
      division: "Men's",
      status: 'active',
      created_at: AT,
    },
  },
  {
    path: 'event_participants/e2e-rr-organizer',
    data: {
      id: 'e2e-rr-organizer',
      event_id: 'e2e-round-robin',
      uid: 'organizer-a',
      user_name: 'Synthetic Organizer',
      tournament_choice: 'Singles',
      division: "Men's",
      skill: 3,
      zone_override: 'downtown_midtown',
      status: 'active',
      created_at: AT,
    },
  },
  {
    path: 'event_participants/e2e-rr-member',
    data: {
      id: 'e2e-rr-member',
      event_id: 'e2e-round-robin',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      tournament_choice: 'Singles',
      division: "Men's",
      skill: 3,
      zone_override: 'downtown_midtown',
      status: 'active',
      created_at: AT,
    },
  },
  {
    path: 'event_participants/e2e-rr-multi-role',
    data: {
      id: 'e2e-rr-multi-role',
      event_id: 'e2e-round-robin',
      uid: 'multi-role-a',
      user_name: 'Synthetic Multi-role User',
      tournament_choice: 'Singles',
      division: "Men's",
      skill: 3,
      zone_override: 'downtown_midtown',
      status: 'active',
      created_at: AT,
    },
  },
  {
    // L12 — withdrawn. Stays registered, stays in Unplaced, is never auto-seated, and is re-addable.
    path: 'event_participants/states-withdrawn',
    data: {
      id: 'states-withdrawn',
      event_id: 'states-tournament',
      uid: 'withdrawn-a',
      user_name: 'Synthetic Withdrawer',
      tournament_choice: 'Singles',
      division: "Men's",
      skill: 3,
      zone: 'Downtown - Midtown',
      status: 'withdrawn',
      withdrawn_reason: 'injury',
      withdrawn_note: 'Rolled an ankle.',
      withdrawn_at: '2026-01-05T00:00:00.000Z',
      withdrawn_by: 'self',
      created_at: AT,
    },
  },
  {
    // L15 — zone change requested after generation: sits in BOTH zone draws until the organizer
    // resolves it. A zone change never unseats.
    path: 'event_participants/states-zone-change',
    data: {
      id: 'states-zone-change',
      event_id: 'states-tournament',
      uid: 'opponent-a',
      user_name: 'Synthetic Opponent',
      tournament_choice: 'Singles',
      division: "Men's",
      skill: 3.5,
      zone: 'Downtown - Midtown',
      req_zone_change: true,
      new_zone: 'North York',
      status: 'active',
      created_at: AT,
    },
  },
  {
    // L18 — registered alone for a Doubles draw. The partner pool is DERIVED (doubles participants
    // with neither partner_uid nor partner_name), not stored — see DATA_SHAPE.md, open question 4.
    path: 'event_participants/states-partner-pool',
    data: {
      id: 'states-partner-pool',
      event_id: 'states-tournament',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      tournament_choice: 'Doubles',
      division: 'Mixed Doubles',
      skill: 3,
      partner_in_app: '',
      status: 'active',
      created_at: AT,
    },
  },
  {
    // L18 — a guest partner who is not on the app: name only, no uid, so no contact access and no
    // score submission.
    path: 'event_participants/states-guest-partner',
    data: {
      id: 'states-guest-partner',
      event_id: 'states-tournament',
      uid: 'multi-role-a',
      user_name: 'Synthetic Multi-role User',
      tournament_choice: 'Doubles',
      division: 'Mixed Doubles',
      skill: 3,
      partner_in_app: 'no',
      partner_name: 'Synthetic Guest Partner',
      status: 'active',
      created_at: AT,
    },
  },

  // matches — one collection, discriminated by `category`.
  {
    path: 'matches/e2e-semifinal',
    data: {
      id: 'e2e-semifinal',
      event_id: 'e2e-tournament',
      category: 'singles',
      tournament_choice: 'Singles',
      division: "Men's",
      skill_group: 'Challengers',
      format: 'knockout',
      round: 'SF',
      drawsize: 4,
      match_id: 'M1',
      position: 0,
      next_match_id: 'M3',
      next_slot: 'player_1',
      player_1_uid: 'organizer-a',
      player_1_name: 'Synthetic Organizer',
      player_2_uid: 'member-a',
      player_2_name: 'Synthetic Member',
      status: 'pending',
    },
  },
  {
    path: 'matches/e2e-final',
    data: {
      id: 'e2e-final',
      event_id: 'e2e-tournament',
      category: 'singles',
      tournament_choice: 'Singles',
      division: "Men's",
      skill_group: 'Challengers',
      format: 'knockout',
      round: 'F',
      drawsize: 4,
      match_id: 'M3',
      position: 0,
      player_1_uid: '',
      player_1_name: '',
      player_2_uid: 'multi-role-a',
      player_2_name: 'Synthetic Multi Role',
      status: 'pending',
    },
  },
  {
    // A scored RR match carrying the amendment's submission map. `completed_at` pinned at first
    // scoring (D3); `result_at` re-stamped on the latest apply (L2).
    path: 'matches/states-rr-complete',
    data: {
      id: 'states-rr-complete',
      event_id: 'states-tournament',
      category: 'singles',
      tournament_choice: 'Singles',
      division: "Men's",
      skill_group: 'Challengers',
      zone: 'downtown_midtown',
      format: 'rr',
      round: 'RR',
      rr_group: 1,
      rr_round: 1,
      rr_group_label: 'Group A',
      match_id: 'rr_g1_m1',
      position: 0,
      player_1_uid: 'opponent-a',
      player_1_name: 'Synthetic Opponent',
      player_2_uid: 'member-a',
      player_2_name: 'Synthetic Member',
      participant_uids: ['opponent-a', 'member-a'],
      winner_uid: 'opponent-a',
      winner_name: 'Synthetic Opponent',
      set_1_player_1: 7,
      set_1_player_2: 5,
      set_2_player_1: 6,
      set_2_player_2: 4,
      status: 'complete',
      started: true,
      walkover: false,
      completed_at: '2026-01-10T18:00:00.000Z',
      result_at: '2026-01-10T18:00:00.000Z',
      // N2 — the stamp IS the receipt for the group's +5 payout. Pay only if unstamped, reverse
      // only if stamped.
      rr_groupbonus: true,
      result_submissions: {
        'opponent-a': {
          winner_uid: 'opponent-a',
          sets: [
            { player_1: 7, player_2: 5 },
            { player_1: 6, player_2: 4 },
          ],
          margin: 4,
          submitted_at: '2026-01-10T18:00:00.000Z',
          submitted_by: 'opponent-a',
          hash: 'synthetic-hash-a',
        },
      },
      created_at: AT,
    },
  },
  {
    // D6 / L10 — a walkover is all-zero scores plus a winner, tournaments only. In an RR group it
    // pays 1 point to EACH player. `walkover` is THE name (owner ruling 2026-08-28 resolving F-A);
    // `is_walkover` was renamed to it. It stays stored rather than derived, because all-zero alone
    // is ambiguous — the four ex-`no_show` rows are all-zero with no winner.
    path: 'matches/states-walkover',
    data: {
      id: 'states-walkover',
      event_id: 'states-tournament',
      category: 'singles',
      tournament_choice: 'Singles',
      division: "Men's",
      skill_group: 'Challengers',
      zone: 'downtown_midtown',
      format: 'rr',
      round: 'RR',
      rr_group: 1,
      match_id: 'rr_g1_m2',
      position: 1,
      player_1_uid: 'withdrawn-a',
      player_1_name: 'Synthetic Withdrawer',
      player_2_uid: 'member-a',
      player_2_name: 'Synthetic Member',
      winner_uid: 'member-a',
      winner_name: 'Synthetic Member',
      set_1_player_1: 0,
      set_1_player_2: 0,
      set_2_player_1: 0,
      set_2_player_2: 0,
      status: 'complete',
      started: true,
      walkover: true,
      completed_at: '2026-01-11T18:00:00.000Z',
      result_at: '2026-01-11T18:00:00.000Z',
      created_at: AT,
    },
  },
  {
    // Amendment 2026-08-23 — two submissions naming DIFFERENT winners. The first applied result
    // stays applied and stays on the card; only the flag is set, and advancement is not rolled back.
    path: 'matches/states-disputed',
    data: {
      id: 'states-disputed',
      event_id: 'states-tournament',
      category: 'singles',
      tournament_choice: 'Singles',
      division: "Men's",
      skill_group: 'Challengers',
      zone: 'downtown_midtown',
      format: 'rr',
      round: 'RR',
      rr_group: 1,
      match_id: 'rr_g1_m3',
      position: 2,
      player_1_uid: 'member-a',
      player_1_name: 'Synthetic Member',
      player_2_uid: 'opponent-a',
      player_2_name: 'Synthetic Opponent',
      winner_uid: 'member-a',
      winner_name: 'Synthetic Member',
      set_1_player_1: 6,
      set_1_player_2: 4,
      set_2_player_1: 6,
      set_2_player_2: 3,
      status: 'complete',
      started: true,
      completed_at: '2026-01-12T18:00:00.000Z',
      result_at: '2026-01-12T18:00:00.000Z',
      score_disputed: true,
      score_disputed_at: '2026-01-12T19:00:00.000Z',
      result_submissions: {
        'member-a': {
          winner_uid: 'member-a',
          sets: [
            { player_1: 6, player_2: 4 },
            { player_1: 6, player_2: 3 },
          ],
          margin: 5,
          submitted_at: '2026-01-12T18:00:00.000Z',
          submitted_by: 'member-a',
          hash: 'synthetic-hash-b',
        },
        'opponent-a': {
          winner_uid: 'opponent-a',
          sets: [
            { player_1: 4, player_2: 6 },
            { player_1: 3, player_2: 6 },
          ],
          margin: 5,
          submitted_at: '2026-01-12T19:00:00.000Z',
          submitted_by: 'opponent-a',
          hash: 'synthetic-hash-c',
        },
      },
      created_at: AT,
    },
  },
  {
    // L1 / D2 — a ladder challenge keeps `event_id` and points at the permanent ladder event.
    path: 'matches/states-challenge',
    data: {
      id: 'states-challenge',
      event_id: 'ladder',
      category: 'challenge',
      player_1_uid: 'member-a',
      player_1_name: 'Synthetic Member',
      player_2_uid: 'opponent-a',
      player_2_name: 'Synthetic Opponent',
      challenger_name: 'Synthetic Member',
      opponent_name: 'Synthetic Opponent',
      league: 'Challengers',
      status: 'accepted',
      responded_at: '2026-01-08T12:00:00.000Z',
      created_at: AT,
    },
  },
  {
    // A friendly. `requested_by` records WHO asked to schedule; no date or time is stored (WDR 3).
    path: 'matches/states-rally',
    data: {
      id: 'states-rally',
      category: 'rally',
      player_1_uid: 'member-a',
      player_1_name: 'Synthetic Member',
      player_2_uid: 'opponent-a',
      player_2_name: 'Synthetic Opponent',
      from_name: 'Synthetic Member',
      to_name: 'Synthetic Opponent',
      status: 'open',
      requested_by: 'member-a',
      created_at: AT,
    },
  },

  { path: 'ranking_history/opponent-a/entries/2026-01-08', data: { date: '2026-01-08', position: 4, direction: 'up' } },

  // ------------------------------------------------------------ activity and rewards
  {
    path: 'courts/synthetic-court',
    data: {
      id: 'synthetic-court',
      type: 'check-in',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      court_key: 'synthetic-court',
      court_name: 'Synthetic Court',
      zone: 'Downtown - Midtown',
      status: 'open',
      created_at: AT,
    },
  },
  {
    path: 'courts/synthetic-condition-report',
    data: {
      id: 'synthetic-condition-report',
      type: 'condition',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      court_key: 'synthetic-court',
      court_name: 'Synthetic Court',
      note: 'Net is sagging on court 2.',
      status: 'pending',
      created_at: AT,
    },
  },

  // tasks — PROGRESS documents only. Catalog rows are `services` (N1); award rows are `awards` (PD10).
  { path: 'tasks/member-a', data: { uid: 'member-a', name: 'Synthetic Member', profileComplete: true, updatedAt: AT } },
  {
    path: 'tasks/opponent-a',
    data: {
      uid: 'opponent-a',
      name: 'Synthetic Opponent',
      profileComplete: true,
      playMatch: true,
      play5: true,
      matchesPlayed: 9,
      currentStreak: 2,
      bestStreak: 4,
      bonusPoints: 5,
      bonusAwards: ['matchday_2026-01'],
      updatedAt: AT,
    },
  },

  {
    path: 'task_claims/e2e-pending-claim',
    data: {
      id: 'e2e-pending-claim',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      type: 'volunteer',
      event_title: 'Synthetic Social',
      status: 'pending',
      created_at: AT,
    },
  },
  // Deterministic id — a repeat ambassador claim is a no-op, and it auto-approves.
  {
    path: 'task_claims/ambassador_opponent-a',
    data: {
      id: 'ambassador_opponent-a',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      type: 'ambassador',
      status: 'approved',
      created_at: AT,
      reviewed_at: AT,
    },
  },

  // PD10 — one document per award, carrying the winners' receipt.
  {
    path: 'awards/matchday_2026-01',
    data: {
      id: 'matchday_2026-01',
      award_id: 'matchday_2026-01',
      sub_category: 'matchday',
      award_name: 'Matchday',
      points_each: 5,
      winners: [{ uid: 'opponent-a', name: 'Synthetic Opponent' }],
      created_at: AT,
      paid_at: AT,
    },
  },

  // L9 / PD1 — only points SPENT is stored; balances are derived at read.
  { path: 'offers/member-a', data: { uid: 'member-a', pointsSpent: 15, updated_at: AT } },

  {
    path: 'redemptions/SYNTHETIC-001',
    data: {
      code: 'SYNTHETIC-001',
      reward_id: 'synthetic-service',
      provider_id: 'synthetic-stringer',
      provider_name: 'Synthetic Stringer',
      offer: 'Synthetic restring',
      points_cost: 15,
      discounted_price: 40,
      uid: 'member-a',
      user_name: 'Synthetic Member',
      status: 'active',
      created_at: AT,
    },
  },
  {
    path: 'redemptions/SYNTHETIC-002',
    data: {
      code: 'SYNTHETIC-002',
      reward_id: 'synthetic-coaching-service',
      provider_id: 'archie',
      provider_name: 'Synthetic Coach',
      offer: 'Synthetic coaching session',
      points_cost: 15,
      discounted_price: 60,
      uid: 'opponent-a',
      user_name: 'Synthetic Opponent',
      status: 'used',
      created_at: AT,
      used_at: '2026-01-04T00:00:00.000Z',
      used_by: 'provider-a',
    },
  },

  // ----------------------------------------------------------- access and projections
  {
    path: 'listings/listing-a',
    data: {
      id: 'listing-a',
      uid: 'member-a',
      user_name: 'Synthetic Member',
      kind: 'sell',
      status: 'available',
      title: 'Synthetic racquet',
      price: 120,
      created_at: AT,
    },
  },
  {
    path: 'public_contacts/member-a',
    data: { uid: 'member-a', reason: 'listing', email: 'member-a@example.invalid', updated_at: AT },
  },
  // Deterministic sorted pair id — `pairId` must stay byte-identical in connections.js and the rules.
  {
    path: 'connections/member-a__opponent-a',
    data: { uids: ['member-a', 'opponent-a'], reason: 'tournament_match', created_at: AT },
  },

  {
    path: 'notifications/notification-a',
    data: {
      id: 'notification-a',
      uid: 'member-a',
      type: 'synthetic',
      title: 'Synthetic notification',
      read: false,
      created_at: AT,
    },
  },
  {
    path: 'notifications/notification-result',
    data: {
      id: 'notification-result',
      uid: 'member-a',
      type: 'result_recorded',
      title: 'Score recorded',
      body: 'Score recorded — 7-5 6-4 v. Synthetic Opponent',
      link: '/matches?mode=tournament&event=states-tournament',
      match_id: 'states-rr-complete',
      event_id: 'states-tournament',
      read: true,
      read_at: AT,
      created_at: AT,
    },
  },

  {
    path: 'mailing_list/signup-a',
    data: {
      id: 'signup-a',
      email: 'signup-a@example.invalid',
      name: 'Synthetic Signup',
      source: 'landing',
      created_at: AT,
    },
  },
  { path: 'site_stats/summary', data: { id: 'summary', activePlayers: 6, matchesOrganized: 7, updated_at: AT } },
  {
    path: 'admin_stats/dashboard',
    data: {
      id: 'dashboard',
      headline: 'Synthetic dashboard',
      generated_at: AT,
      metrics: { signups_7d: 1, matches_7d: 3, open_disputes: 1 },
    },
  },
];

/**
 * RETIRING DOCUMENTS, KEPT ONLY BECAUSE LIVE CODE STILL READS THEM.
 *
 * Every entry here is scheduled for deletion by a ruling that has not yet shipped. They are
 * quarantined rather than mixed into the set above so the debt is countable, and so the day the
 * cutover lands the fix is deleting one array.
 *
 * | document                              | retires under | what breaks if removed today                      |
 * | ------------------------------------- | ------------- | ------------------------------------------------- |
 * | preferences/organizer-a.event_creator | PD6 / S6      | firestore.rules isGlobalEventCreator() — the e2e   |
 * |                                       |               | "organizer creates an owned event" test            |
 * | group_lessons/{month}                 | L8 / PD2      | e2e "group lesson coach can contact an enrolled    |
 * | group_lesson_contact_access/current   | L8 / PD2      | player"; the contacts rule's coach predicate       |
 * | tasks/synthetic-coaching-offer        | N1            | the same e2e test — the marketplace reads the      |
 * | tasks/synthetic-offer                 | N1            | catalog from `tasks`, not yet from `services`      |
 */
export const LEGACY_COMPAT_FIXTURES = [
  {
    path: 'preferences/organizer-a',
    data: { uid: 'organizer-a', preferred_courts: [], preferred_zone: '', event_creator: true },
  },
  {
    path: 'preferences/multi-role-a',
    data: {
      uid: 'multi-role-a',
      preferred_courts: [],
      preferred_zone: '',
      event_creator: true,
      stringer: true,
      stringer_id: 'synthetic-stringer',
    },
  },
  {
    path: 'tasks/synthetic-offer',
    data: {
      type: 'offer',
      provider_id: 'synthetic-stringer',
      provider_name: 'Synthetic Stringer',
      offer: 'Synthetic restring',
      active: true,
      points_cost: 15,
    },
  },
  {
    path: 'tasks/synthetic-coaching-offer',
    data: {
      type: 'offer',
      category: 'coaching',
      provider_id: 'archie',
      provider_name: 'Synthetic Coach',
      uid: 'provider-a',
      area: 'Synthetic Toronto',
      offer: 'Synthetic coaching session',
      active: true,
      points_cost: 15,
    },
  },
  {
    path: `group_lessons/${fixtureMonth}`,
    data: {
      month: fixtureMonth,
      coach_id: 'archie',
      coach_name: 'Synthetic Coach',
      capacity: 4,
      players: [{ uid: 'member-a', name: 'Synthetic Member', joined_at: AT }],
    },
  },
  {
    path: 'group_lesson_contact_access/current',
    data: {
      month: fixtureMonth,
      coach_id: 'archie',
      player_ids: ['member-a'],
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      updated_at: AT,
    },
  },
];

export const LOCAL_FIXTURES = [...NEW_SHAPE_FIXTURES, ...LEGACY_COMPAT_FIXTURES];
