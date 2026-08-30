// The new data shape, enforced.
//
// `shape-reference.mjs` is only worth having if something fails when a fixture drifts from it.
// These tests are that something: they check the canonical fixtures against the declared field
// set, refuse retired field names, and refuse retired collections. The same checks run inside
// `scripts/build-sample-dataset.mjs` against the transformed live snapshot, so both tiers of test
// data are held to one contract.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOCAL_FIXTURES,
  NEW_SHAPE_FIXTURES,
  LEGACY_COMPAT_FIXTURES,
  LOCAL_AUTH_FIXTURES,
} from '../fixtures/local-fixtures.mjs';
import {
  SHAPE_REFERENCE,
  RETIRED_FIELDS,
  RETIRED_COLLECTIONS,
  TASK_TIER_IDS,
  COLLECTIONS,
} from '../fixtures/shape-reference.mjs';

/** `events/{id}/rr_drafts/{key}` and `ranking_history/{uid}/entries/{id}` are subcollections. */
const collectionOf = (docPath) => {
  const segments = docPath.split('/');
  if (segments.length === 4 && segments[2] === 'rr_drafts') return 'rr_drafts';
  if (segments.length === 4 && segments[2] === 'entries') return 'ranking_history_entries';
  return segments[0];
};

const allowedKeys = (collection) => {
  const allowed = new Set(Object.keys(SHAPE_REFERENCE[collection] ?? {}));
  // Completed milestone tiers are stored as `true` under their catalogue id — an open but known set.
  if (collection === 'tasks') for (const tier of TASK_TIER_IDS) allowed.add(tier);
  return allowed;
};

test('every canonical fixture lands in a collection the new shape declares', () => {
  const unknown = NEW_SHAPE_FIXTURES.map(({ path }) => collectionOf(path)).filter(
    (collection) => !COLLECTIONS.includes(collection),
  );
  assert.deepEqual([...new Set(unknown)], [], 'fixture written to a collection with no entry in SHAPE_REFERENCE');
});

test('no canonical fixture uses a field the remodel retired', () => {
  const offences = [];
  for (const { path, data } of NEW_SHAPE_FIXTURES) {
    const retired = RETIRED_FIELDS[collectionOf(path)] ?? {};
    for (const key of Object.keys(data)) {
      if (retired[key]) offences.push(`${path}: \`${key}\` — ${retired[key]}`);
    }
  }
  assert.deepEqual(offences, []);
});

test('no canonical fixture uses a field the shape reference does not declare', () => {
  const offences = [];
  for (const { path, data } of NEW_SHAPE_FIXTURES) {
    const collection = collectionOf(path);
    if (!SHAPE_REFERENCE[collection]) continue;
    const allowed = allowedKeys(collection);
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) offences.push(`${path}: \`${key}\` is not declared for \`${collection}\``);
    }
  }
  assert.deepEqual(offences, []);
});

test('no canonical fixture writes to a retired collection', () => {
  const offences = NEW_SHAPE_FIXTURES.map(({ path }) => collectionOf(path))
    .filter((collection) => RETIRED_COLLECTIONS[collection])
    .map((collection) => `${collection} — ${RETIRED_COLLECTIONS[collection]}`);
  assert.deepEqual([...new Set(offences)], []);
});

test('the legacy island stays quarantined and does not grow silently', () => {
  // A deliberate tripwire. Every document here is scheduled for deletion by a shipped ruling and
  // survives only because live code still reads it. Adding one should be a conscious act with a
  // row added to the table in local-fixtures.mjs; removing one should be celebrated here.
  const paths = LEGACY_COMPAT_FIXTURES.map(({ path }) => path).sort();
  assert.deepEqual(paths, [
    'group_lesson_contact_access/current',
    `group_lessons/${new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
    })
      .formatToParts(new Date())
      .reduce(
        (acc, part) =>
          part.type === 'year' ? `${part.value}${acc}` : part.type === 'month' ? `${acc}-${part.value}` : acc,
        '',
      )}`,
    'preferences/multi-role-a',
    'preferences/organizer-a',
    'tasks/synthetic-coaching-offer',
    'tasks/synthetic-offer',
  ]);
});

test('every collection in the new shape has at least one canonical fixture', () => {
  const covered = new Set(NEW_SHAPE_FIXTURES.map(({ path }) => collectionOf(path)));
  const missing = COLLECTIONS.filter((collection) => !covered.has(collection));
  assert.deepEqual(missing, [], 'a collection in the shape has no fixture — the UI for it seeds empty');
});

