// The post-remodel data shape, one uniform document per surviving collection.
//
// PURPOSE. `local-fixtures.mjs` holds SPARSE documents that look like production — fields absent
// when unset. This file holds the opposite: one UNIFORM document per collection carrying EVERY
// field in the new shape, each with a type-correct synthetic value. Together they answer two
// different questions. The sparse set asks "does the code survive a real document?"; this set
// asks "is every field in the contract still spelled the way the contract says?".
//
// `tests/unit/fixtureShape.test.mjs` enforces the pair: every key used by a sparse fixture must
// be declared here, and no retired key may appear in either. `scripts/build-sample-dataset.mjs`
// transforms the live export into this shape and validates its output against it.
//
// AUTHORITY. Field rulings cite `docs/archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md` (D/L/N/S/R),
// `docs/archive/planning-2026-08-23/notes/DECISIONS_BRIEF.md` (PD), and the delta table in `docs/archive/planning-2026-08-23/notes/WORKFLOW-STATES.md`
// section 0. The prose contract lives in `docs/architecture/DATA_SHAPE.md`.
//
// SYNTHETIC ONLY. Every value below is invented. Never paste a production export into this file —
// the live snapshot under `analysis/` carries real member names, emails and phone numbers.

/**
 * Milestone tier ids from `src/features/tasks/taskCatalog.ts`. A completed tier is stored as
 * `true` under its id on the member's `tasks` document, so the tier id set is part of the shape
 * even though `TaskProgress` types it as an open index signature.
 */
export const TASK_TIER_IDS = [
  'tournament',
  'play5',
  'play10',
  'play20',
  'play30',
  'play50',
  'ladder',
  'chal1',
  'chal5',
  'chal10',
  'chal20',
  'win5',
  'win10',
  'win20',
  'streaks',
  'streak3',
  'streak5',
  'streak10',
  'streak20',
  'seasonRegular',
  'months3',
  'months6',
  'months12',
  'courtCare',
  'sugg5',
  'sugg10',
  'traveler',
  'visit1',
  'visit5',
  'visit10',
  'visit20',
  'visitZone',
  'courtInfo',
  'board1',
  'board5',
  'board10',
  'board20',
  'liveUpdates',
  'queue10',
  'queue25',
  'queue50',
  'queue100',
  'volunteering',
  'vol1',
  'vol5',
  'vol10',
  'vol20',
  'ambassador',
  'invite1',
  'invite3',
  'invite10',
  'host',
  'host1',
  'host5',
  'host10',
  'matchday',
  'hourlyCoverage',
  'courtPioneer',
  'boardFreshness',
  'zoneSweep',
];

/** The seven Toronto zones, mirroring `src/utils/zones.ts`. */
export const ZONES = [
  'York West',
  'Etobicoke',
  'Etobicoke - Lakeshore',
  'North York',
  'Downtown - Midtown',
  'North Scarborough',
  'East York and South Scarborough',
];

