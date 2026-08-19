const assert = require('node:assert/strict');
const { test } = require('node:test');
const { safeId } = require('../lib/logging');

test('safeId is deterministic and does not return the source identifier', () => {
  const value = 'member@example.invalid';
  assert.equal(safeId(value), safeId(value));
  assert.equal(safeId(value).length, 12);
  assert.notEqual(safeId(value), value);
  assert.notEqual(safeId(value), safeId('another@example.invalid'));
});
