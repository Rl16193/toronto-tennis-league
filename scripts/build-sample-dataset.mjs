/**
 * Build a sample dataset in the NEW schema from the LIVE snapshot.
 *
 *   node scripts/build-sample-dataset.mjs
 *   node scripts/build-sample-dataset.mjs --snapshot analysis/snapshots/<stamp> --out tests/fixtures/dataset
 *   node scripts/build-sample-dataset.mjs --real-names      # keep live names/emails/phones
 *
 * WHY. `toronto-tennis-league` is the live deployed project; `racquets-and-strings` is the test
 * environment. The snapshot under `analysis/snapshots/` is real production data in the OLD shape.
 * This script transforms it into the post-remodel shape defined by `tests/fixtures/shape-reference.mjs`
 * so the UI can be exercised against realistic volume, relationships and edge cases instead of a
 * handful of invented documents.
 *
 * READ-ONLY AT BOTH ENDS. It reads local JSON and writes local JSON. It never contacts Firebase,
 * and it never writes to the snapshot it reads.
 *
 * PSEUDONYMISATION IS ON BY DEFAULT. Names, emails, phone numbers and avatar paths are replaced
 * with deterministic synthetic values — the same uid always gets the same persona, so every
 * cross-collection reference stays consistent and the UI still looks like a real league. Structure
 * that is NOT personal (event titles, court names, score lines, brackets, zone distribution,
 * timestamps) is preserved exactly. Pass --real-names to keep live personal data; the output is
 * then real member data and must not be committed or seeded anywhere public.
 *
 * Every transformation cites its ruling: D/L/N/S/R from HARMONIZATION_REPORT.md, PD from
 * DECISIONS_BRIEF.md, and the delta table in WORKFLOW-STATES.md section 0.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHAPE_REFERENCE, RETIRED_FIELDS, TASK_TIER_IDS } from '../tests/fixtures/shape-reference.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const REAL_NAMES = process.argv.includes('--real-names');

const latestSnapshot = () => {
  const dir = path.join(root, 'analysis', 'snapshots');
  const stamps = readdirSync(dir).filter((name) => existsSync(path.join(dir, name, '_manifest.json')));
  if (!stamps.length) throw new Error(`No snapshot with a _manifest.json under ${dir}`);
  return path.join(dir, stamps.sort().at(-1));
};

const snapshotDir = path.resolve(root, argOf('--snapshot', latestSnapshot()));
const outDir = path.resolve(root, argOf('--out', 'tests/fixtures/dataset'));

const read = (name) => {
  const file = path.join(snapshotDir, `${name}.json`);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8'));
};

// ---------------------------------------------------------------- pseudonymisation

const FIRST = [
  'Amara',
  'Bilal',
  'Camille',
  'Devon',
  'Elena',
  'Farid',
  'Grace',
  'Hitesh',
  'Iris',
  'Jonas',
  'Kavya',
  'Liam',
  'Mira',
  'Nikhil',
  'Olive',
  'Pascal',
  'Quinn',
  'Rosa',
  'Soren',
  'Tanvi',
  'Umar',
  'Vera',
  'Wesley',
  'Xiomara',
  'Yusuf',
  'Zara',
  'Adrian',
  'Beatriz',
  'Cormac',
  'Dalia',
];
const LAST = [
  'Alvarez',
  'Bhatt',
  'Chen',
  'Doyle',
  'Eriksen',
  'Fontaine',
  'Gill',
  'Haddad',
  'Ibarra',
  'Jensen',
  'Kaur',
  'Lindqvist',
  'Moreau',
  'Nakamura',
  'Okafor',
  'Pereira',
  'Quintero',
  'Rasmussen',
  'Silva',
  'Tremblay',
  'Ustinov',
  'Varga',
  'Whitfield',
  'Xu',
  'Yildiz',
  'Zhao',
];

const hashInt = (value, salt) =>
  parseInt(createHash('sha256').update(`${salt}:${value}`).digest('hex').slice(0, 8), 16);

/**
 * uid -> stable synthetic persona. Built once so every collection agrees on who is who.
 *
 * COLLISIONS MUST BE RESOLVED, not tolerated. 30 first names by 26 last names is 780 combinations
 * for ~200 members, so by the birthday bound roughly two dozen pairs collide. Two members sharing a
 * generated name would also share a generated email, and `createUser` rejects the second one —
 * seeding dies partway through with `auth/email-already-exists`. A middle initial disambiguates the
 * name while keeping it readable, and the email follows the disambiguated name.
 *
 * Resolution is order-dependent, so personas are built in sorted-uid order and the result is stable
 * across runs of the same snapshot.
 */
const personas = new Map();
const takenNames = new Set();
const takenEmails = new Set();
const INITIALS = 'BCDFGHJKLMNPRSTVW';

