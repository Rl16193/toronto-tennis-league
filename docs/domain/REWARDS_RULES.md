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

## Coupon state transitions

**Rule:** `active` may become `used`, `flagged`, or `cancel_requested`. A `flagged` coupon may be
marked `used` by the provider/organizer or returned to `active` by an organizer. Only
`cancel_requested` may be approved into `cancelled` and refunded; declining either review state
returns it to `active`. `used` and `cancelled` are terminal for those workflows.

**Why:** A coupon that is under dispute or cancellation review must not be redeemed through an
alternate path, and a used coupon must never be reactivated and reused.

**Important exception:** Provider notes, cancellation reasons, and reviewer notes are optional but
are capped at 500 characters at the callable boundary.

**Code:** `functions/lib/redemptionState.js`, `functions/rewards.js`.

**Regression test:** `functions/test/redemptionState.test.js` and the bounded-string cases in
`functions/test/callable.test.js`.
