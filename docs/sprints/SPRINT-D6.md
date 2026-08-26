# Sprint D6 — corrections and the partner pool

> **Fix what the first five sprints got wrong or left out, then build what was missed.**
> Everything here is small and specific. The component work is [Sprint D7](SPRINT-D7.md).

| | |
| --- | --- |
| **Branch base** | `tbtc/dev-anuj` @ `4dde946` |
| **Environment** | **staging** — this branch deploys to a staging project, not production. Data changes here are recoverable by re-seeding |
| **Source** | [IMPLEMENTATION-REVIEW.md](../notes/IMPLEMENTATION-REVIEW.md) — every item traces to a finding in it |
| **Prior sprints** | [D1](SPRINT-D1.md) · [D2](SPRINT-D2.md) · [D3](SPRINT-D3.md) · [D4](SPRINT-D4.md) · [D5](SPRINT-D5.md) |
| **Blocking** | A5 must confirm the test suite passes on `4dde946` **before** anything else starts. Three earlier commits show a failed check and it was never resolved |

**Line numbers are `dev-anuj` @ `4dde946`.** Re-check before editing.

---

## Board

| Lane | Tasks | Theme |
| --- | --: | --- |
| **A1 Rules + Functions** | 9 | C2, C3, C4, C5, C8, C9, C10, F1-server |
| **A2 Data** | 4 | C3 and C4 backfills, F1-schema |
| **A3 Client / Dev** | 8 | C1, C4, C6, C7, C11, F1-client, F2 |
| **A4 UI/UX** | 5 | C8-book, F1-UI, F2-UI, F3 |
| **A5 Verify** | 7 | CI first, then a test per correction |

---

## Decisions this sprint implements

Taken 2026-08-25. These override the earlier rulings named beside them.

