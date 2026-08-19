import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeEvent,
  normalizeEventParticipant,
  normalizeTournamentMatch,
  normalizeUserPreferences,
  normalizeUserStats,
} from '../../src/lib/firestoreNormalization.ts';

test('event normalization resolves missing and malformed zone buckets safely', () => {
  const event = normalizeEvent('event-1', {
    title: 'Open',
    type: 'Tournament',
    location: 'Toronto',
    image: 7,
    zone_draw_config: { enabled: true, buckets: [{ id: '', zones: 'bad' }] },
  });
  assert.equal(event.id, 'event-1');
  assert.equal(event.image, '');
  assert.ok(event.zone_draw_config.buckets.length > 0);
});

test('participant and match normalization reject documents without stable identity', () => {
  assert.equal(normalizeEventParticipant('p1', { uid: '', event_id: 'event-1' }), null);
  assert.equal(normalizeTournamentMatch('m1', { event_id: 'event-1' }), null);
});

test('match normalization bounds invalid primitives to safe runtime defaults', () => {
  const match = normalizeTournamentMatch('m1', {
    event_id: 'event-1',
    match_id: 'draw-1',
    drawsize: Number.NaN,
    position: -4,
    tournament_choice: 'invalid',
    status: 'invalid',
    started: 'yes',
  });
  assert.equal(match.drawsize, 0);
  assert.equal(match.position, 0);
  assert.equal(match.tournament_choice, 'Singles');
  assert.equal(match.status, 'pending');
  assert.equal(match.started, false);
});

test('profile normalization does not grant role flags or trust malformed arrays', () => {
  const preferences = normalizeUserPreferences({
    event_creator: 'true',
    preferred_courts: ['A', 1],
    preferred_zone: { trim: 'not callable' },
  });
  assert.equal(preferences.event_creator, false);
  assert.deepEqual(preferences.preferred_courts, ['A']);
  assert.equal(preferences.preferred_zone, '');
  const stats = normalizeUserStats({ skill_level: '5', wins: Number.NaN });
  assert.equal(stats.skill_level, 2);
  assert.equal(stats.wins, 0);
});
