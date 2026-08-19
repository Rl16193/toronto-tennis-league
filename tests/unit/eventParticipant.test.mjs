import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEventParticipantData } from '../../src/features/events/services/eventParticipant.ts';

test('event participant payload preserves regular-event fields and omits optional draw fields', () => {
  assert.deepEqual(
    buildEventParticipantData({
      uid: 'member-a',
      user_name: 'Member A',
      event_id: 'event-a',
      event_name: 'Open Play',
      tournament_choice: '',
      doubles: '',
      partner_in_app: '',
      skill: 3,
      dateselected: [],
      created_at: '2026-01-01T00:00:00.000Z',
    }),
    {
      uid: 'member-a',
      user_name: 'Member A',
      event_id: 'event-a',
      event_name: 'Open Play',
      tournament_choice: '',
      doubles: '',
      partner_in_app: '',
      skill: 3,
      dateselected: [],
      created_at: '2026-01-01T00:00:00.000Z',
    },
  );
});

test('event participant payload includes tournament placement fields only when provided', () => {
  assert.deepEqual(
    buildEventParticipantData({
      uid: 'member-a',
      user_name: 'Member A',
      event_id: 'event-a',
      event_name: 'Tournament',
      tournament_choice: 'Doubles',
      doubles: 'Partner B',
      partner_in_app: 'yes',
      partner_uid: 'member-b',
      division: 'Mixed Doubles',
      skill_group: 'All',
      skill: 4,
      dateselected: [],
      created_at: '2026-01-01T00:00:00.000Z',
    }),
    {
      uid: 'member-a',
      user_name: 'Member A',
      event_id: 'event-a',
      event_name: 'Tournament',
      tournament_choice: 'Doubles',
      doubles: 'Partner B',
      partner_in_app: 'yes',
      partner_uid: 'member-b',
      division: 'Mixed Doubles',
      skill_group: 'All',
      skill: 4,
      dateselected: [],
      created_at: '2026-01-01T00:00:00.000Z',
    },
  );
});
