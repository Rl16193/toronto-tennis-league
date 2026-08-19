import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNameValid, validateCompletion, validatePassword } from '../../src/features/signup/signupForm.ts';

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