test('fixture document paths are unique', () => {
  // Duplicates are silent: seed-emulator.mjs setDoc()s them concurrently, so which one wins is a
  // race rather than a decision.
  const seen = new Map();
  const duplicates = [];
  for (const { path } of LOCAL_FIXTURES) {
    if (seen.has(path)) duplicates.push(path);
    seen.set(path, true);
  }
  assert.deepEqual(duplicates, []);
});

test('every uid referenced by a fixture has a users document and an Auth account', () => {
  const users = new Set(
    NEW_SHAPE_FIXTURES.filter(({ path }) => path.startsWith('users/')).map(({ path }) => path.split('/')[1]),
  );
  const accounts = new Set(LOCAL_AUTH_FIXTURES.map(({ uid }) => uid));
  assert.deepEqual(
    [...users].filter((uid) => !accounts.has(uid)),
    [],
    'users document with no Auth account — the UI cannot sign in as them',
  );

  const referenced = new Set();
  for (const { data } of NEW_SHAPE_FIXTURES) {
    for (const key of [
      'uid',
      'player_1_uid',
      'player_2_uid',
      'winner_uid',
      'member_uid',
      'creator_id',
      'partner_uid',
      'used_by',
      'requested_by',
      'reported_by',
    ]) {
      if (typeof data[key] === 'string' && data[key]) referenced.add(data[key]);
    }
    for (const uid of data.organizer_ids ?? []) referenced.add(uid);
    for (const uid of data.participant_uids ?? []) referenced.add(uid);
    for (const uid of data.uids ?? []) referenced.add(uid);
  }
  assert.deepEqual(
    [...referenced].filter((uid) => !users.has(uid)).sort(),
    [],
    'fixture references a uid with no users document',
  );
});

test('every lifecycle state named in WORKFLOW-STATES has a fixture', () => {
  const byCollection = (collection) =>
    NEW_SHAPE_FIXTURES.filter(({ path }) => collectionOf(path) === collection).map(({ data }) => data);

  // L11 — bookings: lead, in_progress, in_progress carrying the completion stamp, completed, cancelled.
  const bookings = byCollection('bookings');
  assert.deepEqual([...new Set(bookings.map((row) => row.status))].sort(), [
    'cancelled',
    'completed',
    'in_progress',
    'lead',
  ]);
  assert.ok(
    bookings.some((row) => row.status === 'in_progress' && row.completion_requested_at),
    'no booking carries completion_requested_at — the stamp is not a fourth status, and it needs its own fixture',
  );

  // L12 — participants: active and withdrawn.
  assert.deepEqual([...new Set(byCollection('event_participants').map((row) => row.status))].sort(), [
    'active',
    'withdrawn',
  ]);

  const matches = byCollection('matches');
  // D6 / L10 — a walkover is all-zero scores plus a winner.
  const walkover = matches.find((row) => row.walkover === true);
  assert.ok(walkover, 'no walkover fixture');
  assert.equal(
    walkover.set_1_player_1 + walkover.set_1_player_2 + walkover.set_2_player_1 + walkover.set_2_player_2,
    0,
  );
  assert.ok(walkover.winner_uid, 'a walkover needs a winner — all-zero alone is an unscored match');

  // Amendment 2026-08-23 — a dispute is two submissions naming different winners, and the first
  // applied result stays applied.
  const disputed = matches.find((row) => row.score_disputed === true);
  assert.ok(disputed, 'no disputed-result fixture');
  const winners = new Set(Object.values(disputed.result_submissions).map((entry) => entry.winner_uid));
  assert.equal(winners.size, 2, 'a dispute requires two submissions naming DIFFERENT winners');
  assert.equal(disputed.status, 'complete', 'the first applied result stays applied while disputed');

  // L15 — a pending zone change sits in both draws until the organizer resolves it.
  assert.ok(
    byCollection('event_participants').some((row) => row.req_zone_change && row.new_zone),
    'no pending zone-change fixture',
  );

  // L18 — registered alone (the derived partner pool) and a guest partner with no uid.
  const doubles = byCollection('event_participants').filter((row) => row.tournament_choice === 'Doubles');
  assert.ok(
    doubles.some((row) => !row.partner_uid && !row.partner_name),
    'no doubles participant in the partner pool',
  );
  assert.ok(
    doubles.some((row) => row.partner_name && !row.partner_uid),
    'no guest-partner fixture',
  );

  // N2 — the rr_groupbonus stamp is the only receipt that the +5 was paid.
  assert.ok(
    matches.some((row) => row.rr_groupbonus === true),
    'no rr_groupbonus fixture',
  );

  // Every match category the collection is discriminated by.
  assert.deepEqual([...new Set(matches.map((row) => row.category))].sort(), ['challenge', 'rally', 'singles']);
});