const persona = (uid) => {
  if (!uid) return null;
  if (!personas.has(uid)) {
    const first = FIRST[hashInt(uid, 'first') % FIRST.length];
    const last = LAST[hashInt(uid, 'last') % LAST.length];
    let name = `${first} ${last}`;
    for (let attempt = 0; takenNames.has(name); attempt += 1) {
      const initial = INITIALS[(hashInt(uid, 'initial') + attempt) % INITIALS.length];
      name = attempt < INITIALS.length ? `${first} ${initial}. ${last}` : `${first} ${initial}. ${last} ${attempt}`;
    }
    takenNames.add(name);

    let email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.invalid`;
    for (let attempt = 2; takenEmails.has(email); attempt += 1) {
      email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${attempt}@example.invalid`;
    }
    takenEmails.add(email);

    personas.set(uid, {
      name,
      email,
      phone: `+1416555${String(hashInt(uid, 'phone') % 10000).padStart(4, '0')}`,
      avatar: '',
    });
  }
  return personas.get(uid);
};

/** Live display names are matched back to a uid so free-text name fields stay consistent. */
const nameByUid = new Map();
const uidByLiveName = new Map();
const fakeName = (liveName, uid) => {
  if (REAL_NAMES) return liveName;
  const resolved = uid || uidByLiveName.get((liveName || '').trim().toLowerCase());
  if (resolved && personas.has(resolved)) return personas.get(resolved).name;
  if (!liveName) return liveName;
  // A name with no matching account (a guest doubles partner, a free-text organizer).
  const first = FIRST[hashInt(liveName, 'gfirst') % FIRST.length];
  const last = LAST[hashInt(liveName, 'glast') % LAST.length];
  return `${first} ${last}`;
};
const fakeEmail = (live, uid) =>
  REAL_NAMES
    ? live
    : uid && personas.has(uid)
      ? personas.get(uid).email
      : live && `anon-${hashInt(live, 'e') % 100000}@example.invalid`;
const fakePhone = (live, uid) =>
  REAL_NAMES
    ? live
    : live
      ? uid && personas.has(uid)
        ? personas.get(uid).phone
        : `+1416555${String(hashInt(live, 'p') % 10000).padStart(4, '0')}`
      : live;

// ---------------------------------------------------------------- helpers

/** Copy `keys` from `src` when present. Absent stays absent — the dataset is sparse like production. */
const pick = (src, keys) => {
  const out = {};
  for (const key of keys) if (src[key] !== undefined) out[key] = src[key];
  return out;
};
const notes = [];
const note = (collection, message) => notes.push({ collection, message });
const counters = {};
const bump = (key, n = 1) => {
  counters[key] = (counters[key] || 0) + n;
};

// ---------------------------------------------------------------- load

const live = {
  users: read('users'),
  contacts: read('contacts'),
  stats: read('stats'),
  preferences: read('preferences'),
  events: read('events'),
  event_participants: read('event_participants'),
  matches: read('matches'),
  rr_drafts: read('rr_drafts'),
  ranking_history_entries: read('ranking_history_entries'),
  courts: read('courts'),
  tasks: read('tasks'),
  task_claims: read('task_claims'),
  offers: read('offers'),
  redemptions: read('redemptions'),
  listings: read('listings'),
  public_contacts: read('public_contacts'),
  connections: read('connections'),
  notifications: read('notifications'),
  mailing_list: read('mailing_list'),
  site_stats: read('site_stats'),
};

// Seed the persona table from `users` so name lookups resolve before any collection is walked.
// Sorted, because collision resolution is order-dependent and the output must be reproducible.
for (const { id, data } of [...live.users].sort((a, b) => (a.data.uid || a.id).localeCompare(b.data.uid || b.id))) {
  const uid = data.uid || id;
  persona(uid);
  if (data.name) {
    nameByUid.set(uid, data.name);
    uidByLiveName.set(data.name.trim().toLowerCase(), uid);
  }
}

const out = Object.fromEntries(Object.keys(SHAPE_REFERENCE).map((key) => [key, []]));
const emit = (collection, docPath, data) => out[collection].push({ path: docPath, data });

// ---------------------------------------------------------------- identity

// users — L6 drops profile_details_visible; contact fields belong to `contacts`, not here.
for (const { id, data } of live.users) {
  const uid = data.uid || id;
  const p = persona(uid);
  emit('users', `users/${id}`, {
    ...pick(data, [
      'uid',
      'bio',
      'display_badges',
      'age_bracket',
      'isVerified',
      'welcomeEmailSent',
      'lastActive',
      'created_at',
    ]),
    uid,
    name: REAL_NAMES ? data.name : p.name,
    avatar: REAL_NAMES ? (data.avatar ?? '') : '',
  });
  if (data.profile_details_visible !== undefined) bump('users.profile_details_visible dropped (L6)');
  for (const key of [
    'email',
    'phone',
    'secondary_email',
    'whatsapp_contact',
    'whatsapp_same_as_phone',
    'preferred_mode_of_contact',
  ]) {
    if (data[key] !== undefined) bump(`users.${key} dropped (lives in contacts)`);
  }
}

for (const { id, data } of live.contacts) {
  const uid = data.uid || id;
  emit('contacts', `contacts/${id}`, {
    ...pick(data, ['uid', 'preferred_mode_of_contact', 'whatsapp_same_as_phone', 'contactable', 'updated_at']),
    uid,
    ...(data.email !== undefined ? { email: fakeEmail(data.email, uid) } : {}),
    ...(data.secondary_email !== undefined ? { secondary_email: fakeEmail(data.secondary_email, `${uid}-alt`) } : {}),
    ...(data.phone !== undefined ? { phone: fakePhone(data.phone, uid) } : {}),
    ...(data.whatsapp_contact !== undefined ? { whatsapp_contact: fakePhone(data.whatsapp_contact, uid) } : {}),
  });
}

