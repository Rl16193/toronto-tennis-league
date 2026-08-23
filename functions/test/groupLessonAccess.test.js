const test = require('node:test');
const assert = require('node:assert/strict');
const { nextMonthStart } = require('../lib/groupLessonAccess');

test('group lesson access expires at Toronto midnight across daylight-saving offsets', () => {
  assert.equal(nextMonthStart('2026-08').toISOString(), '2026-09-01T04:00:00.000Z');
  assert.equal(nextMonthStart('2026-11').toISOString(), '2026-12-01T05:00:00.000Z');
});

test('group lesson access expiry rolls into the next year', () => {
  assert.equal(nextMonthStart('2026-12').toISOString(), '2027-01-01T05:00:00.000Z');
});

test('group lesson access rejects malformed month keys', () => {
  assert.throws(() => nextMonthStart('2026-13'), /Invalid month key/);
  assert.throws(() => nextMonthStart('August 2026'), /Invalid month key/);
});
