const test = require('node:test');
const assert = require('node:assert/strict');
const { assertBookingStatus, assertCompletionRequested } = require('../lib/bookingState');

test('booking lifecycle keeps completion_requested_at as a stamp, not a status', () => {
  assert.doesNotThrow(() => assertBookingStatus('lead', 'drop'));
  assert.doesNotThrow(() => assertBookingStatus('in_progress', 'requestCompletion'));
  assert.doesNotThrow(() => assertCompletionRequested({ status: 'in_progress', completion_requested_at: 'now' }));
});

test('only a lead can be cancelled and a declined completion returns to in_progress', () => {
  assert.doesNotThrow(() => assertBookingStatus('lead', 'cancelLead'));
  assert.throws(() => assertCompletionRequested({ status: 'in_progress' }));
  assert.throws(() => assertBookingStatus('in_progress', 'cancelLead'));
  assert.throws(() => assertBookingStatus('completed', 'confirmYes'));
});