// stats — S1 loses, L14 pointswon/totalPointsPlayed, DC-11 rankPosition, DC-12 tournamentsPlayed.
for (const { id, data } of live.stats) {
  const uid = data.uid || id;
  emit('stats', `stats/${id}`, {
    ...pick(data, [
      'uid',
      'skill_level',
      'tournament_preference',
      'league',
      'matchesPlayed',
      'wins',
      'leaguePoints26',
      'leaguePoints25',
      'rankTrend',
      'rankMove',
      'rankUpdatedAt',
    ]),
    uid,
    ...(data.name !== undefined ? { name: fakeName(data.name, uid) } : {}),
  });
  for (const key of [
    'loses',
    'pointswon',
    'totalPointsPlayed',
    'tournamentsPlayed',
    'rankPosition',
    'rrPointsBackfilledAt',
  ]) {
    if (data[key] !== undefined) bump(`stats.${key} dropped`);
  }
}

// preferences — R7/PD6 move role flags to `providers`; availability_tags supersedes the grid.
for (const { id, data } of live.preferences) {
  const uid = data.uid || id;
  emit('preferences', `preferences/${id}`, {
    ...pick(data, [
      'uid',
      'preferred_courts',
      'custom_courts',
      'favourite_players',
      'scheduling_preference',
      'preferred_zone',
      'email_notifications',
      'availability_tags',
    ]),
    uid,
  });
  for (const key of [
    'event_creator',
    'stringer',
    'stringer_id',
    'coach',
    'coach_id',
    'availability',
    'availability_day',
    'availability_time',
  ]) {
    if (data[key] !== undefined) bump(`preferences.${key} dropped`);
  }
}

// ---------------------------------------------------------------- providers (NEW, R7/PD4)

const providerRoles = new Map();
const addRole = (providerId, role, memberUid) => {
  if (!providerId) return;
  const row = providerRoles.get(providerId) || {
    roles: new Set(),
    member_uid: undefined,
    name: undefined,
    area: undefined,
  };
  row.roles.add(role);
  if (memberUid) row.member_uid = memberUid;
  providerRoles.set(providerId, row);
};
for (const { id, data } of live.preferences) {
  const uid = data.uid || id;
  if (data.stringer_id) addRole(data.stringer_id, 'stringer', uid);
  if (data.coach_id) addRole(data.coach_id, 'coach', uid);
}
for (const { data } of live.tasks) {
  if (data.type !== 'offer') continue;
  const providerId = data.provider_id || data.stringer_id;
  addRole(providerId, data.category === 'coaching' ? 'coach' : 'stringer', data.uid);
  const row = providerRoles.get(providerId);
  if (row) {
    row.name = row.name || data.provider_name || data.stringer_name;
    row.area = row.area || data.area;
  }
}
for (const [id, row] of providerRoles) {
  emit('providers', `providers/${id}`, {
    id,
    name: REAL_NAMES ? row.name || id : fakeName(row.name || id, row.member_uid),
    roles: [...row.roles],
    ...(row.member_uid ? { member_uid: row.member_uid } : {}),
    ...(row.area ? { area: row.area } : {}),
    updated_at: '2026-08-17T00:00:00.000Z',
  });
}
note('providers', `derived ${providerRoles.size} rows from preferences role flags and task offer rows (R7, PD4)`);

// ---------------------------------------------------------------- services (NEW, N1)

const serviceIds = [];
for (const { id, data } of live.tasks) {
  if (data.type !== 'offer') continue;
  const providerId = data.provider_id || data.stringer_id || 'unknown-provider';
  serviceIds.push(id);
  emit('services', `services/${id}`, {
    id,
    category: data.category === 'coaching' ? 'coaching' : data.category === 'others' ? 'others' : 'stringing',
    provider_id: providerId,
    provider_name: REAL_NAMES
      ? data.provider_name || data.stringer_name || ''
      : fakeName(data.provider_name || data.stringer_name || providerId, data.uid),
    ...(data.uid ? { uid: data.uid } : {}),
    ...(data.contact_phone !== undefined ? { contact_phone: fakePhone(data.contact_phone, data.uid) } : {}),
    ...pick(data, [
      'area',
      'offer',
      'brands',
      'discount',
      'total_price',
      'discounted_price',
      'points_cost',
      'certified',
      'active',
      'sort',
    ]),
  });
}
note('services', `moved ${serviceIds.length} \`tasks\` rows with type:'offer' into \`services\` (N1)`);

// ---------------------------------------------------------------- bookings (NEW, L11)

// No live source: the bookings lifecycle does not exist in the deployed project yet. These are
// SYNTHESISED so the Services UI has one booking in every state (L11). Deterministic, so the same
// snapshot always produces the same bookings.
const bookingMembers = live.users
  .slice(0, 8)
  .map(({ id, data }) => ({ uid: data.uid || id, name: fakeName(data.name, data.uid || id) }));