export const SHAPE_REFERENCE = {
  // ---------------------------------------------------------------- identity

  // users — public profile. Contact details live in `contacts` and never here.
  users: {
    uid: 'shape-user',
    name: 'Shape Reference User',
    avatar: 'avatars/shape-user/avatar.png',
    bio: 'Synthetic profile used as the shape reference.',
    display_badges: ['play5', 'visit1', 'streak3'],
    age_bracket: '35-44',
    isVerified: true,
    welcomeEmailSent: true,
    lastActive: '2026-08-20T18:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
  },

  // contacts — private. Readable by the owner, a connection holder, and (Sprint D2 onward) the
  // organizer of an event the member signed up to. Super-admin read removed by L13.
  contacts: {
    uid: 'shape-user',
    email: 'shape-user@example.invalid',
    secondary_email: 'shape-user.alt@example.invalid',
    phone: '+14165550100',
    whatsapp_contact: '+14165550101',
    whatsapp_same_as_phone: false,
    preferred_mode_of_contact: ['email', 'text', 'whatsapp'],
    contactable: true,
    updated_at: '2026-08-20T18:00:00.000Z',
  },

  // stats — server-authoritative. `loses` (S1), `pointswon` / `totalPointsPlayed` (L14),
  // `tournamentsPlayed` (DC-12) and `rankPosition` (DC-11) are derived or deleted, never stored.
  stats: {
    uid: 'shape-user',
    name: 'Shape Reference User',
    skill_level: 3.5,
    tournament_preference: 'Challengers',
    league: 'Challengers',
    matchesPlayed: 8,
    wins: 5,
    leaguePoints26: 46,
    leaguePoints25: 18,
    rankTrend: 'up',
    rankMove: 2,
    rankUpdatedAt: '2026-08-18T04:00:00.000Z',
  },

  // preferences — public read (L9 / PD1 / R7). Role and provider flags moved out to `providers`.
  preferences: {
    uid: 'shape-user',
    preferred_courts: ['Ramsden Park', 'Trinity Bellwoods'],
    custom_courts: ['The court behind the community centre'],
    favourite_players: ['shape-opponent'],
    scheduling_preference: 'I will schedule matches on my own',
    preferred_zone: 'Downtown - Midtown',
    preferred_zone_manual: true,
    available_to_play: true,
    email_notifications: true,
    availability_tags: ['weekday-evening', 'weekend-morning'],
  },

  // ------------------------------------------------------ providers and services

  // providers — NEW (R7 / PD4). Server-issued identity and roles. Roles, never assignments:
  // event authority stays on `events.organizer_ids` (L4). Bootstrap is Admin-SDK only (PD5).
  providers: {
    id: 'shape-provider',
    name: 'Shape Reference Stringing',
    roles: ['stringer', 'coach', 'other'],
    member_uid: 'shape-provider-user',
    area: 'Downtown - Midtown',
    updated_at: '2026-08-01T12:00:00.000Z',
  },

  // services — NEW (N1). The catalog; `tasks` rows with `type: 'offer'` retire into it. Doc ids
  // must stay stable: issued coupons store them in `redemptions.reward_id`.
  services: {
    id: 'shape-service',
    category: 'stringing',
    provider_id: 'shape-provider',
    provider_name: 'Shape Reference Stringing',
    uid: 'shape-provider-user',
    contact_phone: '+14165550110',
    contact_email: 'shape-provider@example.invalid',
    area: 'Downtown - Midtown',
    offer: 'Full restring, synthetic gut',
    brands: 'Head, Kirschbaum, MSV',
    discount: 20,
    total_price: 50,
    discounted_price: 40,
    points_cost: 15,
    certified: true,
    active: true,
    sort: 1,
  },

  // bookings — NEW (L11). lead -> in_progress -> completed, plus cancelled from lead only.
  // `completion_requested_at` is a STAMP set while the player answers "Got your racquet back?",
  // never a fourth status. `flagged` and `cancel_requested` are gone.
  bookings: {
    id: 'shape-booking',
    service_id: 'shape-service',
    provider_id: 'shape-provider',
    uid: 'shape-user',
    user_name: 'Shape Reference User',
    status: 'completed',
    note: 'Blue grip, 52lb.',
    created_at: '2026-08-10T15:00:00.000Z',
    updated_at: '2026-08-14T19:00:00.000Z',
    completion_requested_at: '2026-08-14T18:00:00.000Z',
    completed_at: '2026-08-14T19:00:00.000Z',
    cancelled_at: null,
  },

  // -------------------------------------------------------- events and play

  // events — L4 organizer_ids, L7 zones + zone_draw_config, L17 deadlines keyed by draw AND round
  // with the RR group stage excluded, L8 lesson add-on block replacing `group_lessons`.
  events: {
    id: 'shape-event',
    title: 'Shape Reference Open',
    type: 'Tournament',
    location: 'Ramsden Park',
    about: 'Synthetic event used as the shape reference.',
    image: 'events/shape-event/cover.png',
    organizer: 'Shape Reference Organizer',
    organizer_ids: ['shape-organizer'],
    creator_id: 'shape-organizer',
    start_date: '2026-09-05',
    end_date: '2026-09-27',
    join_last_date: '2026-09-01',
    time: '09:00',
    day: 'Saturday',
    recurring: false,
    skill_level: '3.0 - 4.0',
    status: 'open',
    tournament_format: 'rr',
    tournament_choice: 'Singles',
    hide_seniors: false,
    hide_beginners: false,
    zones: ['Downtown - Midtown', 'North York'],
    zone_draw_config: {
      enabled: true,
      buckets: [
        { id: 'downtown_midtown', label: 'Downtown - Midtown', zones: ['Downtown - Midtown'] },
        { id: 'north_york', label: 'North York', zones: ['North York'] },
      ],
      includeUnassigned: true,
      reallocatedAt: '2026-08-25T12:00:00.000Z',
      merges: { north_york: 'downtown_midtown' },
    },
    // Keyed by draw and round. The RR GROUP stage is deliberately absent (L17) — it runs the
    // season. RR knockout rounds carry deadlines like any other knockout round.
    round_deadlines: {
      'downtown_midtown|Challengers|SF': '2026-09-20',
      'downtown_midtown|Challengers|F': '2026-09-27',
    },
    // L8 / PD2 — PROPOSED, NOT RATIFIED. `group_lessons` retires into an add-on block on a social
    // event, but FIRESTORE_SCHEMA_ASSESSMENT records that the block has no agreed schema. This is
    // the minimum that carries what the retired collection carried. Needs owner sign-off before
    // any code reads it.
    lesson: {
      coach_provider_id: 'shape-provider',
      coach_name: 'Shape Reference Coach',
      capacity: 4,
      players: [{ uid: 'shape-user', name: 'Shape Reference User', joined_at: '2026-08-12T14:00:00.000Z' }],
    },
    created_at: '2026-08-01T12:00:00.000Z',
  },

  // events/{eventId}/rr_drafts/{drawKey} — organizer draft state, read by draw generation.
  // The live `withdrawn` array is gone: L12 replaces it with `event_participants.status`.
  rr_drafts: {
    draw_key: 'downtown_midtown|Challengers',
    event_id: 'shape-event',
    status: 'draft',
    groups: [{ label: 'Group A', player_uids: ['shape-user', 'shape-opponent'] }],
    labels: { 1: 'Group A' },
    custom: false,
    updated_at: '2026-08-26T12:00:00.000Z',
  },

  // event_participants — L12 one `status` replacing the `removal` flag and the RR withdrawn list,
  // L15 per-event zone plus the kept req_zone_change / new_zone pair, L18 doubles partner.
  event_participants: {
    id: 'shape-participant',
    event_id: 'shape-event',
    event_name: 'Shape Reference Open',
    uid: 'shape-user',
    user_name: 'Shape Reference User',
    tournament_choice: 'Singles',
    division: "Men's",
    skill: 3.5,
    skill_group: 'Retired Pro',
    doubles: false,
    partner_in_app: 'yes',
    partner_uid: 'shape-partner',
    partner_name: 'Shape Reference Partner',
    dateselected: ['2026-09-05', '2026-09-12'],
    zone: 'Downtown - Midtown',
    zone_override: 'Downtown - Midtown',
    req_zone_change: true,
    new_zone: 'North York',
    merged_zone: true,
    merged_into: 'downtown_midtown',
    status: 'withdrawn',
    withdrawn_reason: 'injury',
    withdrawn_note: 'Rolled an ankle, out for the season.',
    withdrawn_at: '2026-09-10T16:00:00.000Z',
    withdrawn_by: 'self',
    created_at: '2026-08-15T10:00:00.000Z',
  },

  // matches — one collection, discriminated by `category`: tournament fixtures, ladder challenges,
  // friendlies. L2 result_at, N2 rr_groupbonus, and the 2026-08-23 amendment's result_submissions
  // map plus score_disputed flag. `no_show` and `score_pending` are gone.
  matches: {
    id: 'shape-match',
    event_id: 'shape-event',
    category: 'singles',
    tournament_choice: 'Singles',
    division: "Men's",
    skill_group: 'Challengers',
    zone: 'downtown_midtown',
    bracket: null,
    format: 'rr',
    drawsize: 8,
    match_id: 'M1',
    round: 'RR',
    position: 0,
    player_1_slot: 1,
    player_2_slot: 2,
    player_1_uid: 'shape-user',
    player_1_name: 'Shape Reference User',
    player_2_uid: 'shape-opponent',
    player_2_name: 'Shape Reference Opponent',
    participant_uids: ['shape-user', 'shape-opponent'],
    winner_uid: 'shape-user',
    winner_name: 'Shape Reference User',
    set_1_player_1: 7,
    set_1_player_2: 5,
    set_2_player_1: 6,
    set_2_player_2: 4,
    set_3_player_1: 0,
    set_3_player_2: 0,
    status: 'complete',
    started: true,
    walkover: false,
    // Set only when the walkover came from a withdrawal rather than an organizer entry. Written by
    // functions/withdrawalWorkflow.js:60 — it postdates the 2026-08-17 snapshot, so the live export
    // never carried it and the transform could not discover it.
    withdrawal_walkover: false,
    court: 'Ramsden Park',
    league: 'Challengers',
    // D3 — `completed_at` pins at first scoring and is never rewritten; `result_at` re-stamps on
    // every apply (L2).
    completed_at: '2026-09-12T18:30:00.000Z',
    result_at: '2026-09-13T09:00:00.000Z',
    score_edited_at: '2026-09-13T09:00:00.000Z',
    // Amendment 2026-08-23 — map keyed by submitter uid, carrying the idempotency hash that L3
    // originally placed in `score_pending`.
    result_submissions: {
      'shape-user': {
        winner_uid: 'shape-user',
        sets: [
          { player_1: 7, player_2: 5 },
          { player_1: 6, player_2: 4 },
        ],
        margin: 4,
        submitted_at: '2026-09-12T18:30:00.000Z',
        submitted_by: 'shape-user',
        hash: 'shape-hash-first',
      },
    },
    // Still written by `functions/tournamentResults.js` alongside result_submissions, contra L3.
    // Recorded as a deviation (finding F-G), not smoothed over.
    result_application: { hash: 'shape-hash-first', applied_at: '2026-09-12T18:30:00.000Z' },
    score_disputed: false,
    score_disputed_at: null,
    rr_group: 1,
    rr_round: 1,
    rr_group_label: 'Group A',
    rr_label_custom: false,
    rr_advancement_count: 2,
    rr_groupbonus: true,
    rr_winner_pts_v2: true,
    next_match_id: 'M5',
    next_slot: 'player_1',
    // Challenge and rally fields — same collection, different `category`.
    challenger_name: 'Shape Reference User',
    opponent_name: 'Shape Reference Opponent',
    from_name: 'Shape Reference User',
    to_name: 'Shape Reference Opponent',
    responded_at: '2026-09-06T12:00:00.000Z',
    reported_by: 'shape-user',
    reported_at: '2026-09-12T18:30:00.000Z',
    confirmed_at: '2026-09-12T19:00:00.000Z',
    confirmed_by: 'shape-opponent',
    applied: true,
    // WDR section 3 stores no dates or times. `requested_by` records WHO asked, which the retired
    // `schedule_requested` boolean never did (S5 — no backfill, pending requests expire).
    requested_by: 'shape-opponent',
    created_at: '2026-09-01T12:00:00.000Z',
  },

  // ranking_history/{uid}/entries/{entryId} — append-only snapshots, server-written.
  ranking_history_entries: {
    date: '2026-08-18',
    position: 12,
    direction: 'up',
  },

  // ------------------------------------------------------ activity and rewards

  // courts — append-only activity, discriminated by `type`:
  // check-in | attendance | condition | waiting_board | queue | court_suggestion.
  courts: {
    id: 'shape-court-report',
    type: 'condition',
    uid: 'shape-user',
    user_name: 'Shape Reference User',
    court_key: 'ramsden-park',
    court_name: 'Ramsden Park',
    court: 'Ramsden Park',
    note: 'Net is sagging on court 2.',
    description: 'Reported by a member during a check-in.',
    status: 'pending',
    lat: 43.6761,
    lng: -79.3902,
    zone: 'Downtown - Midtown',
    dist_m: 120,
    visit_type: 'play',
    match_type: 'singles',
    day: 'Saturday',
    types: ['condition'],
    photo_path: 'court_reports/shape-user/net.png',
    photo_paths: ['court_reports/shape-user/net.png'],
    photos_meta: [{ path: 'court_reports/shape-user/net.png', width: 1024, height: 768 }],
    file_name: 'net.png',
    file_type: 'image/png',
    file_size: 240144,
    file_last_modified: '2026-08-16T14:00:00.000Z',
    exif_present: true,
    exif_camera: 'Synthetic Camera',
    exif_taken_at: '2026-08-16T13:58:00.000Z',
    exif_gps_lat: 43.6761,
    exif_gps_lng: -79.3902,
    racquets_in_queue: 4,
    racquet_bucket: '3-5',
    wait_estimate: 25,
    waiting_boards: ['board-1'],
    reviewed_at: '2026-08-17T09:00:00.000Z',
    email: 'shape-user@example.invalid',
    created_at: '2026-08-16T14:00:00.000Z',
  },

  // tasks — per-uid PROGRESS documents only. The catalog rows (`type: 'offer'`) move to `services`
  // (N1) and the award ledger rows move to `awards` (PD10). Public read (PD1).
  tasks: {
    uid: 'shape-user',
    name: 'Shape Reference User',
    category: 'progress',
    profileComplete: true,
    profilePhoto: true,
    followSocial: true,
    tagPost: true,
    whatsappGroup: true,
    joinEvent: true,
    playMatch: true,
    ladderMatch: true,
    courtVisit: true,
    courtSuggestion: true,
    waitingBoard: true,
    queuePhoto: true,
    setupComplete: true,
    visitedAllCourts: false,
    matchesPlayed: 8,
    challengesPlayed: 4,
    challengesWon: 2,
    climbSpots: 3,
    courtsVisited: 5,
    zoneComplete: 1,
    boardPhotos: 4,
    queueUpdates: 12,
    suggestions: 2,
    volunteerEvents: 1,
    invites: 3,
    meetups: 1,
    monthsActive: 6,
    active_months: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
    currentStreak: 3,
    bestStreak: 5,
    // Milestone tiers are stored as `true` under their catalogue id (see `taskCatalog.ts`).
    play5: true,
    chal1: true,
    streak3: true,
    months3: true,
    visit1: true,
    board1: true,
    bonusPoints: 15,
    bonusAwards: ['matchday_2026-08'],
    updatedAt: '2026-08-20T18:00:00.000Z',
  },

  // task_claims — volunteer / host / ambassador. Ambassador ids stay deterministic so a repeat
  // claim is a no-op; volunteer and host get deterministic ids in Sprint D5.
  task_claims: {
    id: 'ambassador_shape-invitee',
    uid: 'shape-user',
    user_name: 'Shape Reference User',
    type: 'ambassador',
    event_id: 'shape-event',
    event_title: 'Shape Reference Open',
    meetup_title: 'Saturday hit',
    meetup_date: '2026-08-15',
    status: 'approved',
    created_at: '2026-08-15T18:00:00.000Z',
    reviewed_at: '2026-08-16T09:00:00.000Z',
    reviewed_by: 'shape-organizer',
  },

  // awards — NEW (PD10). One document per award carrying the winners' receipt. Replaces the
  // `tasks/{awardId}_{uid}` ledger rows that `functions/groupAwards.js` writes today.
  awards: {
    id: 'matchday_2026-08',
    award_id: 'matchday_2026-08',
    sub_category: 'matchday',
    award_name: 'Matchday',
    points_each: 5,
    winners: [{ uid: 'shape-user', name: 'Shape Reference User' }],
    event_id: 'shape-event',
    zone: 'Downtown - Midtown',
    created_at: '2026-08-31T23:00:00.000Z',
    paid_at: '2026-08-31T23:00:00.000Z',
  },

  // offers/{uid} — server-owned. L9 / PD1: only points SPENT is stored. Balances and totals are
  // derived at read, never persisted.
  offers: {
    uid: 'shape-user',
    pointsSpent: 15,
    updated_at: '2026-08-14T19:00:00.000Z',
  },

  // redemptions/{code} — doc id IS the coupon code. `flagged` and `cancel_requested` retire with
  // `redemption_locks`; the lifecycle they used to carry now lives on `bookings` (L11).
  redemptions: {
    code: 'RS-SHAPE-001',
    reward_id: 'shape-service',
    provider_id: 'shape-provider',
    provider_name: 'Shape Reference Stringing',
    offer: 'Full restring, synthetic gut',
    discounted_price: 40,
    points_cost: 15,
    uid: 'shape-user',
    user_name: 'Shape Reference User',
    status: 'used',
    created_at: '2026-08-10T15:00:00.000Z',
    used_at: '2026-08-14T19:00:00.000Z',
    used_by: 'shape-provider-user',
    cancelled_at: null,
    reviewer_note: null,
  },

  // ----------------------------------------------------- access and projections

  listings: {
    id: 'shape-listing',
    uid: 'shape-user',
    user_name: 'Shape Reference User',
    kind: 'sell',
    title: 'Shape Reference racquet',
    description: 'Strung last month, grip replaced.',
    condition: 'good',
    price: 120,
    duration: 30,
    pickup: 'Downtown - Midtown',
    photo_paths: ['listings/shape-user/racquet.png'],
    status: 'available',
    created_at: '2026-08-05T12:00:00.000Z',
  },

  // public_contacts/{uid} — a server-written FIELD PROJECTION (not the marker the older docs
  // describe), maintained by `onContactProjection` for listing-mediated contact.
  public_contacts: {
    uid: 'shape-user',
    reason: 'listing',
    email: 'shape-user@example.invalid',
    phone: '+14165550100',
    preferred_mode_of_contact: ['email'],
    updated_at: '2026-08-05T12:00:00.000Z',
  },

  // connections/{a__b} — deterministic sorted pair id. `pairId` must stay byte-identical between
  // `functions/connections.js` and `firestore.rules`.
  connections: {
    uids: ['shape-opponent', 'shape-user'],
    reason: 'tournament_match',
    created_at: '2026-09-01T12:00:00.000Z',
    backfilled: false,
  },

  notifications: {
    id: 'shape-notification',
    uid: 'shape-user',
    type: 'result_recorded',
    title: 'Win recorded',
    body: 'Win recorded — 7-5 6-4 v. Shape Reference Opponent',
    link: '/matches?mode=tournament&event=shape-event',
    read: false,
    read_at: null,
    event_id: 'shape-event',
    event_title: 'Shape Reference Open',
    match_id: 'shape-match',
    match_round: 'RR',
    player_1_name: 'Shape Reference User',
    player_2_name: 'Shape Reference Opponent',
    requested_by: 'shape-opponent',
    requested_by_name: 'Shape Reference Opponent',
    created_at: '2026-09-12T18:30:00.000Z',
  },

  // mailing_list — anonymous constrained create, super-admin read. NOT publicly readable (L9).
  mailing_list: {
    id: 'shape-signup',
    email: 'shape-signup@example.invalid',
    name: 'Shape Reference Signup',
    source: 'landing',
    created_at: '2026-08-02T12:00:00.000Z',
  },

  // site_stats/{docId} — public aggregates. One doc per aggregate; the zone-sweep and board
  // documents carry a different field set from the summary document.
  site_stats: {
    id: 'summary',
    counts: { players: 194, events: 10, matches: 399 },
    activePlayers: 194,
    matchesOrganized: 399,
    visited_keys: ['ramsden-park'],
    zone: 'Downtown - Midtown',
    sweep_index: 1,
    started_at: '2026-08-01T00:00:00.000Z',
    covered_keys: ['ramsden-park'],
    contributors: ['shape-user'],
    names: { 'shape-user': 'Shape Reference User' },
    updated_at: '2026-08-20T18:00:00.000Z',
  },

  // admin_stats/{docId} — super-admin read, server-only write.
  admin_stats: {
    id: 'dashboard',
    headline: 'Shape reference dashboard',
    generated_at: '2026-08-20T18:00:00.000Z',
    metrics: { signups_7d: 4, matches_7d: 11, open_disputes: 1 },
  },
};

