const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HttpsError } = require('firebase-functions/v2/https');
const {
  isTerminalRedemptionStatus,
  lockIdFor,
  assertRedemptionLockAvailable,
  writeRedemptionLock,
} = require('../lib/redemptionLock');

const transactionAt = (store) => {
  const readVersion = store.version;
  let pendingWrite;
  return {
    tx: {
      async get() {
        return store.value ? { exists: true, data: () => store.value } : { exists: false, data: () => undefined };
      },
      set(_ref, data) {
        pendingWrite = data;
      },
    },
    commit() {
      if (store.version !== readVersion) throw new Error('transaction conflict');
      store.value = { ...(store.value || {}), ...pendingWrite };
      store.version += 1;
    },
  };
};

test('lock ids are deterministic and do not expose the user or reward id', () => {
  const id = lockIdFor('user-123', 'offer-456');
  assert.equal(id, lockIdFor('user-123', 'offer-456'));
  assert.equal(id.length, 64);
  assert(!id.includes('user-123'));
  assert(!id.includes('offer-456'));
});

test('concurrent open-coupon reservations leave one winner after transaction retry', async () => {
  const store = { version: 0, value: null };
  const first = transactionAt(store);
  const second = transactionAt(store);
  const lock = { path: 'redemption_locks/test' };
  const data = { uid: 'user-123', reward_id: 'offer-456', code: 'RS-AAAA-AA', status: 'active' };

  await Promise.all([assertRedemptionLockAvailable(first.tx, lock), assertRedemptionLockAvailable(second.tx, lock)]);
  writeRedemptionLock(first.tx, lock, data);
  writeRedemptionLock(second.tx, lock, { ...data, code: 'RS-BBBB-BB' });
  first.commit();
  assert.throws(() => second.commit(), /transaction conflict/);

  const retry = transactionAt(store);
  await assert.rejects(
    assertRedemptionLockAvailable(retry.tx, lock),
    (error) => error instanceof HttpsError && error.code === 'already-exists',
  );
  assert.equal(store.value.code, 'RS-AAAA-AA');
  assert.equal(isTerminalRedemptionStatus(store.value.status), false);
});

test('terminal coupons can reserve the sentinel for a later redemption', async () => {
  const store = { version: 0, value: { status: 'used', code: 'RS-OLD-OO' } };
  const transaction = transactionAt(store);
  await assertRedemptionLockAvailable(transaction.tx, { path: 'redemption_locks/test' });
  writeRedemptionLock(
    transaction.tx,
    { path: 'redemption_locks/test' },
    {
      uid: 'user-123',
      reward_id: 'offer-456',
      code: 'RS-NEW-NN',
      status: 'active',
    },
  );
  transaction.commit();
  assert.equal(store.value.status, 'active');
  assert.equal(store.value.code, 'RS-NEW-NN');
});