const BOOKING_STATES = [
  { status: 'lead', stamps: {} },
  { status: 'in_progress', stamps: {} },
  { status: 'in_progress', stamps: { completion_requested_at: '2026-08-16T18:00:00.000Z' } },
  {
    status: 'completed',
    stamps: { completion_requested_at: '2026-08-14T18:00:00.000Z', completed_at: '2026-08-14T19:00:00.000Z' },
  },
  { status: 'cancelled', stamps: { cancelled_at: '2026-08-12T11:00:00.000Z' } },
];
if (serviceIds.length) {
  BOOKING_STATES.forEach((state, index) => {
    const member = bookingMembers[index % Math.max(bookingMembers.length, 1)];
    const serviceId = serviceIds[index % serviceIds.length];
    const service = out.services.find((row) => row.data.id === serviceId).data;
    if (!member) return;
    const id = `sample-booking-${index + 1}`;
    emit('bookings', `bookings/${id}`, {
      id,
      service_id: serviceId,
      provider_id: service.provider_id,
      uid: member.uid,
      user_name: member.name,
      status: state.status,
      created_at: '2026-08-10T15:00:00.000Z',
      updated_at: '2026-08-16T18:00:00.000Z',
      ...state.stamps,
    });
  });
  note(
    'bookings',
    `synthesised ${BOOKING_STATES.length} bookings, one per L11 lifecycle state — the live project has no bookings collection`,
  );
}

// ---------------------------------------------------------------- events

// L1 — the permanent ladder event gets the fixed id `events/ladder`. Remapped everywhere.
const LADDER_ID = 'ladder';
const eventIdMap = new Map();
for (const { id, data } of live.events) {
  const isLadder = data.type === 'League Ladder' || /ladder/i.test(data.title || '');
  eventIdMap.set(id, isLadder ? LADDER_ID : id);
}
const mapEvent = (id) => eventIdMap.get(id) || id;

for (const { id, data } of live.events) {
  const newId = mapEvent(id);
  emit('events', `events/${newId}`, {
    ...pick(data, [
      'title',
      'type',
      'location',
      'about',
      'image',
      'start_date',
      'end_date',
      'join_last_date',
      'time',
      'day',
      'recurring',
      'skill_level',
      'tournament_format',
      'tournament_choice',
      'hide_seniors',
      'hide_beginners',
      'zone_draw_config',
      'round_deadlines',
      'created_at',
    ]),
    id: newId,
    ...(data.organizer ? { organizer: fakeName(data.organizer) } : {}),
    ...(data.creator_id ? { creator_id: data.creator_id } : {}),
    // L4 — per-event assignment. Seeded from the creator so the organizer UI has something to
    // read; `providers` rows carry roles, never assignments.
    organizer_ids: data.creator_id ? [data.creator_id] : [],
    // L7 — every bucket zone must also appear in `zones`.
    ...(data.zone_draw_config?.buckets?.length
      ? { zones: [...new Set(data.zone_draw_config.buckets.flatMap((bucket) => bucket.zones || []))] }
      : {}),
  });
}
if (eventIdMap.get([...eventIdMap.keys()].find((k) => eventIdMap.get(k) === LADDER_ID))) {
  note(
    'events',
    `remapped the League Ladder event to the fixed id \`events/${LADDER_ID}\` (L1); every match and participant reference follows`,
  );
}

for (const { id, data } of live.rr_drafts) {
  const eventId = mapEvent(data.event_id || id.split('_')[0]);
  const doc = { ...data, ...(data.event_id ? { event_id: eventId } : {}) };
  // L12 — the draft's `withdrawn` array IS the RR withdrawn list. One `status` on the participant
  // row replaces it; keeping both is how a re-seated withdrawal used to survive a reload.
  if (doc.withdrawn !== undefined) {
    bump('rr_drafts.withdrawn dropped — replaced by event_participants.status (L12)');
    delete doc.withdrawn;
  }
  emit('rr_drafts', `events/${eventId}/rr_drafts/${id}`, doc);
}

// ---------------------------------------------------------------- event_participants

for (const { id, data } of live.event_participants) {
  const uid = data.uid;
  const withdrawn = data.removal === true;
  emit('event_participants', `event_participants/${id}`, {
    ...pick(data, [
      'uid',
      'tournament_choice',
      'division',
      'skill',
      'skill_group',
      'doubles',
      'partner_in_app',
      'partner_uid',
      'partner_name',
      'dateselected',
      'zone',
      'zone_override',
      'req_zone_change',
      'new_zone',
      'merged_zone',
      'merged_into',
      'created_at',
    ]),
    id,
    event_id: mapEvent(data.event_id),
    ...(data.event_name ? { event_name: data.event_name } : {}),
    ...(data.user_name ? { user_name: fakeName(data.user_name, uid) } : {}),
    ...(data.partner_name ? { partner_name: fakeName(data.partner_name, data.partner_uid) } : {}),
    // L12 — one `status` replaces the removal flag and the RR withdrawn list.
    status: withdrawn ? 'withdrawn' : 'active',
    ...(withdrawn
      ? {
          withdrawn_reason: 'other',
          withdrawn_note: 'Migrated from the retired `removal` flag; the original reason was never recorded.',
          withdrawn_at: data.removal_at || data.created_at,
          withdrawn_by: 'self',
        }
      : {}),
  });
  if (withdrawn) bump('event_participants removal -> status:withdrawn (L12)');
  if (data.zone_change_requested !== undefined)
    bump('event_participants.zone_change_requested dropped (L15 legacy twin)');
}

