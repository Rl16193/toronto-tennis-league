// Table tests for the registration lifecycle. Run: npx tsx --test src/features/events/registrations.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { joinWrite, newRegistration, registrationId, withdrawal } from './registrations';

const event = { id: 'e1', title: 'Open', category: 'doubles_tournament', sub_category: 'knockout' };
const row = newRegistration(event, 'u1', 'Ana', { division: "Women's", skill: 3, partner_uid: 'u2', partner_name: 'Bea' });

test('registrationId', () => {
  // MIRRORS functions/test/participantSeat.test.js
  assert.equal(registrationId('e1', 'u', 'singles_tournament', "Men's"), 'e1_u');
  assert.equal(registrationId('e1', 'u', 'doubles_tournament', "Men's"), 'e1_u_mensdoubles');
  assert.equal(registrationId('e1', 'u', 'doubles_tournament', "Women's"), 'e1_u_womensdoubles');
  assert.equal(registrationId('e1', 'u', 'doubles_tournament', 'Mixed Doubles'), 'e1_u_mixeddoubles');
  assert.equal(registrationId('e1', 'u', 'social'), 'e1_u');
});

test('joinWrite', () => {
  assert.equal(joinWrite({ status: 'active' }, row), null, 'already active: nothing');
  assert.deepEqual(joinWrite(undefined, row), { set: row }, 'no row: a new one');
  const again = joinWrite({ status: 'withdrawn' }, row);
  assert.ok(again && 'update' in again, 'withdrawn: same row, updated');
  // Only the fields the owner's reactivation rule allows.
  assert.deepEqual(Object.keys(again.update).sort(), ['division', 'partner_name', 'partner_uid', 'skill', 'status', 'user_name', 'withdrawn_at', 'withdrawn_by', 'withdrawn_reason']);
  assert.equal(again.update.status, 'active');
  assert.equal(again.update.withdrawn_at, null);
});

test('withdrawal', () => {
  const w = withdrawal('u1', 'Wrong zone');
  assert.equal(w.status, 'withdrawn');
  assert.equal(w.withdrawn_reason, 'wrong_zone');
  assert.equal(w.withdrawn_by, 'u1');
  assert.equal(withdrawal('org').withdrawn_reason, '', 'an Edit Draw removal has no reason');
});