| # | Decision | Overrides |
| --- | --- | --- |
| 1 | **Points won and total points played are stored again.** Free at write time, and deriving them would cost a full match history per leaderboard row | [L14](../notes/HARMONIZATION_REPORT.md#L14) |
| 2 | **`loses` is deleted.** Verified: it is stored, carried through three type definitions, and displayed on no screen | [S1](../notes/HARMONIZATION_REPORT.md#S1) |
| 3 | **`tournamentsPlayed` counts events joined**, incremented once when the member joins a tournament, never on a loss | [DC-12](../ACTION-REPORT.md#DC-12) |
| 4 | **Group matches need not all be played before the knockout is created.** A warning replaces the block | new |
| 5 | **A member picks courts, not a zone.** The zone is derived. No approval to change it, and a zone change still places them in **both** draws | [L15](../notes/HARMONIZATION_REPORT.md#L15) kept |
| 6 | **A mistyped address goes to the home page.** No "not found" screen | reverses [RT-1](../ACTION-REPORT.md#RT-1) |
| 7 | **The empty-score safety rule stays** | confirms D13 |
| 8 | **Knockout size moves both ways in edit mode**, with 4 as the floor | reverses the expand-only rule |
| 9 | **Pool contacts are visible to pool members only** | refines [L18](../notes/HARMONIZATION_REPORT.md#L18) |

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

Two faults. The `every` demands all group matches be complete, which decision 4 removes. And the placeholder guard was ANDed into the predicate instead of filtering the set, so an empty placeholder match returns `false` and the gate stays shut forever — the bug [D1](SPRINT-D1.md) was meant to close.

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

> *"{n} group matches still to play. You can build the knockout now and group results will keep counting."*

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

**A2 backfill.** Existing values equal each member's loss count. Recompute as the number of distinct tournament events each member has a participant row for. Dry-run first; this is staging, so the diff is safe to apply once read.

**Done when** · joining a tournament increments it once · scoring a match never moves it · the backfill diff is read and approved.

---

### ⬛ C4 — Delete `loses` · A1 + A3 + A2

**Verified: it is displayed on no screen.** It reaches the leaderboard row object and an opponent-panel props type, and neither renders it. The Round Robin group table does show a loss column, but that counts the group's own matches and never touches `stats.loses`.

| File | What |
| --- | --- |
| `functions/lib/tournamentResult.js:146` | stop writing it |
| `functions/friendlyPoints.js` | stop writing it — the second writer |
| `functions/competitionResults.js` | stop writing it if present |
| `src/types.ts:56` · `src/features/leagues/types.ts:8` | remove the field |
| `src/lib/firestoreNormalization.ts:260` | remove |
| `src/features/leagues/useStandings.ts:55` | remove from the row |
| `src/pages/tournament/OpponentPanels.tsx:25` | remove the unused prop, and the value passed at `useTournament.ts:746` |
| `src/lib/profileBootstrap.ts:23` | remove from the seed |

**A2:** a migration stripping the field from `stats`. Dry-run first.

**Done when** · `grep -rn "\bloses\b" src/ functions/` returns nothing outside prose · `npm run typecheck` clean · nothing on any screen changes.

---

### ⬛ C5 — One award table · A1

**File** · `functions/withdrawalWorkflow.js:10,72,112`

```js
const AWARDS = { R32: 1, R16: 2, QF: 3, SF: 5, F: 10 };   // third copy
const withdrawalAward = (round) => AWARDS[round] || 1;
...
const points = rr ? 1 : withdrawalAward(current.round);
```

**Build** — import the shared one. Same package, already exported:

```js
const { tournamentAward } = require('./lib/tournamentResult');
...
const award = tournamentAward({ round: current.round, format: current.format });
const points = award.loserPoints;              // RR is already 1 in the shared table
const opponentPoints = rr ? 1 : 0;
```

Delete `AWARDS`, `withdrawalAward` and the export at `:112`. Check for test consumers first.

Three copies become two. The last two cross the server/browser boundary and cannot share a file; **[Sprint D7](SPRINT-D7.md) group 6 removes the need for the browser copy.**

**Done when** · withdrawal payouts unchanged · `grep -c "R32: 1" functions/` returns 1.

---

### ⬛ C6 — Rename the booking stamp · A3 + A1

`completion_requested_at` → **`marked_completed_at`**. Nothing is requested; the stringer is stating the job is done.

| File | Line |
| --- | --- |
| `functions/bookings.js` | `:86` set · `:108` clear |
| `functions/lib/bookingState.js` | `:21` |
| `src/features/services/types.ts` | `:100` |
| `functions/test/bookingState.test.js` | `:5`, `:8` |
| `tests/integration/functions.emulator.test.mjs` | `:209` |

One test booking exists and it is cancelled, so no migration is needed.

---

### ⬛ C7 — Delete dead code · A3

| Where | What |
| --- | --- |
| `src/features/events/hooks/useJoin.ts:158-162` | The unreachable `'full'` and `'fallback'` branches. `slotStatus` is permanently `null`; these are the old refusal and the path that **rewrote a member's skill level**. Remove the branches, the `slotStatus` memo, `slotFallbackConfirmed`, and the `SlotResult` type if nothing else uses it |
| `src/pages/tournament/rrGeneration.ts:348` | `selectGroupWinners` — exported, no callers. Remove it and the `advancingPlayers` plumbing if `buildRRKnockoutDocs` no longer needs it |

**Done when** · `npm run typecheck` clean · `grep -rn "slotStatus\|selectGroupWinners" src/` returns nothing.

---

### ⬛ C8 — Remove group lessons and the booking lock; confirm the Book button · A1 + A2 + A4

`GroupLessonCard` is already gone from the UI. What remains is server-side.

| Where | What |
| --- | --- |
| `firestore.rules:707` | delete the `group_lessons` block |
| `functions/rewards.js:98,150` | delete the two functions reading `group_lessons/{month}` |
| `firestore.rules` contacts read | **remove `isCurrentGroupLessonCoachFor`.** It is a fourth way to read another member's contacts and it retires with the feature. Contacts then read: owner, connection, and through a connection the event organizer |
| `firestore.rules:641` · `functions/rewards.js:36` | delete `redemption_locks` and `redemptionLockRef` |
| `functions/test/redemptionLock.test.js` | delete with it |

**A4:** `bookService` exists in `src/features/services/servicesApi.ts:21` but no Book control was found in the Services UI. **Confirm one exists on each service card and add it if not.** It is the entry point to the whole booking flow shipped in [D5](SPRINT-D5.md).

---

### ⬛ C9 — No-show leftovers · A1

- `firestore.rules:529` still whitelists `no_show`. **A client can still set it.** Remove it from the whitelist.
- `functions/lib/adminMetricsCompute.js:112` still branches on it. Remove the branch; the metric becomes walkover or played.

---

### ⬛ C10 — Retire `result_application` · A1

[L3](../notes/HARMONIZATION_REPORT.md#L3) said the idempotency hash moves inside `result_submissions`. Both exist today.

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

## Features

### ⬛ F1 — The doubles partner pool · all lanes

**The join sheet already promises this.** `EventsElements.tsx:679` reads *"No partner yet? Leave this blank to join the event's partner pool."* and no pool exists. A member who leaves that field blank today joins nothing.

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

> **"A new player is waiting to partner up!"** — *{name} joined the {category} doubles pool for {event}.*

Link to the pool panel. Do not notify the joiner.

**`onPartnerPoolLeave`** — on delete: delete the matching contacts document. **Access ends with membership.**

#### A3 — Client

- `src/features/events/services/partnerPool.ts` — `joinPool`, `leavePool`, `usePool(eventId, category)` live subscription, `usePoolContacts(eventId)` which only resolves for members.
- Join sheet: leaving the partner field blank **joins the pool** on submit. Make the existing hint true.
- Choosing a partner from the pool **removes both rows**, in the same batch as `setDoublesPartner`.
- A member may leave the pool without choosing anyone.

#### A4 — UI

Three states on the doubles tournament tab:

| The member is… | What they see |
| --- | --- |
| **In the pool** | The pool panel is **open by default**, listing every member with name, skill and full contact buttons. A **Partner pool** button re-opens it if they close it by mistake |
| **Paired** | They see the draw. A **Partner pool** button opens the list — names and skill only, **no contact buttons** |
| **In the doubles event, not in the pool** | Same as paired: the list, no contacts |

Contacts come from the `contacts` subcollection, which only resolves for members. Reuse `contactChannels` from `ContactOpponentButton` — do not build a second contact control. A denied read is expected for non-members and must not surface as an error.

Empty state: *"Nobody is waiting yet. Join the pool and other players looking for a partner will see you."*

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
4. **Tournament tab:** `TournamentElements.tsx:91` reads *"Request Zone Change"* and raises a request an organizer must approve. **Make it a direct change.** No request, no approval. Keep writing `req_zone_change` so the organizer still sees the notice, but drop the approval step.
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

| Rule | Detail |
| --- | --- |
| Direction | **Both ways** — 4↔8, 8↔16 |
| Floor | **4 is the smallest size.** Nothing below it |
| When | **Only while the draw is in edit mode.** Outside edit mode the size bar is read-only |
| Growing | Unchanged. Existing matches are kept; only new slots are written |
| Shrinking | **Refuse if any slot being dropped holds a generated or played match.** The message names them: *"Cannot reduce to {n}: {x} matches already exist in the slots that would be removed."* Otherwise delete the empty slot documents |
| Always | **A recorded score is never deleted.** That rule has not changed |

**Done when** · 8→16 keeps every existing match · 16→8 with an empty upper half succeeds · 16→8 with a played match in the upper half is refused, naming it · the bar is inert outside edit mode · 4 cannot be reduced further.

---

## Exit gate

| Check | Passes when |
| --- | --- |
| CI | `npm run verify` green on the sprint branch |
| C1 | A one-player group no longer blocks the knockout; the warning shows the unplayed count; a test fails on old code |
| C2 | Points won moves on every scored match for both players, and reverses exactly |
| C3 | `tournamentsPlayed` moves on join and never on a result; backfill diff approved |
| C4 | `loses` gone from code and data; no screen changes |
| C5 | One award table in `functions/` |
| C8 | `grep -rn "group_lessons\|redemption_locks" firestore.rules functions/` returns nothing; a Book button exists on every service |
| C9 | `grep -rn "no_show" firestore.rules functions/` returns nothing |
| C11 | `/nonsense` lands on home with no history entry |
| F1 | The seven pool tests pass, including the denied contact read for a non-member; the join-sheet hint is now true |
| F2 | The five zone conditions, and an unmapped court lands the member in Unplaced |
| F3 | The five size conditions |

---

## Not in this sprint

The 13 remaining shared components and the consolidation of 83 card surfaces — [Sprint D7](SPRINT-D7.md).