// ---------------------------------------------------------------- matches

const MATCH_DROP = [
  'no_show',
  'is_walkover',
  'score_pending',
  'claimed_winner_uid',
  'claimed_winner_name',
  'score_line',
  'player_1_contact',
  'player_2_contact',
  'proposed_date',
  'proposed_slot',
  'proposed_by',
  'schedule_status',
  'schedule_requested',
  'rr_group_bonus_v2',
];

for (const { id, data } of live.matches) {
  const doc = {
    ...pick(data, [
      'category',
      'tournament_choice',
      'division',
      'skill_group',
      'zone',
      'bracket',
      'format',
      'drawsize',
      'match_id',
      'round',
      'position',
      'player_1_slot',
      'player_2_slot',
      'player_1_uid',
      'player_2_uid',
      'participant_uids',
      'winner_uid',
      'set_1_player_1',
      'set_1_player_2',
      'set_2_player_1',
      'set_2_player_2',
      'set_3_player_1',
      'set_3_player_2',
      'status',
      'started',
      'walkover',
      'court',
      'league',
      'completed_at',
      'score_edited_at',
      'rr_group',
      'rr_round',
      'rr_group_label',
      'rr_label_custom',
      'rr_advancement_count',
      'rr_winner_pts_v2',
      'next_match_id',
      'next_slot',
      'responded_at',
      'reported_by',
      'reported_at',
      'confirmed_at',
      'confirmed_by',
      'applied',
      'created_at',
    ]),
    id,
    ...(data.event_id ? { event_id: mapEvent(data.event_id) } : {}),
  };
  for (const [field, uidField] of [
    ['player_1_name', 'player_1_uid'],
    ['player_2_name', 'player_2_uid'],
    ['winner_name', 'winner_uid'],
    ['challenger_name', 'player_1_uid'],
    ['opponent_name', 'player_2_uid'],
    ['from_name', 'player_1_uid'],
    ['to_name', 'player_2_uid'],
  ]) {
    if (data[field] !== undefined) doc[field] = fakeName(data[field], data[uidField]);
  }
  // N2 — rr_group_bonus_v2 renames to rr_groupbonus. The stamp IS the receipt for the +5 payout.
  if (data.rr_group_bonus_v2 !== undefined) {
    doc.rr_groupbonus = data.rr_group_bonus_v2;
    bump('matches.rr_group_bonus_v2 -> rr_groupbonus (N2)');
  }
  // L2 — result_at re-stamps on every apply. Back-filled from completed_at for already-scored
  // matches so the field is populated wherever a result exists.
  if (data.completed_at) doc.result_at = data.score_edited_at || data.completed_at;
  // Amendment 2026-08-23 — reconstruct the submission map from the retired claimed_winner_* pair
  // where a player actually reported. Sets and margin come from the recorded score.
  if (data.reported_by && data.claimed_winner_uid) {
    const sets = [
      [data.set_1_player_1, data.set_1_player_2],
      [data.set_2_player_1, data.set_2_player_2],
      [data.set_3_player_1, data.set_3_player_2],
    ].filter(([a, b]) => a !== undefined && b !== undefined && (a || b));
    const winnerIsP1 = data.claimed_winner_uid === data.player_1_uid;
    const margin = sets.reduce((total, [a, b]) => total + (winnerIsP1 ? a - b : b - a), 0);
    doc.result_submissions = {
      [data.reported_by]: {
        winner_uid: data.claimed_winner_uid,
        sets: sets.map(([a, b]) => ({ player_1: a, player_2: b })),
        margin,
        submitted_at: data.reported_at || data.created_at,
        submitted_by: data.reported_by,
        hash: createHash('sha256')
          .update(`${id}:${data.claimed_winner_uid}:${JSON.stringify(sets)}`)
          .digest('hex')
          .slice(0, 32),
      },
    };
    bump('matches claimed_winner_* -> result_submissions (2026-08-23 amendment)');
  }
  // D6 / L10 — no_show is removed. The four live rows are unscored RR fixtures with no winner, so
  // they revert to plain pending matches. A walkover needs a winner; none of them has one.
  if (data.no_show) bump('matches.no_show dropped, match left pending (D6/L10)');
  for (const field of MATCH_DROP)
    if (data[field] !== undefined && field !== 'rr_group_bonus_v2') bump(`matches.${field} dropped`);
  emit('matches', `matches/${id}`, doc);
}

// ---------------------------------------------------------------- tasks split

