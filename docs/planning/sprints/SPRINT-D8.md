# Sprint D8 — seeding, the coaching pool, and the workflow record

> **Knockout seeding, the deferred service work, and the documents that were never written.**
> [Sprint D6](SPRINT-D6.md) and [Sprint D7](SPRINT-D7.md) must land first — both for real dependencies, listed below.

|                   |                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Branch base**   | Sprint D7 merge                                                                                                                                                                                                                                                                |
| **Environment**   | **emulator-first.** Nothing here touches a cloud project.                                                                                                                                                                                                                      |
| **Source**        | Owner rulings 2026-08-28 and 2026-08-29                                                                                                                                                                                                                                        |
| **Prior sprints** | [D6](SPRINT-D6.md) · [D7](SPRINT-D7.md)                                                                                                                                                                                                                                        |
| **Decisions**     | [DECISIONS-2026-08-29.md](../DECISIONS-2026-08-29.md) — rulings 9 (seeding, `selectGroupWinners`), 2 (vocabulary), 8 (contacts)                                                                                                                                                |
| **Blocking**      | **S1 cannot start before [D6 C2](SPRINT-D6.md).** The seeding tiebreak reads P/G won %, which is computed from `pointswon` / `totalPointsPlayed` — restored by C2. **S3 cannot start before [D7 CS-3b](SPRINT-D7.md)**, which builds the row slot the seed number renders into |

---

## Why this sprint is third

| Depends on | Item                   | Consequence of running it early                                                                                                    |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D6 C2      | S1 seeding tiebreak    | P/G won % is frozen at whatever was last written; every tiebreak resolves wrong                                                    |
| D6 C7      | S1 clean slate         | C7 deletes `selectGroupWinners` ([ruling 9](../DECISIONS-2026-08-29.md)); S1 builds `seeding.ts` fresh rather than reviving a stub |
| D6 C1      | S2 RR knockout seeding | The knockout gate is pinned shut, so there is no knockout to seed                                                                  |
| D7 CS-3b   | S3 seed display        | No row slot exists; the number has nowhere to render                                                                               |

---

## Board

| Lane                     | Tasks | Theme                                     |
| ------------------------ | ----: | ----------------------------------------- |
| **A1 Rules + Functions** |     2 | S2 standings source, S5 workflow triggers |
| **A3 Client / Dev**      |     4 | S1, S2, S4                                |
| **A4 UI/UX**             |     1 | S3                                        |
| **A5 Verify**            |     4 | A test per seeding rule                   |

---

## Decisions this sprint implements

Taken 2026-08-29.

| #   | Decision                                                                                                  | Overrides                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | **Knockout seeding returns.** Seeds place the draw automatically; every slot stays organizer-reassignable | reverses [R-4](../../archive/planning-2026-08-23/ACTION-REPORT.md#R-4) / Sprint D4 "no ordering" |
| 2   | **Rank is the live leaderboard position** computed from `leaguePoints26` at join time                     | new                                                                                              |
| 3   | **Seed counts: draw 4 → 2, 8 → 4, 16 → 8, 32 → 10.** Half the draw, capped at 10                          | new                                                                                              |
| 4   | **Seeds freeze when matches are generated.** A later entrant takes an open slot and renumbers nobody      | new                                                                                              |
| 5   | **Ties break alphabetically by name.** No two players share a rank. Joining earlier earns nothing         | new                                                                                              |
| 6   | **Round Robin group formation is unchanged** — zone, then skill, then courts. Seeding is knockout-only    | confirms `buildZoneTierGroups`                                                                   |

---

## S1 · The seeding engine · A3

**New file** · `src/features/tournament/domain/seeding.ts` — pure functions, no Firestore, unit-testable in isolation.

### Seed count

```ts
// Half the draw, capped at 10. 4→2, 8→4, 16→8, 32→10.
export const seedCount = (drawSize: number) => Math.min(Math.floor(drawSize / 2), 10);
```

### Ordering

Entry seeding is the live leaderboard position, computed from `leaguePoints26` at the moment of the join — not `stats.rankPosition`, which is a weekly snapshot and would seed a player on rank up to six days stale.

| Order | Criterion                                                                     |
| ----- | ----------------------------------------------------------------------------- |
| 1     | `leaguePoints26`, descending                                                  |
| 2     | P/G won % — `pointswon / totalPointsPlayed` (**needs [D6 C2](SPRINT-D6.md)**) |
| 3     | Name, ascending, case-insensitive                                             |

Rule 3 makes the order total: **no two players share a seed.** Join time is deliberately not a criterion — entering early earns nothing.

### Placement

The standard recursive anchor construction, so seeds meet as late as the draw allows:

```ts
// [1] → [1,2] → [1,4,2,3] → [1,8,4,5,2,7,3,6] …
// Seed 1 top, seed 2 in the opposite half, 3 and 4 anchoring the other quarters.
export const seedAnchors = (drawSize: number) => {
  let order = [1];
  while (order.length < drawSize) {
    const n = order.length * 2;
    order = order.flatMap((x) => [x, n + 1 - x]);
  }
  return order;
};
```

Byes go to the top seeds first. Unseeded players fill the remaining slots in entry order.

**Done when** · `seedCount` returns 2/4/8/10 for 4/8/16/32 · an 8-draw yields `[1,8,4,5,2,7,3,6]` · two players on equal points and equal P/G % order alphabetically · a third player joining above both renumbers them 2 and 3 · every function is covered by a unit test with no emulator.

---

## S2 · Wire seeding into the draws · A1 + A3