/**
 * Fields the remodel retires. Reaching for one of these in new code or new fixtures is a bug —
 * `tests/unit/fixtureShape.test.mjs` fails on any that reappear. Each entry names its ruling.
 */
export const RETIRED_FIELDS = {
  users: {
    profile_details_visible: 'L6 — hid only the league pill, which is public on the leaderboards',
    email: 'split to `contacts`',
    phone: 'split to `contacts`',
    secondary_email: 'split to `contacts`',
    whatsapp_contact: 'split to `contacts`',
    whatsapp_same_as_phone: 'split to `contacts`',
    preferred_mode_of_contact: 'split to `contacts`',
  },
  stats: {
    loses: 'S1 — derived as matchesPlayed − wins; both writers stop',
    pointswon: 'L14 — P/G Won % derived client-side from the member matches',
    totalPointsPlayed: 'L14',
    tournamentsPlayed: 'DC-12 — and the stored value was wrong (F-D: incremented on every loss)',
    rankPosition: 'DC-11 — written, rendered nowhere',
    rrPointsBackfilledAt: 'one-off migration stamp',
  },
  preferences: {
    event_creator: 'PD6 — global privilege removed at the providers cutover',
    stringer: 'R7 — role moves to `providers`',
    stringer_id: 'R7 — role moves to `providers`',
    coach: 'R7 — role moves to `providers`',
    coach_id: 'R7 — role moves to `providers`',
    availability: 'superseded by availability_tags',
    availability_day: 'superseded by availability_tags',
    availability_time: 'superseded by availability_tags',
  },
  event_participants: {
    removal: 'L12 — one `status` replaces the removal flag and the RR withdrawn list',
    removal_at: 'L12',
    zone_change_requested: 'L15 — legacy twin of req_zone_change',
  },
  rr_drafts: {
    withdrawn: 'L12 — this IS the RR withdrawn list; `event_participants.status` replaces it',
  },
  site_stats: {
    updatedAt: 'renamed to updated_at — live documents carry both spellings (one name per thing)',
  },
  matches: {
    no_show: 'D6 / L10 — walkovers only; a missed match is recorded as a real 6-0',
    is_walkover:
      'Owner ruling 2026-08-28 (F-A) — one name per thing: renamed to `walkover`, the field the server, rules and UI already read',
    score_pending: 'amendment 2026-08-23 — retired before it shipped; hash moved into result_submissions',
    rr_group_bonus_v2: 'N2 — renamed to rr_groupbonus',
    claimed_winner_uid: 'Sprint D5 strip',
    claimed_winner_name: 'Sprint D5 strip',
    score_line: 'Sprint D5 strip',
    player_1_contact: 'contacts resolve at display time from `contacts`',
    player_2_contact: 'contacts resolve at display time from `contacts`',
    proposed_date: 'WDR section 3 — no dates or times are stored',
    proposed_slot: 'WDR section 3',
    proposed_by: 'WDR section 3',
    schedule_status: 'WDR section 3 — the scheduled/unscheduled vocabulary is deleted',
    schedule_requested: 'S5 — the boolean never recorded who asked; `requested_by` replaces it, no backfill',
  },
  offers: {
    points_spent:
      'Owner ruling 2026-08-28 — the stored name is `pointsSpent`. L9 wrote it snake_case, but the deployed field and every reader are camelCase, so the ledger spelling is the one that gives way.',
    lastEarnedSnapshot: 'L9 — balances are derived at read, never stored',
    balance: 'L9 — derived at read',
  },
  redemptions: {
    stringer_id: 'renamed to provider_id — the field held the provider id for both categories',
    stringer_name: 'renamed to provider_name',
    flagged_at: 'L11 — the flagged review state is removed',
    flag_note: 'L11',
    cancel_requested_at: 'L11 — the cancel_requested review state is removed',
    cancel_reason: 'L11',
  },
  tasks: {
    type: 'N1 — catalog rows move to `services`',
    offer: 'N1 — catalog rows move to `services`',
    provider_id: 'N1',
    provider_name: 'N1',
    stringer_id: 'N1',
    stringer_name: 'N1',
    points_cost: 'N1',
    discounted_price: 'N1',
    total_price: 'N1',
    discount: 'N1',
    certified: 'N1',
    brands: 'N1',
    area: 'N1',
    contact_phone: 'N1',
    active: 'N1',
    sort: 'N1',
    award_name: 'PD10 — award ledger rows move to `awards`',
    _award_id: 'PD10',
    sub_category: 'PD10',
    points_each: 'PD10',
  },
};

/** Collections the remodel removes entirely. */
export const RETIRED_COLLECTIONS = {
  group_lessons: 'L8 / PD2 — a lesson becomes an add-on block on a social event',
  group_lesson_contact_access: 'L8 / PD2 — retires with the collection it gated',
  redemption_locks: 'WDR section 8 — removed with the flagged / cancel_requested states',
  public_preferences: 'R7 — preferences are world-readable again, so the projection has no purpose',
};

/** Every collection in the new shape. */
export const COLLECTIONS = Object.keys(SHAPE_REFERENCE);