for (const { id, data } of live.tasks) {
  if (data.type === 'offer') continue; // already emitted as `services`
  // PD10 — award ledger rows become one `awards` document per award, carrying the winners.
  if (data.award_name) {
    const awardId = data._award_id || id.replace(/_[^_]+$/, '');
    const existing = out.awards.find((row) => row.data.id === awardId);
    const winner = { uid: data.uid, name: fakeName(data.name, data.uid) };
    if (existing) {
      existing.data.winners.push(winner);
    } else {
      emit('awards', `awards/${awardId}`, {
        id: awardId,
        award_id: awardId,
        ...pick(data, ['sub_category', 'award_name', 'points_each']),
        winners: [winner],
        created_at: data.created_at,
        paid_at: data.created_at,
      });
    }
    bump('tasks award rows -> awards (PD10)');
    continue;
  }
  if (data.type && data.type !== 'offer') {
    bump(`tasks rows with type:'${data.type}' skipped — no target collection in the new shape`);
    note('tasks', `${data.type} rows have no home in the new shape; they are dropped, not migrated`);
    continue;
  }
  const doc = { ...data, ...(data.name !== undefined ? { name: fakeName(data.name, data.uid) } : {}) };
  for (const field of Object.keys(RETIRED_FIELDS.tasks)) delete doc[field];
  emit('tasks', `tasks/${id}`, doc);
}

for (const { id, data } of live.task_claims) {
  emit('task_claims', `task_claims/${id}`, {
    ...pick(data, [
      'uid',
      'type',
      'event_id',
      'event_title',
      'meetup_title',
      'meetup_date',
      'status',
      'created_at',
      'reviewed_at',
      'reviewed_by',
    ]),
    id,
    ...(data.user_name ? { user_name: fakeName(data.user_name, data.uid) } : {}),
  });
}

// ---------------------------------------------------------------- rewards

// L9 / PD1 — only points SPENT is stored. The stored name stays `pointsSpent` (owner ruling
// 2026-08-28, overriding L9’s snake_case spelling); the balance and
// lastEarnedSnapshot projections are derived at read and dropped here.
for (const { id, data } of live.offers) {
  emit('offers', `offers/${id}`, {
    uid: data.uid || id,
    pointsSpent: data.pointsSpent ?? data.points_spent ?? 0,
    ...(data.updated_at ? { updated_at: data.updated_at } : {}),
  });
  if (data.points_spent !== undefined) bump('offers.points_spent -> pointsSpent (owner ruling 2026-08-28)');
  if (data.lastEarnedSnapshot !== undefined) bump('offers.lastEarnedSnapshot dropped (L9 — derived at read)');
}

// L11 — flagged / cancel_requested retire with redemption_locks. Any live coupon in one of those
// states lands on the nearest surviving state and is reported.
const REDEMPTION_STATUS = {
  active: 'active',
  used: 'used',
  cancelled: 'cancelled',
  flagged: 'active',
  cancel_requested: 'active',
};
for (const { id, data } of live.redemptions) {
  if (data.status && !['active', 'used', 'cancelled'].includes(data.status)) {
    bump(`redemptions.status '${data.status}' -> '${REDEMPTION_STATUS[data.status] || 'active'}' (L11)`);
  }
  emit('redemptions', `redemptions/${id}`, {
    ...pick(data, [
      'code',
      'reward_id',
      'offer',
      'discounted_price',
      'points_cost',
      'uid',
      'created_at',
      'used_at',
      'used_by',
      'cancelled_at',
      'reviewer_note',
    ]),
    code: data.code || id,
    ...(data.stringer_id ? { provider_id: data.stringer_id } : {}),
    ...(data.stringer_name ? { provider_name: REAL_NAMES ? data.stringer_name : fakeName(data.stringer_name) } : {}),
    ...(data.user_name ? { user_name: fakeName(data.user_name, data.uid) } : {}),
    status: REDEMPTION_STATUS[data.status] || 'active',
  });
}

// ---------------------------------------------------------------- activity and projections

for (const { id, data } of live.courts) {
  emit('courts', `courts/${id}`, {
    ...data,
    id,
    ...(data.user_name ? { user_name: fakeName(data.user_name, data.uid) } : {}),
    ...(data.email ? { email: fakeEmail(data.email, data.uid) } : {}),
  });
}

for (const { id, data } of live.listings) {
  emit('listings', `listings/${id}`, {
    ...data,
    id,
    ...(data.user_name ? { user_name: fakeName(data.user_name, data.uid) } : {}),
  });
}

for (const { id, data } of live.public_contacts) {
  emit('public_contacts', `public_contacts/${id}`, {
    ...data,
    uid: data.uid || id,
    ...(data.email ? { email: fakeEmail(data.email, data.uid || id) } : {}),
    ...(data.phone ? { phone: fakePhone(data.phone, data.uid || id) } : {}),
  });
}

for (const { id, data } of live.connections) emit('connections', `connections/${id}`, { ...data });

for (const { id, data } of live.notifications) {
  const doc = { ...data, id };
  for (const field of ['player_1_name', 'player_2_name', 'requested_by_name']) {
    if (doc[field] !== undefined) doc[field] = fakeName(doc[field]);
  }
  // Notification bodies embed member names in free text; rewrite every known live name inside them.
  if (!REAL_NAMES) {
    for (const field of ['title', 'body']) {
      if (typeof doc[field] !== 'string') continue;
      for (const [uid, liveName] of nameByUid) {
        if (liveName && doc[field].includes(liveName))
          doc[field] = doc[field].split(liveName).join(personas.get(uid).name);
      }
    }
  }
  emit('notifications', `notifications/${id}`, doc);
}

