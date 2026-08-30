# Sprint D6 — corrections and the partner pool

> **Fix what the first five sprints got wrong or left out, then build what was missed.**
> Everything here is small and specific. The component work is [Sprint D7](SPRINT-D7.md).

|                   |                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Branch base**   | `tbtc/dev-anuj` @ `4dde946`                                                                                                                                                                                                                                                                                              |
| **Environment**   | **emulator-first** (owner ruling 2026-08-29). Nothing here touches a cloud project. Migrations run against the local emulator, which is re-seeded from `npm run dataset:build && npm run seed:dataset` — 3,233 documents transformed from the 2026-08-17 live snapshot                                                   |
| **Decisions**     | [DECISIONS-2026-08-29.md](../DECISIONS-2026-08-29.md) — the 2026-08-29 rulings this sprint implements                                                                                                                                                                                                                    |
| **Source**        | [IMPLEMENTATION-REVIEW.md](../IMPLEMENTATION-REVIEW.md) — every item traces to a finding in it                                                                                                                                                                                                                           |
| **Prior sprints** | [D1](../../archive/planning-2026-08-23/sprints/SPRINT-D1.md) · [D2](../../archive/planning-2026-08-23/sprints/SPRINT-D2.md) · [D3](../../archive/planning-2026-08-23/sprints/SPRINT-D3.md) · [D4](../../archive/planning-2026-08-23/sprints/SPRINT-D4.md) · [D5](../../archive/planning-2026-08-23/sprints/SPRINT-D5.md) |
| **Blocking**      | A5 must confirm the test suite passes on `4dde946` **before** anything else starts. Three earlier commits show a failed check and it was never resolved                                                                                                                                                                  |

**Line numbers are `dev-anuj` @ `4dde946`.** Re-check before editing.

---

## Board

| Lane                     | Tasks | Theme                                  |
| ------------------------ | ----: | -------------------------------------- |
| **A1 Rules + Functions** |     9 | C2, C3, C4, C5, C8, C9, C10, F1-server |
| **A2 Data**              |     4 | C3 and C4 backfills, F1-schema         |
| **A3 Client / Dev**      |     8 | C1, C4, C6, C7, C11, F1-client, F2     |
| **A4 UI/UX**             |     5 | C8-book, F1-UI, F2-UI, F3              |
| **A5 Verify**            |    11 | CI first, then a test per correction   |

### Added 2026-08-29

| #       | Item                                            | Lane    | Why it is here and not later                                                                                                                                       |
| ------- | ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C12** | `services` security rules                       | A1      | **C8 cannot be verified without it.** `firestore.rules` has no `services` block at all, so the catalogue falls through to deny and no Book button can be confirmed |
| **C13** | Score margin threshold 10 → 21                  | A1 + A3 | Three layers must change together                                                                                                                                  |
| **C14** | No re-notification on a lower-margin accept     | A1      | Same code path as C13; do them together                                                                                                                            |
| **C15** | **One result model** for challenges and rallies | A1 + A3 | [Ruling 1](../DECISIONS-2026-08-29.md). Rally has **never once** produced a result: 43 opened, 0 completed                                                         |
| **C16** | Re-seat a re-added participant                  | A1 + A3 | The placer never fires for them; blocks the withdrawal round-trip C4 and L12 assume                                                                                |
| **C17** | Four event types                                | A2 + A3 | [Ruling 5](../DECISIONS-2026-08-29.md). Live data holds five, including `tournament` in lower case                                                                 |
| **C18** | Remove per-event draw hiding                    | A3      | [Ruling 4](../DECISIONS-2026-08-29.md). `hide_seniors` / `hide_beginners` go; the Retired Pro draw stays                                                           |
| **C19** | Zone change without approval                    | A1 + A3 | [Ruling 7](../DECISIONS-2026-08-29.md). Organizer is notified, not asked                                                                                           |

---

## Decisions this sprint implements

Taken 2026-08-25. These override the earlier rulings named beside them.

