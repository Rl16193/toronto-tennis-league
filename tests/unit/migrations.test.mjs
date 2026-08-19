import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMigrationArgs, PRODUCTION_PROJECT } from '../../scripts/migrations/lib/cli.mjs';

test('migration arguments require an explicit project and default to dry-run', () => {
  assert.throws(() => parseMigrationArgs([]), /Missing explicit --project/);
  assert.deepEqual(parseMigrationArgs(['--project', 'rands-local']), {
    project: 'rands-local',
    key: null,
    dryRun: true,
    apply: false,
    limit: null,
    resume: null,
    help: false,
  });
});

test('migration arguments support bounded apply intent and resume cursors', () => {
  assert.deepEqual(
    parseMigrationArgs([
      '--project',
      'rands-staging',
      '--key',
      'staging.json',
      '--apply',
      '--limit',
      '20',
      '--resume',
      'user-100',
    ]),
    {
      project: 'rands-staging',
      key: 'staging.json',
      dryRun: false,
      apply: true,
      limit: 20,
      resume: 'user-100',
      help: false,
    },
  );
});

test('production migration requires an explicit confirmation triple', () => {
  assert.throws(() => parseMigrationArgs(['--project', PRODUCTION_PROJECT]), /Refusing migration against production/);
});
