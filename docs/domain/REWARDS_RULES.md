# Rewards rules

## Redeemable balance

**Rule:** A player's redeemable balance is earned league points plus earned RS task points minus
points already spent in `offers/{uid}`. Redeeming does not mutate the earning counters.

**Why:** Match history, leaderboards, and task progress remain meaningful after a coupon is issued.

**Important exception:** A balance is clamped to a non-negative integer before redemption.

**Code:** `functions/rewards.js`, `functions/lib/points.js`.

**Regression test:** `functions/test/domain.test.js`; callable validation coverage in
`functions/test/callable.test.js`.

## Coupon ownership and idempotency

**Rule:** Redemption, use, flagging, cancellation, and review are callable Function workflows.
Each state transition is transaction-backed; a player can have only one open coupon for an offer.

**Why:** The browser is an untrusted caller and a double tap must not spend points twice.

**Important exception:** A stringer may act only on coupons for that provider; organizers have the
separate review path.

**Code:** `functions/rewards.js`, `functions/lib/callable.js`, `firestore.rules`.

**Regression test:** Rules tests cover client write protections; callable integration against the
Functions emulator remains a future stabilization item.