| #   | Decision                                                                                                                                           | Overrides                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | **Points won and total points played are stored again.** Free at write time, and deriving them would cost a full match history per leaderboard row | [L14](../../archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md#L14)         |
| 2   | **`loses` is deleted.** Verified: it is stored, carried through three type definitions, and displayed on no screen                                 | [S1](../../archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md#S1)           |
| 3   | **`tournamentsPlayed` counts events joined**, incremented once when the member joins a tournament, never on a loss                                 | [DC-12](../../archive/planning-2026-08-23/ACTION-REPORT.md#DC-12)                  |
| 4   | **Group matches need not all be played before the knockout is created.** A warning replaces the block                                              | new                                                                                |
| 5   | **A member picks courts, not a zone.** The zone is derived. No approval to change it, and a zone change still places them in **both** draws        | [L15](../../archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md#L15) kept    |
| 6   | **A mistyped address goes to the home page.** No "not found" screen                                                                                | reverses [RT-1](../../archive/planning-2026-08-23/ACTION-REPORT.md#RT-1)           |
| 7   | **The empty-score safety rule stays**                                                                                                              | confirms D13                                                                       |
| 8   | **Knockout size moves both ways in edit mode**, with 4 as the floor                                                                                | reverses the expand-only rule                                                      |
| 9   | **Pool contacts are visible to pool members only**                                                                                                 | refines [L18](../../archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md#L18) |

---

## A5 · Verify — do this first

### ⬛ V1 — Confirm the suite passes on `4dde946`

`npm run verify` runs on every push. Commits `411ffed`, `5cdacee` and `54cea44` show a failed check and nothing records it being fixed. **Establish whether the branch is green before anyone adds to it.** If it is red, report what fails; that becomes task zero.

### ⬛ V2 — A test for every correction

Each must fail on today's code. Priority: **C1** (no test covers the case at all, which is why the bug shipped), then C2, C3, C5.

---

## Corrections

### ⬛ C1 — The knockout gate · A3

**Files** · `src/pages/tournament/useTournament.ts:1301-1307` · `src/pages/tournament/RoundRobinView.tsx:232-241`

**Now**

```ts
const rrKnockoutReady = useMemo(
  () =>
    rrGroupMatches.length > 0 &&
    rrGroupMatches.every((m) => m.status === 'complete' && m.player_1_uid && m.player_2_uid) &&
    rrKnockoutMatches.length === 0,
  [rrGroupMatches, rrKnockoutMatches],
);
```

Two faults. The `every` demands all group matches be complete, which decision 4 removes. And the placeholder guard was ANDed into the predicate instead of filtering the set, so an empty placeholder match returns `false` and the gate stays shut forever — the bug [D1](../../archive/planning-2026-08-23/sprints/SPRINT-D1.md) was meant to close.

**Build**

```ts
// Real matches only. A group left with one player keeps an empty placeholder match
// that can never be played, so it must not count toward readiness or the warning.
const rrRealGroupMatches = useMemo(
  () => rrGroupMatches.filter((m) => m.player_1_uid && m.player_2_uid),
  [rrGroupMatches],
);

const rrGroupUnplayed = useMemo(
  () => rrRealGroupMatches.filter((m) => m.status !== 'complete').length,
  [rrRealGroupMatches],
);

// The organizer may build the knockout whenever they like. Unplayed group matches
// are a warning, not a block, because the group stage runs the whole season.
const rrKnockoutReady = useMemo(
  () => rrRealGroupMatches.length > 0 && rrKnockoutMatches.length === 0,
  [rrRealGroupMatches, rrKnockoutMatches],
);
```

Export `rrGroupUnplayed`, pass it through `Tournament.tsx` to `RoundRobinView`, and show it above the size bar:

> _"{n} group matches still to play. You can build the knockout now and group results will keep counting."_

Update the guard in `handleGenerateRRKnockout` at `:2355` to test `rrRealGroupMatches.length === 0`.

Group matches keep scoring normally after the knockout exists. No change to the result path.

**Done when** · a draw with a one-player group can open the knockout · a draw with unplayed matches can too and shows the count · a draw with no real group matches still cannot · a test covers the one-player group and fails on today's code.

---

### ⬛ C2 — Restore points won and total points played · A1

**File** · `functions/lib/tournamentResult.js:131-150`

The writer was removed but every reader is still live, so **every member's percentage is frozen and new members read a dash forever**. Restore both, to the **played** branch only.

```js
const winnerIsP1 = result.winnerUid === match.player_1_uid;
const loserUid = winnerIsP1 ? match.player_2_uid : match.player_1_uid;
const p1Games = result.scores.reduce((sum, pair) => sum + pair[0], 0);
const p2Games = result.scores.reduce((sum, pair) => sum + pair[1], 0);
const total = p1Games + p2Games;
const award = tournamentAward(match);
for (const uid of creditedUids(result.winnerUid)) {
  addDelta(deltas, uid, {
    matchesPlayed: 1,
    wins: 1,
    ...(award.winnerPointsApply ? { leaguePoints26: award.winnerPoints } : {}),
    league,
    pointswon: winnerIsP1 ? p1Games : p2Games,
    totalPointsPlayed: total,
  });
}
for (const uid of creditedUids(loserUid)) {
  addDelta(deltas, uid, {
    matchesPlayed: 1,
    leaguePoints26: award.loserPoints,
    league,
    pointswon: winnerIsP1 ? p2Games : p1Games,
    totalPointsPlayed: total,
  });
}
```

**Not in the walkover branch.** A walkover has no games, and it already writes no `matchesPlayed` or `wins`. Keep it consistent.

**Not in friendlies or ladder challenges.** They have never counted toward this figure — it is tournament games only. Leave `friendlyPoints.js` and `competitionResults.js` alone.

Reversal is automatic. `mergeStatDeltas(…, -1)` inverts whatever the delta holds, so a rescore stays exact.

**Done when** · a scored match moves both figures for both players · a rescore leaves them equal to a fresh recompute · a walkover moves neither · a test pins all three.

---

### ⬛ C3 — `tournamentsPlayed` counts events joined · A1 + A2

**Files** · `functions/lib/tournamentResult.js:139,148` · `functions/participantWorkflow.js:91`

Today the loser branch adds `tournamentsPlayed: 1` on **every loss**, and the winner only on the final. The original reasoning was that losing a knockout put you out, so the tournament was done. That is redundant now the group stage runs the season.

**Build**

1. Remove `tournamentsPlayed` from both branches of `statDeltasForResult`.
2. In `onParticipantCreated`, when the new participant is for a **tournament** event, increment `stats/{uid}.tournamentsPlayed` by 1.
3. Leave it alone on withdrawal. They did join.

**A2 backfill.** Existing values equal each member's loss count. Recompute as the number of distinct tournament events each member has a participant row for. Dry-run first against the seeded emulator, which carries real production shape and volume. Nothing live is touched, so the diff is safe to apply once read.

**Done when** · joining a tournament increments it once · scoring a match never moves it · the backfill diff is read and approved.

---

### ⬛ C4 — Delete `loses` · A1 + A3 + A2

**Verified: it is displayed on no screen.** It reaches the leaderboard row object and an opponent-panel props type, and neither renders it. The Round Robin group table does show a loss column, but that counts the group's own matches and never touches `stats.loses`.

| File                                                  | What                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `functions/lib/tournamentResult.js:146`               | stop writing it                                                        |
| `functions/friendlyPoints.js`                         | stop writing it — the second writer                                    |
| `functions/competitionResults.js`                     | stop writing it if present                                             |
| `src/types.ts:56` · `src/features/leagues/types.ts:8` | remove the field                                                       |
| `src/lib/firestoreNormalization.ts:260`               | remove                                                                 |
| `src/features/leagues/useStandings.ts:55`             | remove from the row                                                    |
| `src/pages/tournament/OpponentPanels.tsx:25`          | remove the unused prop, and the value passed at `useTournament.ts:746` |
| `src/lib/profileBootstrap.ts:23`                      | remove from the seed                                                   |

**A2:** a migration stripping the field from `stats`. Dry-run first.

**Done when** · `grep -rn "\bloses\b" src/ functions/` returns nothing outside prose · `npm run typecheck` clean · nothing on any screen changes.

---

### ⬛ C5 — Delete the third award table · A1

**File** · `functions/withdrawalWorkflow.js:10,11,72`

**[Ruling 15](../DECISIONS-2026-08-29.md) simplifies this.** C5 originally planned to make the withdrawal path *import* the shared `tournamentAward`. It no longer needs an award table at all.

**The withdrawing player gets a flat +1 per unplayed match.** So:

```js
const points = rr ? 1 : withdrawalAward(current.round);   // :72 — becomes a flat 1
```

Delete `AWARDS` (`:10`), `withdrawalAward` (`:11`) and the export. Three award tables become **two by removal**, not by sharing. Check for test consumers first.

The opponent side is unchanged — Round Robin still pays them 1, knockout still advances them (`:76-80`).

> **The two surviving tables agree by accident.** `scoring.ts:38` and `tournamentResult.js:92` both carry `RR: 1`; the one being deleted omits `RR` entirely and falls through to `|| 1`. It has always matched by coincidence rather than construction. [D7 group 6](SPRINT-D7.md) removes the browser copy and leaves one.

**"Does not count toward matches played" already holds.** The withdrawal writes the match patch directly (`:55-70`) rather than going through the result callable, so it never touches `matchesPlayed` or `wins`. No change needed — **but pin it with a test**, because routing this through the result path later would silently start counting them.

**Done when** · a withdrawing player gains exactly 1 point per unplayed match regardless of round · `matchesPlayed` and `wins` are untouched, with a test · `grep -c "R32: 1" functions/` returns 1.

---

### ⬛ C6 — Rename the booking stamp · A3 + A1

`completion_requested_at` → **`marked_completed_at`**. Nothing is requested; the stringer is stating the job is done.

| File                                            | Line                     |
| ----------------------------------------------- | ------------------------ |
| `functions/bookings.js`                         | `:86` set · `:108` clear |
| `functions/lib/bookingState.js`                 | `:21`                    |
| `src/features/services/types.ts`                | `:100`                   |
| `functions/test/bookingState.test.js`           | `:5`, `:8`               |
| `tests/integration/functions.emulator.test.mjs` | `:209`                   |

One test booking exists and it is cancelled, so no migration is needed.

---

### ⬛ C7 — Delete dead code · A3

| Where                                          | What                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/events/hooks/useJoin.ts:158-162` | The unreachable `'full'` and `'fallback'` branches. `slotStatus` is permanently `null`; these are the old refusal and the path that **rewrote a member's skill level**. Remove the branches, the `slotStatus` memo, `slotFallbackConfirmed`, and the `SlotResult` type if nothing else uses it |
| `src/pages/tournament/rrGeneration.ts:348`     | `selectGroupWinners` — exported, no callers. **Delete it** ([ruling 9](../DECISIONS-2026-08-29.md)): [D8](SPRINT-D8.md) builds a fresh `seeding.ts` instead of reviving the stub, so nothing depends on it. Remove the `advancingPlayers` plumbing if `buildRRKnockoutDocs` no longer needs it |

**Done when** · `npm run typecheck` clean · `grep -rnE "slotStatus|selectGroupWinners" src/` returns nothing.

---

### ⬛ C8 — Remove group lessons and the booking lock; confirm the Book button · A1 + A2 + A4

`GroupLessonCard` is already gone from the UI. What remains is server-side.

| Where                                             | What                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firestore.rules:707`                             | delete the `group_lessons` block                                                                                                                                                                                                                                                                                                                                                                                        |
| `functions/rewards.js:98,150`                     | delete the two functions reading `group_lessons/{month}`                                                                                                                                                                                                                                                                                                                                                                |
| `firestore.rules` contacts read                   | **Replace `isCurrentGroupLessonCoachFor` — do not simply delete it** ([ruling 8](../DECISIONS-2026-08-29.md)). The coach↔player rule **returns**, rebuilt against the **coaching session** on the lesson add-on block rather than the retired `group_lessons` collection. Contacts then read: owner · connection · event organizer for their own participants · coach and player of a shared coaching session, mutually |
| `firestore.rules:641` · `functions/rewards.js:36` | delete `redemption_locks` and `redemptionLockRef`                                                                                                                                                                                                                                                                                                                                                                       |
| `functions/test/redemptionLock.test.js`           | delete with it                                                                                                                                                                                                                                                                                                                                                                                                          |

**A4:** `bookService` exists in `src/features/services/servicesApi.ts:21` but no Book control was found in the Services UI. **Confirm one exists on each service card and add it if not.** It is the entry point to the whole booking flow shipped in [D5](../../archive/planning-2026-08-23/sprints/SPRINT-D5.md).

---

### ⬛ C9 — No-show leftovers · A1

- `firestore.rules:529` still whitelists `no_show`. **A client can still set it.** Remove it from the whitelist.
- `functions/lib/adminMetricsCompute.js:112` still branches on it. Remove the branch; the metric becomes walkover or played.

---

### ⬛ C10 — Retire `result_application` · A1

[L3](../../archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md#L3) said the idempotency hash moves inside `result_submissions`. Both exist today.

**File** · `functions/tournamentResults.js:212, 223, 307`

The duplicate check requires both:

```js
if (existingSubmission?.hash === hash && match.result_application?.hash === hash) { … }
```

Move the applied hash into `result_submissions` by marking the applied submission with `applied: true`, and test against that. The `!!target.data.result_application` check at `:223` becomes a check for any applied submission.

**Lowest priority of the corrections.** If the sprint runs long, defer it. This is tidiness, not behaviour.

---

### ⬛ C11 — Mistyped addresses go home · A3

**File** · `src/App.tsx:42, :173`

Replace the catch-all with `<Route path="*" element={<Navigate to="/" replace />} />`, delete the lazy import at `:42`, delete `src/pages/NotFound.tsx`. **Keep `replace`** so Back does not re-enter the redirect.

---

### ⬛ C12 — `services` security rules · A1

**File** · `firestore.rules` — insert at **:303**, between the `providers` block (299-302) and `bookings` (304-314).

```
// The catalogue is public so a logged-out visitor can browse what is on offer. Writes are
// owner-gated through a callable; booking is members-only because every booking transition
// goes through Functions, which require auth.
match /services/{serviceId} {
  allow read: if true;
  allow write: if false;
}
```

Nothing else is needed for "members can book, visitors cannot": `bookings` is already `allow write: if false` (:313) with reads scoped to owner, super-admin or linked provider (:306-312).

**Deferred — provider contact.** Booking will create a connection keyed on `services.provider_id` → `providers/{providerId}`, and the contact button plus booking number appear once the member books or the provider accepts. Same shape as the opponent `connections/{a__b}` mechanism. **Not this sprint.** While it is deferred, note that `contact_phone` and `contact_email` sit on the world-readable service document, so they are readable by anyone querying the collection directly.

**Done when** · an anonymous read of `services` succeeds · an authenticated write is denied · a super-admin write is denied · C8's Book button can be confirmed.

---

### ⬛ C13 — Score margin threshold 10 → 21 · A1 + A3

Any score above **21** must have a margin of exactly 2. Below or at 21, no margin rule.

| File                                                | Line  | Change                      |
| --------------------------------------------------- | ----- | --------------------------- |
| `firestore.rules`                                   | 161   | `high <= 10` → `high <= 21` |
| `functions/lib/tournamentResult.js`                 | 44-45 | condition and message text  |
| `src/features/tournament/domain/scoreSubmission.ts` | 26-27 | same                        |

**All three in one commit.** This project has a documented incident where two copies of a scoring rule drifted apart and players were shown points nobody had paid.

**One contract example flips.** Of the twelve in the harmonization report, `12-2` moves from **invalid to valid** — 12 is under the threshold, so no margin applies. `40-0` and `90-40` stay invalid; `24-22`, `38-40` and `94-92` stay valid.

> **Finding F-E is stale.** It records that the margin rule "exists in no layer" and that Rules cap scores at 0-7. Both were fixed since: `firestore.rules:156` allows 0-99 and `:159` implements the margin. All three layers already agree — this change moves one number in each.

**Done when** · `21-19` valid · `22-19` rejected · `12-2` accepted · one test per layer.

---

### ⬛ C14 — No re-notification when a lower score is accepted · A1

**File** · `functions/tournamentResults.js` — the `result.margin < oldResult.margin` path falling out of the guard at **:266** into the apply block.

Today a same-winner reconcile re-applies and notifies both players again. The result did not change hands and the players already know the outcome, so the second notification is noise. Thread a flag through the apply path so a reconcile applies silently.

The neighbouring branch at `:266-268` (margin greater or equal) already returns `notices: []` — match it.

> Per finding **F-M**, once `loses` is derived and games stop being stored, a same-winner reconcile has **no stat consequences at all** — every surviving delta depends on winner, round and format. So this path is a pure score-field update, which is exactly why it should not notify.

**Done when** · a lower-margin resubmission updates the score and sends nothing · a winner change still notifies · a dispute still notifies the organizer once.

---

### ⬛ C15 — One result model for challenges and rallies · A1 + A3

**Ruling [1](../DECISIONS-2026-08-29.md).** Measured: rally **43 opened, 0 ever reached a result**. Challenge 5 of 31. Both ran a five-state handshake with different words for identical states.

**Files** · `functions/competitionResults.js` · `functions/notifications.js:262-366` · `src/pages/tournament/useTournament.ts`

**Build** — challenges and rallies adopt the tournament result model exactly:

| Rule                                            | Change                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Either player submits                           | The result callable opens to both players, as it already did for tournaments                                                    |
| **Applies immediately**                         | Delete the `accepted → reported → confirmed` handshake. No organizer confirmation on challenges                                 |
| Two submissions, same winner, lower margin wins | Shared with the tournament path                                                                                                 |
| Two submissions, different winners              | `score_disputed` flag; first result stays applied; organizer resolves                                                           |
| **A rally score is optional**                   | A rally is a way to earn extra points. If neither player submits, nothing is recorded, no points are paid, and nobody is chased |
| Walkovers                                       | Tournaments only, organizer-only, stored                                                                                        |

**Retires** the rally `disputed` dead end (finding **F-K** — nothing transitioned out of it).

**Notifications.** A declined challenge notifies **the player who created it**. Decline and reject are one event; `declined` is the surviving word ([ruling 2](../DECISIONS-2026-08-29.md)).

> `ladder_cancelled` (`notifications.js:358`) stays what it is — the _challenger_ withdrawing their own open challenge, notifying the person challenged. A decline is the opposite direction and needs its own notification.

**Done when** · either player can submit on a challenge and a rally · the score applies with no confirmation step · a second submission with a different winner flags a dispute · an unsubmitted rally pays nothing and is never chased · declining notifies the creator · `grep -rn "'rejected'" src/ functions/` returns nothing.

---

### ⬛ C16 — Re-seat a re-added participant · A1 + A3

**Files** · `functions/participantWorkflow.js:91` (`onParticipantCreated`) · `:66` (`seatParticipant`) · `:73` (`choosePlacement`)

A player who withdraws and is re-added is **never placed**, for two independent reasons:

1. **No trigger fires.** The placer is `onDocumentCreated`. Re-adding flips `status` back to `active`, which is an _update_, so `seatParticipant` never runs.
2. **No slot exists.** `choosePlacement` looks for an open `PLAYER_LOADING` slot. After generation there are none, so it returns `null`.

**Owner ruling 2026-08-29 — option B.** The organizer adds them to a group. Their matches count for **group points only**; the knockout is untouched and is never rebuilt around them.

**Build**

1. Add an `onDocumentUpdated` path on `event_participants` firing when `status` goes `withdrawn → active`.
2. Extend `choosePlacement` so it can **create** group matches for the re-added player rather than only fill an empty slot.
3. Never touch knockout matches. If the knockout for that draw already exists, the player joins the group stage only.

**Done when** · a withdrawn player re-added before generation is seated normally · re-added after generation gets group matches and no knockout slot · an existing knockout is unchanged · a test covers the re-add round trip.

---

### ⬛ C17 — Four event types · A2 + A3

**Ruling [5](../DECISIONS-2026-08-29.md).** `Socials` · `Tournaments` · `Specials` · `League Ladder`. Nothing else.

Live data holds **five values across ten events**, including **`tournament` in lower case** beside `Tournament`. That is a data defect, so this needs a migration as well as a validator.

**Build** · constrain the type on the event-creation modal · **A2 migration** normalising the one lower-case row · reject anything outside the four on write.

**Done when** · the modal offers exactly four types · no event carries a value outside them · the casing split is gone. Closes [BLG0019](../../BACKLOG.md).

---

### ⬛ C18 — Remove per-event draw hiding · A3

**Ruling [4](../DECISIONS-2026-08-29.md).** Delete `hide_seniors` and `hide_beginners`.

**Files** · `src/pages/tournament/useTournament.ts:216-217` (the two filter lines) and `:256-257` (the deps) · `src/lib/firestoreNormalization.ts:108-109` · `src/types.ts`

**The Retired Pro draw itself survives.** It is a separate, league-gated concept (`useJoin.ts:140-142`), not the toggle. Same for Beginners. What goes is the per-event ability to hide either draw.

**Done when** · both draws always render · `grep -rn "hide_seniors|hide_beginners" src/` returns nothing · a migration strips the fields.

---

### ⬛ C19 — Zone change without approval · A1 + A3

**Ruling [7](../DECISIONS-2026-08-29.md).** A member selects zones freely. **The organizer is notified, not asked.**

Folds into [F2](#f2). The tournament page's "Request Zone Change" (`TournamentElements.tsx:91`) becomes a direct change, matching the profile card. One path, not two.

**Done when** · changing zone needs no approval anywhere · the organizer receives a notification · no approval UI remains.

---

## Features

### ⬛ F1 — The doubles partner pool · all lanes

**The join sheet already promises this.** `EventsElements.tsx:679` reads _"No partner yet? Leave this blank to join the event's partner pool."_ and no pool exists. A member who leaves that field blank today joins nothing.

#### A2 — Schema

Two subcollections under the event, so a security rule can check membership with one lookup.

```jsonc
// partner_pool/{eventId}/members/{uid}       ← the list, any signed-in member may read
{
  "uid": "…",
  "name": "Rahul Lal",
  "category": "mens",        // 'mens' | 'womens' | 'mixed'
  "skill": 3.5,
  "created_at": "2026-08-25T…"
}

// partner_pool/{eventId}/contacts/{uid}      ← pool members only, written by the server
{
  "whatsapp": "…",
  "phone": "…",
  "email": "…"
}
```

The document id is the uid, so rejoining is a no-op rather than a duplicate. `category` mirrors the division the member registered in, so a men's-doubles player never sees the women's pool.

#### A1 — Rules

```
match /partner_pool/{eventId}/members/{uid} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated() && uid == request.auth.uid &&
    request.resource.data.keys().hasOnly(['uid','name','category','skill','created_at']);
  allow update: if false;
  allow delete: if isAuthenticated() && (uid == request.auth.uid || isManagerOfEvent(eventId));
}

match /partner_pool/{eventId}/contacts/{uid} {
  allow read: if isAuthenticated() &&
    exists(/databases/$(database)/documents/partner_pool/$(eventId)/members/$(request.auth.uid));
  allow write: if false;   // server only
}
```

> **Rules do not cascade into subcollections.** Each path needs its own `match` block at the full nested path. This is the exact trap that silently broke Round Robin drafts for months — the rule existed at the wrong level, every write was denied, and the error path swallowed it. **Verify a write actually lands before moving on.**

#### A1 — Triggers

**`onPartnerPoolJoin`** — on create of `partner_pool/{eventId}/members/{uid}`:

1. Write `partner_pool/{eventId}/contacts/{uid}` from the member's `contacts` document, carrying only the channels they have filled in.
2. Notify every **other** member in the same event **and** the same `category`:

> **"A new player is waiting to partner up!"** — _{name} joined the {category} doubles pool for {event}._

Link to the pool panel. Do not notify the joiner.

**`onPartnerPoolLeave`** — on delete: delete the matching contacts document. **Access ends with membership.**

#### A3 — Client

- `src/features/events/services/partnerPool.ts` — `joinPool`, `leavePool`, `usePool(eventId, category)` live subscription, `usePoolContacts(eventId)` which only resolves for members.
- Join sheet: leaving the partner field blank **joins the pool** on submit. Make the existing hint true.
- Choosing a partner from the pool **removes both rows**, in the same batch as `setDoublesPartner`.
- A member may leave the pool without choosing anyone.

#### A4 — UI

Three states on the doubles tournament tab:

| The member is…                            | What they see                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **In the pool**                           | The pool panel is **open by default**, listing every member with name, skill and full contact buttons. A **Partner pool** button re-opens it if they close it by mistake |
| **Paired**                                | They see the draw. A **Partner pool** button opens the list — names and skill only, **no contact buttons**                                                               |
| **In the doubles event, not in the pool** | Same as paired: the list, no contacts                                                                                                                                    |

Contacts come from the `contacts` subcollection, which only resolves for members. Reuse `contactChannels` from `ContactOpponentButton` — do not build a second contact control. A denied read is expected for non-members and must not surface as an error.

Empty state: _"Nobody is waiting yet. Join the pool and other players looking for a partner will see you."_

#### A5 — Tests

Joining creates one row · rejoining is a no-op · every other member of the same category is notified and the joiner is not · a men's player never sees the women's pool · **a non-member reading the contacts subcollection is denied** · choosing a partner removes both rows and both contact documents · leaving removes the contact document.

---

### ⬛ F2 — Courts, not zones, at join · A3 + A4

**Files** · `src/features/events/hooks/useJoin.ts:112, 132-133` · `src/features/events/EventsElements.tsx:612-627` · `src/pages/tournament/TournamentElements.tsx:91` · `src/features/profile/components/ProfileInfo.tsx:266`

**Now** the join sheet shows a row of **zone** chips and blocks on a missing zone. The member picks a zone directly.

**Build**

1. **Replace the zone chips with a court multi-select.** Several courts, matching the profile shape. Derive the zone through the existing `resolveZone` and set `preferred_zone_manual` on an explicit pick.
2. **Add a link below the picker** to `/courts` (`App.tsx:167`), opening the map **with all courts and the zone layers visible**, so a member can see which zone a court sits in before choosing.
3. **Keep the gate**, but test courts rather than zone: the join is blocked until at least one court is chosen.
4. **Tournament tab:** `TournamentElements.tsx:91` reads _"Request Zone Change"_ and raises a request an organizer must approve. **Make it a direct change.** No request, no approval. Keep writing `req_zone_change` so the organizer still sees the notice, but drop the approval step.
5. **Profile card:** the zone sheet at `ProfileInfo.tsx:266` already changes zone directly. Add the same `/courts` link beneath it.
6. **A zone change still places the member in both draws.** `onZoneChanged` is unchanged. The organizer is informed, not asked.
7. **A custom court name is accepted.** The member's zone resolves to **none**. Then:
   - Notify **the event organizer and the super-admin**: review the court and add it to the courts list.
   - The member appears in **Unplaced** with **"No zone"**.
   - **The placer never guesses a zone for them.** They wait there until the organizer assigns a zone and adds them to a draw.

**Done when** · a member with no courts cannot join until they pick at least one · the zone is derived, never typed · the courts link opens the map with zone layers on · changing zone needs no approval and never unseats anyone · an unmapped court raises a notice and lands the member in Unplaced with no zone.

---

### ⬛ F3 — Knockout size moves both ways, in edit mode · A3 + A4

**File** · `src/pages/tournament/useTournament.ts:2354-2385` · `src/pages/tournament/RoundRobinView.tsx:52-70`

**Now** the guard is expand-only:

```js
if (existingSize > 0 && (!size || size <= existingSize)) {
  setMessage({ type: 'error', text: `Knockout can only expand beyond ${existingSize} slots.` });
  return;
}
```

Decision 8 replaces that rule.

**Build**

| Rule      | Detail                                                                                                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction | **Both ways** — 4↔8, 8↔16                                                                                                                                                                                                         |
| Floor     | **4 is the smallest size.** Nothing below it                                                                                                                                                                                      |
| When      | **Only while the draw is in edit mode.** Outside edit mode the size bar is read-only                                                                                                                                              |
| Growing   | Unchanged. Existing matches are kept; only new slots are written                                                                                                                                                                  |
| Shrinking | **Refuse if any slot being dropped holds a generated or played match.** The message names them: _"Cannot reduce to {n}: {x} matches already exist in the slots that would be removed."_ Otherwise delete the empty slot documents |
| Always    | **A recorded score is never deleted.** That rule has not changed                                                                                                                                                                  |

**Done when** · 8→16 keeps every existing match · 16→8 with an empty upper half succeeds · 16→8 with a played match in the upper half is refused, naming it · the bar is inert outside edit mode · 4 cannot be reduced further.

---

## Exit gate

| Check     | Passes when                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| CI        | `npm run verify` green on the sprint branch                                                                                    |
| C1        | A one-player group no longer blocks the knockout; the warning shows the unplayed count; a test fails on old code               |
| C2        | Points won moves on every scored match for both players, and reverses exactly                                                  |
| C3        | `tournamentsPlayed` moves on join and never on a result; backfill diff approved                                                |
| C4        | `loses` gone from code and data; no screen changes                                                                             |
| C5        | One award table in `functions/`                                                                                                |
| C8        | `grep -rn "group_lessons\|redemption_locks" firestore.rules functions/` returns nothing; a Book button exists on every service |
| C9        | `grep -rn "no_show" firestore.rules functions/` returns nothing                                                                |
| C11       | `/nonsense` lands on home with no history entry                                                                                |
| C12       | An anonymous read of `services` succeeds; every write is denied; C8's Book button is confirmable                               |
| C13       | `21-19` valid, `22-19` rejected, `12-2` accepted — in all three layers                                                         |
| C14       | A lower-margin resubmission changes the score and sends no notification                                                        |
| C15       | Declining and confirming a challenge both notify; `ladder_cancelled` still means the challenger withdrew                       |
| C16       | A re-added participant gets group matches; the existing knockout is untouched                                                  |
| F1        | The seven pool tests pass, including the denied contact read for a non-member; the join-sheet hint is now true                 |
| F2        | The five zone conditions, and an unmapped court lands the member in Unplaced                                                   |
| F3        | The five size conditions                                                                                                       |
| **Setup** | Port 8080 is free, the six Windows launcher patches are committed, and `test:e2e` has run at least once                        |

---

## Not in this sprint

The 13 remaining shared components and the consolidation of 83 card surfaces — [Sprint D7](SPRINT-D7.md).
Knockout seeding, the coaching pool, and the workflow and legal documents — [Sprint D8](SPRINT-D8.md).

**`selectGroupWinners` is deleted here.** [Sprint D8](SPRINT-D8.md) builds `src/features/tournament/domain/seeding.ts` from scratch — see [ruling 9](../DECISIONS-2026-08-29.md).
