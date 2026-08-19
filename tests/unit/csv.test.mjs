import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsvLine } from '../../src/utils/csv.ts';

test('CSV parser preserves commas and escaped quotes inside quoted cells', () => {
  assert.deepEqual(parseCsvLine('Court,"Park, North","He said ""play""",open'), [
    'Court',
    'Park, North',
    'He said "play"',
    'open',
  ]);
});

test('CSV parser keeps empty trailing cells', () => {
  assert.deepEqual(parseCsvLine('Court,,open,'), ['Court', '', 'open', '']);
});
