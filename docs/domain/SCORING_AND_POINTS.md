# Scoring and points

## No-show precedence

**Rule:** A no-show is evaluated before winner or walkover logic. Both players receive one point;
there is no winner, score, win/loss, or played-match credit.

**Why:** A no-show and a walkover can both have all-zero games, but they have different business
meaning and different advancement consequences.

**Important exception:** No-show reversal removes the same one-point award and does not attempt to
reverse winner/loser statistics.

**Code:** `src/features/tournament/domain/scoring.ts`,
`src/pages/tournament/useTournament.ts`.

**Regression test:** `tests/unit/domain.test.mjs`.

## Match awards

**Rule:** A Round Robin group-stage winner receives three points immediately and the loser receives
one. Knockout winner points are applied only in the final; the loser award follows the established
round table: R32=1, R16=2, QF=3, RR=1, SF=5, F=10.

**Why:** Group-stage standings and knockout progression use different point timing while sharing
one calculation.

**Important exception:** A walkover has a winner and follows normal winner/loser handling even
when its game fields are zero.

**Code:** `src/features/tournament/domain/scoring.ts` and its compatibility export in
`src/pages/tournament/utils.ts`.

**Regression test:** `tests/unit/domain.test.mjs`; client counter-minting protections in
`tests/rules/firestore.rules.test.mjs`.
