import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNameValid, validateCompletion, validatePassword } from '../../src/features/signup/signupForm.ts';
import { buildSignupProfileDocuments } from '../../src/features/signup/signupProfileDocuments.ts';

test('signup password validation preserves length, sequential, and confirmation rules', () => {
  assert.deepEqual(validatePassword('abc', 'abc'), {
    password: 'Password should be between 6-80 characters and non-sequential.',
  });
  assert.deepEqual(validatePassword('safe-pass', 'different'), { confirmPassword: 'Passwords do not match' });
  assert.deepEqual(validatePassword('secure-pass', 'secure-pass'), {});
});

test('signup completion validation treats phone as optional but validates supplied digits', () => {
  assert.deepEqual(validateCompletion('Anuj Raja', ''), {});
  assert.deepEqual(validateCompletion('A1', '123'), {
    name: 'Name cannot contain numbers',
    phone: 'Phone number must be exactly 10 digits',
  });
  assert.equal(isNameValid(' Anuj Raja '), true);
  assert.equal(isNameValid('A1'), false);
});

test('signup profile projections preserve league semantics and keep private contact fields separate', () => {
  const docs = buildSignupProfileDocuments(
    {
      uid: 'member-a',
      email: 'member@example.com',
      name: 'Member A',
      phone: '(416)-555-0101',
      skillLevel: 4,
      league: "Women's",
      retiredPro: true,
      juniors: false,
      preferredCourts: ['Court A'],
      preferredZone: 'Downtown - Midtown',
      schedulingPreference: 'Tell me more about matchdays',
    },
    '2026-08-19T00:00:00.000Z',
  );
  assert.deepEqual(docs.user, { name: 'Member A' });
  assert.equal(docs.stats.league, "Women's Retired Pro");
  assert.equal(docs.contact.email, 'member@example.com');
  assert.equal('email' in docs.user, false);
  assert.equal('event_creator' in docs.preferences, false);
});