**Files** · `:361` (`buildRRKnockoutDocs`) · `:278` (`computeGroupStandings`) · `src/pages/tournament/types.ts:26-32`

1. `TournamentPlayer` gains `seed?: number`.
2. Order the knockout from `computeGroupStandings` using the new `seeding.ts`. `selectGroupWinners` is **deleted by [D6 C7](SPRINT-D6.md)** and is not revived ([ruling 9](../DECISIONS-2026-08-29.md)).
3. `buildRRKnockoutDocs` places by `seedAnchors` rather than fill order.

**Round Robin knockout seeding** uses a different source from entry seeding, per the owner:

| Order | Criterion                                       |
| ----- | ----------------------------------------------- |
| 1     | Group points, across **all** groups in the draw |
| 2     | P/G won %                                       |
| 3     | Leaderboard rank                                |
| 4     | Name, ascending                                 |

No circularity here — group points and leaderboard rank are independent measures. (Entry seeding cannot use rule 3, because there the seed _is_ the leaderboard rank; that is why it falls straight to name.)

**Scope is one draw.** Draws split by zone × skill group × division, so seed 1 is the top player _in that bracket_. Seeding across zones would leave some draws with no seed 1 and others with several.

**`buildZoneTierGroups` (`:45`) is not touched.** Group formation stays zone → skill → courts (decision 6).

**Done when** · a generated knockout places seed 1 top and seed 2 in the opposite half · seeds 3 and 4 anchor the other quarters · byes land on the top seeds · regenerating the same draw produces the same bracket · group formation is byte-identical to D7.

---

## S3 · Seed display · A4

Render `(1)` before the name in the `seed` slot [D7 CS-3b](SPRINT-D7.md) provides. Only seeded players show a number; unseeded rows render nothing, not `(0)`.

The badge counts against group 7's two-stats-per-row budget at 360px. If a row already carries two numbers, the seed replaces one — it does not become a third.

**Done when** · seeded rows show the number in bracket, draw list and standings · unseeded rows show nothing · every row type still fits 360px.

---

## S4 · Seeds freeze at generation · A3

Before matches exist, seeds recompute on every join — a stronger player joining takes seed 1 and pushes everyone down. The moment the draw is generated, the seeding is fixed.

A later entrant takes an open slot and **renumbers nobody**. Nobody already playing is ever moved.

**Done when** · joining an ungenerated draw reorders the seeds · joining a generated draw changes no existing seed · an organizer moving a player by hand keeps that player's seed number.

---

## S5 · The workflow record · A1

Additions to `docs/archive/planning-2026-08-23/notes/WORKFLOW-STATES.md`.

> **Append, do not renumber.** The sprint documents cite that file by section number ("section 0", "section 16"); inserting a section would break every live cross-reference.

| Where                      | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§15.3**, after `:604`    | **The coaching pool.** Same batches-of-four pool as the deferred lesson add-on — see [DATA_SHAPE.md §9](../../architecture/DATA_SHAPE.md). A member signing up for a social is offered group classes, games or coaching; choosing coaching pools them; coaches take a batch of four. Storage follows [D6 F1](SPRINT-D6.md)'s precedent — a `lesson_pool/{eventId}/members/{uid}` subcollection, because batching four players across an event is **not** derivable from a participant row the way the doubles pool is |
| **§19**, new, after `:642` | **Account creation.** The sign-up journey: email gate → password → profile completion. Covers `checkSignupEmail` throttling, the duplicate-address path through `contacts.secondary_email`, and `profileBootstrap`                                                                                                                                                                                                                                                                                                    |
| **§16**, at `:605`         | Status vocabulary rows for both                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**The coaching pool inherits five unanswered questions** from DATA_SHAPE §9 — the $20 vs $15 tiers, the "free 15/hr" contradiction, where the fee sits against `services` and `bookings`, and whether games hold state. **This sprint documents the target; it does not build it.**

---

## Also in this sprint

**Restore `stats.rankPosition`.** [DC-11](../../archive/planning-2026-08-23/ACTION-REPORT.md#DC-11) deleted it as "written, rendered nowhere". That premise is wrong — `functions/rankSnapshot.js` writes it and `Leagues.tsx`, `Profile.tsx` and `useStandings.ts` all read it. Seeding gives it a second consumer.

**Update the data shape.** `tests/fixtures/shape-reference.mjs` and `scripts/build-sample-dataset.mjs` still encode the pre-D6 rulings. Seven corrections: `pointswon` and `totalPointsPlayed` restored, `tournamentsPlayed` kept with new meaning, `rankPosition` restored, `completion_requested_at` → `marked_completed_at`, the partner pool stored rather than derived, `result_application` retired, and D7's `points_winner` / `points_loser` added. `npm run dataset:build` must stay green.

---

## Exit gate

| Check | Passes when                                                                       |
| ----- | --------------------------------------------------------------------------------- |
| CI    | `npm run verify` green                                                            |
| S1    | Seed counts, anchor order and the alphabetical tiebreak each have a unit test     |
| S2    | A regenerated draw is identical; group formation unchanged from D7                |
| S3    | Seeded rows show the number and still fit 360px                                   |
| S4    | A late entrant renumbers nobody in a generated draw                               |
| S5    | Both workflow sections appended; no section renumbered; no cross-reference broken |
| Shape | `npm run dataset:build` green with all seven corrections applied                  |

---

## Not in this sprint

**The lesson add-on itself** — documented in S5, not built. **Provider contact through a booking connection** — the design is recorded in [D6 C12](SPRINT-D6.md); the implementation is deferred. **Reseeding a generated draw** — decision 4 forbids it.