for (const { id, data } of live.mailing_list) {
  emit('mailing_list', `mailing_list/${id}`, {
    ...data,
    id,
    ...(data.email ? { email: fakeEmail(data.email) } : {}),
    ...(data.name ? { name: fakeName(data.name) } : {}),
  });
}

for (const { id, data } of live.site_stats) {
  const doc = { ...data, id };
  if (!REAL_NAMES && doc.names && typeof doc.names === 'object') {
    doc.names = Object.fromEntries(Object.entries(doc.names).map(([uid, name]) => [uid, fakeName(name, uid)]));
  }
  // Live documents carry both spellings of the same timestamp. One name per thing.
  if (doc.updatedAt !== undefined) {
    doc.updated_at = doc.updated_at || doc.updatedAt;
    delete doc.updatedAt;
    bump('site_stats.updatedAt -> updated_at');
  }
  emit('site_stats', `site_stats/${id}`, doc);
}

// mailing_list and admin_stats are empty in the live snapshot (the export captured no rows), so
// the super-admin screens would render against nothing. SYNTHESISED, like bookings.
if (!out.mailing_list.length) {
  ['landing', 'event-page', 'referral'].forEach((source, index) => {
    const id = `sample-signup-${index + 1}`;
    emit('mailing_list', `mailing_list/${id}`, {
      id,
      email: `sample.signup.${index + 1}@example.invalid`,
      name: fakeName(`Sample Signup ${index + 1}`),
      source,
      created_at: `2026-08-0${index + 2}T12:00:00.000Z`,
    });
  });
  note(
    'mailing_list',
    'synthesised 3 signups — the live snapshot captured none, and the super-admin screen needs rows',
  );
}
if (!out.admin_stats.length) {
  emit('admin_stats', 'admin_stats/dashboard', {
    id: 'dashboard',
    headline: 'Sample dataset dashboard',
    generated_at: '2026-08-17T01:21:54.902Z',
    metrics: {
      signups_7d: 4,
      matches_7d: out.matches.filter((row) => row.data.status === 'complete').length,
      open_disputes: out.matches.filter((row) => row.data.score_disputed === true).length,
    },
  });
  note('admin_stats', 'synthesised 1 dashboard document — the live snapshot captured none');
}

for (const { id, data } of live.ranking_history_entries) {
  const uid = data._uid || id.split('__')[0];
  emit(
    'ranking_history_entries',
    `ranking_history/${uid}/entries/${data.date || id}`,
    pick(data, ['date', 'position', 'direction']),
  );
}

// ---------------------------------------------------------------- free-text scrub

// Per-field pseudonymisation is not enough. Some live members have no display name at all — their
// EMAIL is their display name — so it ends up inside notification titles and bodies as free text.
// This pass walks every string in the output and rewrites, in order: known live member names,
// then any surviving email address, then any surviving phone number. Identifier-shaped fields are
// skipped so document ids, uids and deep links survive intact.
const SKIP_KEYS = new Set([
  'uid',
  'id',
  'path',
  'link',
  'event_id',
  'match_id',
  'next_match_id',
  'provider_id',
  'service_id',
  'reward_id',
  'code',
  'court_key',
  'photo_path',
  'photo_paths',
  'avatar',
  'image',
  'member_uid',
  'player_1_uid',
  'player_2_uid',
  'winner_uid',
  'partner_uid',
  'reported_by',
  'confirmed_by',
  'submitted_by',
  'requested_by',
  'creator_id',
  'organizer_ids',
  'uids',
  'participant_uids',
  'hash',
]);
const liveNames = [...nameByUid.entries()]
  .filter(([, name]) => name && name.length > 2)
  .sort((a, b) => b[1].length - a[1].length);
const scrubCounts = { names: 0, emails: 0, phones: 0 };

const scrubString = (value) => {
  let next = value;
  for (const [uid, liveName] of liveNames) {
    if (next.includes(liveName)) {
      next = next.split(liveName).join(personas.get(uid).name);
      scrubCounts.names += 1;
    }
  }
  // Values the per-field pass already pseudonymised are left alone. Re-randomising them here would
  // silently break the uid -> persona mapping that keeps `contacts` and `public_contacts` agreeing.
  next = next.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (match) => {
    if (match.endsWith('@example.invalid')) return match;
    scrubCounts.emails += 1;
    return `anon-${hashInt(match, 'scrub') % 100000}@example.invalid`;
  });
  next = next.replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, (match) => {
    if (/^\+1416555\d{4}$/.test(match)) return match;
    scrubCounts.phones += 1;
    return `+1416555${String(hashInt(match, 'scrubp') % 10000).padStart(4, '0')}`;
  });
  return next;
};

const scrubValue = (value, key) => {
  if (typeof value === 'string') return SKIP_KEYS.has(key) ? value : scrubString(value);
  if (Array.isArray(value)) return value.map((entry) => scrubValue(entry, key));
  if (value && typeof value === 'object' && !('_seconds' in value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, scrubValue(childValue, childKey)]),
    );
  }
  return value;
};

if (!REAL_NAMES) {
  for (const docs of Object.values(out)) {
    for (const row of docs) row.data = scrubValue(row.data, null);
  }
}

// ---------------------------------------------------------------- data-quality findings

