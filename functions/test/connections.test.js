const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isActiveEventParticipant } = require('../connections');

test('tournament contact connections require an active event participant record', () => {
  assert.equal(isActiveEventParticipant({ uid: 'member-a', removal: false }), true);
  assert.equal(isActiveEventParticipant({ uid: 'member-a', removal: true }), false);
  assert.equal(isActiveEventParticipant({ uid: 'member-a', active: false }), false);
  assert.equal(isActiveEventParticipant({ uid: 'member-a', status: 'withdrawn' }), false);
  assert.equal(isActiveEventParticipant({ uid: 'member-a', status: 'removed' }), false);
});
