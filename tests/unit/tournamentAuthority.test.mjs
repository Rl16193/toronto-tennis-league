import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('tournament route cannot mutate protected statistics directly', async () => {
  const source = await readFile(new URL('../../src/pages/tournament/useTournament.ts', import.meta.url), 'utf8');
  assert.match(source, /applyTournamentResult/);
  assert.doesNotMatch(source, /(?:setDoc|updateDoc)\(doc\(db, ['"]stats['"]/);
  assert.doesNotMatch(source, /batch\.set\(doc\(db, ['"]stats['"]/);
  assert.doesNotMatch(source, /leaguePoints26\s*:/);
});