const eventIds = new Set(out.events.map((row) => row.data.id));
const orphanParticipants = out.event_participants.filter((row) => !eventIds.has(row.data.event_id));
const orphanMatches = out.matches.filter((row) => row.data.event_id && !eventIds.has(row.data.event_id));
// Firestore Timestamps survive the export as {_seconds,_nanoseconds}. The seeder rehydrates them;
// anything reading the JSON directly must expect both this and ISO strings on the same field.
let timestampObjects = 0;
const timestampFields = new Set();
for (const [collection, docs] of Object.entries(out)) {
  for (const { data } of docs) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && '_seconds' in value) {
        timestampObjects += 1;
        timestampFields.add(`${collection}.${key}`);
      }
    }
  }
}

// ---------------------------------------------------------------- validate

const problems = [];
for (const [collection, docs] of Object.entries(out)) {
  const allowed = new Set(Object.keys(SHAPE_REFERENCE[collection]));
  // Completed milestone tiers are stored as `true` under their catalogue id — an open but known set.
  if (collection === 'tasks') for (const tier of TASK_TIER_IDS) allowed.add(tier);
  const retired = RETIRED_FIELDS[collection] || {};
  const unknown = new Set();
  for (const { path: docPath, data } of docs) {
    for (const key of Object.keys(data)) {
      if (retired[key]) problems.push(`${docPath}: retired field \`${key}\` survived — ${retired[key]}`);
      else if (!allowed.has(key)) unknown.add(key);
    }
  }
  if (unknown.size)
    problems.push(
      `${collection}: ${unknown.size} field(s) not declared in the shape reference — ${[...unknown].join(', ')}`,
    );
}

// ---------------------------------------------------------------- write

mkdirSync(outDir, { recursive: true });
let total = 0;
for (const [collection, docs] of Object.entries(out)) {
  writeFileSync(path.join(outDir, `${collection}.json`), `${JSON.stringify(docs, null, 2)}\n`);
  total += docs.length;
}
writeFileSync(
  path.join(outDir, '_manifest.json'),
  `${JSON.stringify(
    {
      builtFrom: path.relative(root, snapshotDir).split(path.sep).join('/'),
      sourceProject: JSON.parse(readFileSync(path.join(snapshotDir, '_manifest.json'), 'utf8')).project,
      schema: 'tests/fixtures/shape-reference.mjs',
      pseudonymised: !REAL_NAMES,
      totalDocs: total,
      counts: Object.fromEntries(Object.entries(out).map(([key, docs]) => [key, docs.length])),
    },
    null,
    2,
  )}\n`,
);

// The declared field ORDER per collection, so consumers that cannot import an .mjs module — the
// spreadsheet exporter, notably — can still lay columns out in schema order rather than in whatever
// order the first document happened to use.
writeFileSync(
  path.join(outDir, '_schema.json'),
  `${JSON.stringify(
    Object.fromEntries(
      Object.keys(SHAPE_REFERENCE).map((collection) => [
        collection,
        {
          fields: Object.keys(SHAPE_REFERENCE[collection]),
          retired: RETIRED_FIELDS[collection] ?? {},
          ...(collection === 'tasks' ? { openTierIds: TASK_TIER_IDS } : {}),
        },
      ]),
    ),
    null,
    2,
  )}\n`,
);

console.log(`Source      ${path.relative(root, snapshotDir)}`);
console.log(
  `Output      ${path.relative(root, outDir)}  (${total} documents across ${Object.keys(out).length} collections)`,
);
console.log(
  `Names       ${REAL_NAMES ? 'LIVE — real member data, do not commit or seed anywhere public' : 'pseudonymised (deterministic)'}\n`,
);

console.log('Per collection');
for (const [collection, docs] of Object.entries(out)) {
  const from = live[collection]?.length;
  console.log(
    `  ${collection.padEnd(26)} ${String(docs.length).padStart(4)}${from !== undefined && from !== docs.length ? `   (from ${from})` : ''}`,
  );
}

console.log('\nTransformations');
for (const [label, count] of Object.entries(counters).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${label}`);
}

if (notes.length) {
  console.log('\nNotes');
  for (const { collection, message } of notes) console.log(`  ${collection}: ${message}`);
}

if (!REAL_NAMES) {
  console.log('\nFree-text scrub');
  console.log(`  ${String(scrubCounts.names).padStart(4)}  member names rewritten inside free text`);
  console.log(`  ${String(scrubCounts.emails).padStart(4)}  email addresses rewritten inside free text`);
  console.log(`  ${String(scrubCounts.phones).padStart(4)}  phone numbers rewritten inside free text`);
}

console.log('\nData-quality findings carried over from live');
console.log(
  `  ${String(orphanParticipants.length).padStart(4)}  event_participants pointing at an event that is not in the snapshot`,
);
console.log(`  ${String(orphanMatches.length).padStart(4)}  matches pointing at an event that is not in the snapshot`);
console.log(
  `  ${String(timestampObjects).padStart(4)}  Firestore Timestamp values (seed-dataset.mjs rehydrates these) on ${[...timestampFields].join(', ')}`,
);

if (problems.length) {
  console.log(`\nSCHEMA PROBLEMS (${problems.length})`);
  for (const problem of problems.slice(0, 40)) console.log(`  ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\nEvery emitted field is declared in the shape reference, and no retired field survived.');
}
