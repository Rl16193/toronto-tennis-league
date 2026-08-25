# Sprint D1 — Monday 24 August 2026

> **Foundation and the live bugs.** Everything in this file is broken for real members on the live
> project today, or is the harness the rest of the week runs on.

|                 |                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Branch base** | `origin/docs/planning` @ `21ddf73bb49ead5c6bd6e0213a15d19d8921a855`; implementation branch `codex/sprint-1-d1`                                                                       |
| **Agents**      | A1 `rules-functions` · A2 `dev-data` · A3 `dev-client` · A4 `ui-ux` · A5 `dev-verify`                                                                                                |
| **Blocking**    | A5's branch-and-harness task blocks nothing else, but nothing merges until it is green                                                                                               |
| **Ship**        | Local emulator and unit gates are required. No production deploy or production data mutation is part of D1; staging validation is deferred until an isolated staging project exists. |

**Line numbers are `dev-anuj`, verified 2026-08-23.** Re-check before you edit; re-cite the row when you touch it.

---

## Board

| Lane                     | Tasks | Rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1 Rules + Functions** |     5 | [F1](../notes/WORKFLOW_DESIGN_REPORT.md#F1)/LB-16, [F4](../notes/WORKFLOW_DESIGN_REPORT.md#F4), [F13](../notes/WORKFLOW_DESIGN_REPORT.md#F13), [F12](../notes/WORKFLOW_DESIGN_REPORT.md#F12), [conflict 6](../notes/DEV_ANUJ_CONFLICTS.md#6-deployment-order--trap)                                                                                                                                                                                                                                       |
| **A2 Data**              |     2 | [F2](../notes/WORKFLOW_DESIGN_REPORT.md#F2) + [L14](../notes/HARMONIZATION_REPORT.md#L14), baseline export                                                                                                                                                                                                                                                                                                                                                                                                |
| **A3 Client / Dev**      |    24 | [LB-1](../ACTION-REPORT.md#LB-1), [LB-2](../ACTION-REPORT.md#LB-2), [LB-3](../ACTION-REPORT.md#LB-3), [LB-4](../ACTION-REPORT.md#LB-4), [LB-6](../ACTION-REPORT.md#LB-6), [LB-19](../ACTION-REPORT.md#LB-19)…[LB-29](../ACTION-REPORT.md#LB-29), [LB-31](../ACTION-REPORT.md#LB-31)…[LB-37](../ACTION-REPORT.md#LB-37), [LB-39](../ACTION-REPORT.md#LB-39), [LB-42](../ACTION-REPORT.md#LB-42), [LB-45](../ACTION-REPORT.md#LB-45), [LB-47](../ACTION-REPORT.md#LB-47)…[LB-50](../ACTION-REPORT.md#LB-50) |
| **A4 UI/UX**             |     3 | [CT-12](../ACTION-REPORT.md#CT-12), [LB-30](../ACTION-REPORT.md#LB-30), [LB-24](../ACTION-REPORT.md#LB-24)/LB-25 surfaces                                                                                                                                                                                                                                                                                                                                                                                 |
| **A5 Verify**            |     4 | harness, previews, regression tests, gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## A3 · Client / Dev — `dev-client`

### ⬛ LB-1 — Score modal seeds player 1 as the winner · **highest priority in the entire programme**

**Files** · `src/pages/tournament/useTournament.ts:1826` · `src/features/tournament/domain/scoreSubmission.ts:16` · `src/pages/tournament/ScoreModal.tsx:121,129` · handlers in `src/pages/Matches.tsx`

**Now**

```ts
// useTournament.ts:1826
      winnerUserId: match.player_1_uid,
```

The modal opens with player 1 pre-selected. The fastest possible interaction — open, press Submit — records a `0-0, 0-0, 0-0` result. All-zero scores plus a winner **is** the walkover format, so the engine files it as a real walkover and pays **3 to the winner and 1 to the loser** to whoever happens to occupy the player-1 slot. Against a production database with no backups and no PITR.

Both submit handlers also `return` silently when no winner is set, so pressing Submit with nothing chosen does nothing and says nothing.

**Build**

1. `useTournament.ts:1826` — default `winnerUserId` to `''`.
2. `ScoreModal.tsx:121` — `const selected = !isNoShow && scoreForm.winnerUserId === p.uid;` already handles empty correctly; confirm neither card renders selected on open.
3. Disable Submit while `winnerUserId === ''`, with a visible reason rather than a dead press.
4. **Check the second path.** Submission now also flows through `scoreSubmission.ts`, which at `:16` already refuses a blank winner:
   ```ts
   if (!isNoShow && !scoreForm.winnerUserId) return { error: 'Please choose who won the match.' };
   ```
   The refactor moved the flow but left the seed. Fix the seed; do not duplicate the guard.

**Done when** · opening the modal selects neither player · Submit is disabled with a reason until a winner is picked · a blank `winner_uid` is refused at form, rules **and** callable · A5's unit test fails on the old code.

> A blank `winner_uid` is worse than it looks: it completes the match displaying player 2 as winner, credits player 1 with a loss, awards nobody a win, and writes an empty uid into the next round.

---

### ⬛ LB-2 — One orphaned placeholder pins the Knockout gate shut forever

**File** · `src/pages/tournament/useTournament.ts:1344` (`rrKnockoutReady`)

A one-player group legitimately keeps a placeholder match so the lone player stays visible and movable. `rrKnockoutReady` counts it as an unplayed match, so the Knockout gate never opens — with no message and no way for the organizer to clear it.

**Build** · add `m.player_1_uid && m.player_2_uid` to the `every` test, mirroring the predicate `RRGroupCard.tsx` already applies at its own group-complete check.

**Done when** · a draw containing a one-player group can open the Knockout selector · a draw with a genuinely unplayed real match still cannot.

---

### ⬛ LB-3 / LB-4 — A denied `contacts` read hides every contact on the page (**F3**)

**Files** · `src/pages/Marketplace.tsx:39` · `src/pages/Profile.tsx:91`

A denied `contacts` read is **normal in this app, not an error** — `CLAUDE.md` says so explicitly. The connection doc lands a moment _after_ a request is accepted, so a denial is expected traffic. Both sites batch the reads and attach one trailing `.catch()`, so **one** denial rejects the whole `Promise.all` and removes the Contact button for every seller on the Marketplace board and every upcoming opponent on Profile.

**Build** · per-id `.catch(() => null)` on each `getDoc`, exactly as `PlayerProfile.tsx` already does. Drop the single trailing catch. Route both through `useContacts` if the shape allows it without a rewrite.

**Done when** · with one deliberately-denied id in the batch, every other contact still renders.

---

### ⬛ LB-6 — Signup reports success after a failed write

**File** · `src/pages/Signup.tsx:343` (`handleCompleteProfile`), `:366`

The catch block advances to the success screen **and** fires the `complete_profile` analytics event, so a rules rejection looks like a finished signup.

**Build** · surface the error, stay on the step, do not log the event.

---

### ⬛ LB-19 / LB-20 / LB-21 — Three dead or wrong controls on `/matches`

**File** · `src/pages/Matches.tsx`

| Row                                | Line                                          | Defect                                                                                                                                                          | Fix                                                          |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [LB-19](../ACTION-REPORT.md#LB-19) | `:717` `cancelRequest`, rendered at `:808`    | `cancelRequest` only matches `status === 'open'`, but the button renders on accepted challenges too — a pure dead click                                         | Restrict rendering to `isPending`, or extend `cancelRequest` |
| [LB-20](../ACTION-REPORT.md#LB-20) | `:499` `openChallengeScore` vs `useLadder.ts` | `challengeAccepted` includes `reported`; `openChallengeScore` only finds `accepted` — another dead click                                                        | Align the two predicates                                     |
| [LB-21](../ACTION-REPORT.md#LB-21) | `:702` `const showContact = showScore;`       | Contact drops the moment a rally hits `reported`, while the name link survives — the two players lose each other exactly when they need to talk about the score | Include `reported` in `showContact`                          |

---

### ⬛ LB-22 to LB-29 — Silent failures

| Row                                | File                                                       | Defect                                                                                                                                                                | Fix                                                                               |
| ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [LB-22](../ACTION-REPORT.md#LB-22) | `Profile.tsx` events calendar                              | `Selected:` sorts `"May 9, 2026"` lexicographically, so May 10 lists before May 9; the 7-column grid has no leading blank cells so weekdays align only by coincidence | Sort on real dates; offset the grid by the month's first weekday                  |
| [LB-23](../ACTION-REPORT.md#LB-23) | `Tournament.tsx` zone Approve                              | If no bucket matches the stored `new_zone`, Approve silently does nothing                                                                                             | Error banner naming the unmatched zone                                            |
| [LB-24](../ACTION-REPORT.md#LB-24) | `ProfileInfo.tsx` avatar upload                            | A >5 MB or non-image file returns early with no message; the picker just closes                                                                                       | Set the card's error message; disable the button during upload                    |
| [LB-25](../ACTION-REPORT.md#LB-25) | `BadgePicker.tsx`                                          | Selecting a 4th badge is a no-op with no styling change and no message                                                                                                | Disable unselected chips at 3, show "3 maximum"                                   |
| [LB-26](../ACTION-REPORT.md#LB-26) | `RRGroupCard.tsx` Save Group · `RoundRobinView.tsx` Create | Cap-of-5 and already-played validation is server-side only and surfaces as a banner at the top of a long list — an invisible failure                                  | Validate `overGroupCap` and played-match state client-side; disable with a reason |
| [LB-27](../ACTION-REPORT.md#LB-27) | `TournamentElements.tsx` `BracketErrorBoundary`            | `hasError` never clears, so switching draws or events after one render error keeps the error card until a full reload                                                 | Reset on a `key`/prop change via `getDerivedStateFromProps`                       |
| [LB-28](../ACTION-REPORT.md#LB-28) | `RoundRobinView.tsx`                                       | `onDownload={() => {}}` — after a knockout render error the fallback's "Download Draw" silently does nothing                                                          | Pass the handler `BracketView` gets, or omit the prop and hide the button         |
| [LB-29](../ACTION-REPORT.md#LB-29) | `Tasks.tsx:63` `searchParams.get('claim')`                 | `?claim=banana` opens a sheet with an undefined title and a Submit whose validation branches all fall through                                                         | Whitelist `volunteer` / `ambassador` / `host`; otherwise ignore the param         |

---

### ⬛ LB-31 to LB-37, LB-39 — Court map, signup and forms

| Row                                | File                                                | Defect                                                                                                                                                                            | Fix                                                                             |
| ---------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [LB-31](../ACTION-REPORT.md#LB-31) | `courtmap/CourtMapElements.tsx` `MultiFilterSelect` | Opening Zone then tapping Total Courts leaves two overlapping popovers, the second rendering under the first                                                                      | Document `mousedown` and `keydown` listeners; close on outside click and Escape |
| [LB-32](../ACTION-REPORT.md#LB-32) | `CourtMap.tsx` search `×`                           | The `×` calls `handleReset` (`:386`) and silently wipes Type / Lights / Zone / Total Courts / programs                                                                            | Call `handleClear` (`:374`); keep Reset inside the Filters sheet                |
| [LB-33](../ACTION-REPORT.md#LB-33) | `CourtMap.tsx:386` `handleReset`                    | Skips `showAllCourts` (`:152`), so Reset leaves the map in whichever mode it was in                                                                                               | Include `setShowAllCourts(false)`                                               |
| [LB-34](../ACTION-REPORT.md#LB-34) | `Signup.tsx:382` `goToEmailPhase`                   | Only the Google credential is cleared; after an Apple hand-off `(change)` leaves `pendingAppleCredential` (`:101`) armed and the OAuth buttons hidden for the rest of the session | Clear both                                                                      |
| [LB-35](../ACTION-REPORT.md#LB-35) | `Signup.tsx`                                        | One shared `loading` flag across the three sign-in buttons                                                                                                                        | Split per button                                                                |
| [LB-36](../ACTION-REPORT.md#LB-36) | `CheckInModal.tsx`                                  | One shared `busy` flag across rows                                                                                                                                                | Per-row scope                                                                   |
| [LB-37](../ACTION-REPORT.md#LB-37) | `ServicesElements.tsx` offer form                   | `$NaN` in the live preview                                                                                                                                                        | Guard the parse                                                                 |
| [LB-39](../ACTION-REPORT.md#LB-39) | `Signup.tsx`                                        | `emailSuggestion` is loosely typed                                                                                                                                                | Type it properly                                                                |

---

### ⬛ LB-42, LB-45, LB-47 to LB-50 — Reads, images and empty states

| Row                                | File                                              | Defect                                                             | Fix                                     |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| [LB-42](../ACTION-REPORT.md#LB-42) | Completed tab                                     | Cache guard is wrong, so the tab refetches or serves stale         | Fix the guard key                       |
| [LB-45](../ACTION-REPORT.md#LB-45) | `ProfileInfo.tsx` avatar · `Home.tsx` hero slides | No `onError` fallback — a dead URL renders a broken image          | Add `onError`                           |
| [LB-47](../ACTION-REPORT.md#LB-47) | `Home.tsx`                                        | The Report button is unreachable for logged-out visitors           | Make it reachable, or hide it honestly  |
| [LB-48](../ACTION-REPORT.md#LB-48) | Wait-time table                                   | Points at the wrong racquet count — not the one the reporter typed | Point it at the reported count          |
| [LB-49](../ACTION-REPORT.md#LB-49) | Notification feed                                 | Reports a capped unread count as if it were the true one           | Report the true count, or label the cap |
| [LB-50](../ACTION-REPORT.md#LB-50) | Empty states caused by failed reads               | No retry — a failed read is indistinguishable from "nothing here"  | Add a retry                             |

**Held to Sprint 3, deliberately:** [LB-7](../ACTION-REPORT.md#LB-7) to [LB-15](../ACTION-REPORT.md#LB-15). Every one moves a stored field or a definition and belongs with A2's stat-definition pass. Do not start them today.

**A3 verification** · `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e`

---

## A1 · Rules + Functions — `rules-functions`

### ⬛ F1 / LB-16 — Court check-in fails on every return visit

**Files** · `src/features/tasks/checkinService.ts` (A3 co-signs the client half) · `functions/taskPoints.js`

The client writes the check-in passport document directly. On a return visit that write is refused, and the whole check-in fails.

**Build** · the client writes `courts` with `type: 'attendance'` **only**. A trigger stamps the check-in document server-side. Client loses the passport write entirely.

**Done when** · a member checks in at the same court twice on different days and both succeed · the passport advances once per visit · `npm run test:functions:integration` covers the second visit.

---

### ⬛ F4 — The welcome email can reach real members from the test project

**File** · `functions/index.js` → `sendEmail`, `functions/lib/emailDelivery.js`

The welcome email bypasses the non-production delivery gate. On `dev-anuj` — a **test** project — that means it can email live members.

**Build** · route it through the delivery gate like every other message. Then **[P1](../notes/WORKFLOW_DESIGN_REPORT.md#P1)**: fire it when `users.name` is first set, not on document creation. (The doc-creation trigger fires before the member has a name, so the mail goes out addressed to nobody.)

---

### ⬛ F13 — Group awards pay the anonymous uid

**File** · `functions/groupAwards.js`

`no_account` is a placeholder uid, not a member. It currently collects group awards.

**Build** · exclude `no_account` from every group-award query and payout. One line.

> While you are in this file: the Matchday query is bounded to a ±36h ISO window for a reason — it used to read every completed match in the league on every completion, which was quadratic and the first query here to time out. Do not widen it.

---

### ⬛ F12 — Rank trend updates weekly; it should be daily

**File** · `functions/rankSnapshot.js`

**Build** · move the schedule from weekly to daily. Writes to `ranking_history/{uid}/entries`, which is public-read and has no client writes — no rules change needed.

---

### ⬛ Conflict 6 — Deployment order and rules-diff handoff

**Deliverable, not code.**

1. Write the deploy order (below) as an executable checklist in `docs/runbooks/`.
2. **Diff the repo `firestore.rules` and `storage.rules` against the deployed console copies** and record the delta. Deployment is manual in this project, so the repo file is not necessarily what is enforcing anything right now. Every rules decision this week rests on knowing that delta.

```text
1. Confirm the target is a local emulator or an explicitly isolated staging project.
2. Run Functions, Firestore Rules, Storage Rules, and Hosting checks against that non-production target.
3. Record the repo-versus-deployed rules delta only when an authorized staging console is available.
4. Keep production deploys and production data changes out of this sprint; promote only after a separate approval.
```

No staging Firebase project is configured in this checkout. The future staging runbook must name its project explicitly before any Firebase CLI command is run.

**A1 verification** · `npm run test:rules` · `npm run test:storage` · `cd functions && npm test` · `npm run test:functions:integration` · `npm run functions:syntax`

---

## A2 · Data — `dev-data`

### ⬛ F2 + L14 — OAuth newcomers are stuck, and two fields should not exist

**Files** · `src/lib/profileBootstrap.ts` · `src/features/leagues/useStandings.ts:13` · `firestore.rules` (A1 writes the whitelist)

`profileBootstrap.ts` writes `pointswon` and `totalPointsPlayed`. The `stats` whitelist rejects both, so the whole write fails and the member never gets a profile — a new Google or Apple sign-in dead-ends.

The tempting fix is to widen the whitelist. **Do not.** `L14` says neither field is stored: "P/G Won %" derives client-side from the member's matches, the same list the Progress chart already uses.

```ts
// useStandings.ts:13 — today's reader, which is what has to change
export const pgWinPct = (r: { pointswon: number; totalPointsPlayed: number }) =>
  r.totalPointsPlayed > 0 ? `${Math.round((r.pointswon / r.totalPointsPlayed) * 100)}%` : '—';
```

**Build**

1. Drop both fields from the bootstrap write and make them optional legacy-read fields.
2. Keep new tournament result writes limited to authoritative match counters; client readers use match-derived totals where available.
3. Defer any strip migration until an isolated staging project and approved dry-run/recovery path exist.

**Done when** · a fresh Google sign-in produces `users` + `stats` + `preferences` + `tasks` + `contacts` · new stats writes omit the legacy P/G fields · no migration runs against production.

> This is also why the auto-approval rule was defined on **scores**, not on P/G Won %: a submitter-percentage tie-break would have required both fields to stay stored, and reversed [L14](../notes/HARMONIZATION_REPORT.md#L14).

---

### ⬛ Baseline export

Do not take a production export in D1. A staging export may be added later once an isolated staging project and approved recovery path exist; until then, use deterministic local fixtures and emulator state for validation.

`R6` says all 204 `stats` docs currently satisfy `loses = matchesPlayed − wins`. Capture that as the reconciliation baseline; it must still hold on Friday.

**A2 verification** · `npm test` · migration `--dry-run` diffs in the report

---

## A4 · UI/UX — `ui-ux`

### ⬛ CT-12 — The crash screen is invisible on a light OS theme

**File** · `src/main.tsx:33`

```tsx
<h1 className="text-2xl font-black text-white">Unable to load</h1>
```

The one screen shown when the app fails to boot is white text on the light theme's page. It renders **outside `ThemeProvider`**, so nothing else in the app can rescue it.

**Build** · `text-white` → `text-fg`. In the same edit, `:40`'s `text-clay` → `text-clay-fg` once that token exists on Wednesday; today just leave a `TODO(CT-2)` comment beside it. `:31`'s `bg-tennis-dark` is correct and stays — it is a genuine full-screen page state.

**Done when** · `grep -c 'text-white' src/main.tsx` → 0 · legible in both themes.

---

### ⬛ LB-30 — Escape closes two overlays at once

**Files** · `src/components/Sheet.tsx:43` · `src/components/HeaderMenu.tsx`

Both bind a `window` `keydown` listener, so a sheet opened over the drawer closes **both** with one Escape.

**Build** · a small overlay stack; only the top entry handles Escape. The same helper serves the focus-trap work on Wednesday, so build it to be reused.

**Done when** · open the drawer, open a sheet over it, press Escape: the sheet closes and the drawer stays. That is the only way to see this bug.

---

### ⬛ Support — LB-24 and LB-25 surfaces

A3 owns the logic; you own the message and the disabled state. Use `AlertMessage` for both. Keep `text-fg/70` + `opacity-50` for disabled — never a dimmer text tier.

**A4 verification** · `npm run typecheck` · `.design-sync` shot diff, both cells

---

## A5 · Verify — `dev-verify`

### ⬛ Branches and harness

1. Cut the five branches from `tbtc/dev-anuj`.
2. **Commit `docs/` and `.design-sync/`.** Both are untracked today, so an agent on a fresh clone or a worktree sees neither the audit nor the only visual baseline. This is the first thing that happens.
3. Get a clean checkout green on: `npm run typecheck` · `npm run lint` · `npm test` · `cd functions && npm test` · `npm run test:rules` · `npm run test:storage` · `npm run test:functions:integration` · `npm run test:fixtures` · `npm run test:e2e` · `npm run verify`.
4. Write the exact commands into `CLAUDE.md`. Its current line "There are no automated tests" is false on this branch and must go.

### ⬛ Design-sync baseline — DC-19 and DC-18

- **[DC-19](../ACTION-REPORT.md#DC-19)** — grade the three pending reviews (`Button`, `Input`, `PlayerCard`, all `pendingGrade: true`). They are the **only** visual baseline; ungraded, Wednesday's primitive retune is a first impression instead of a diff.
- **[DC-18](../ACTION-REPORT.md#DC-18)** — add previews for the 13 mapped-but-previewless components: `Accordion`, `AlertMessage`, `AvailabilityPills`, `ContactOpponentButton`, `Fab`, `LoadingBar`, `NearbyPill`, `RacquetIcon`, `SegmentedControl`, `Sheet`, `Stepper`, `Toast`, `Tree`. Each gets `Variants` / `Sizes` / `States`, rendered **again inside `<div data-theme="light">`**, plus an `h-11 border-badge-loss` guide box.

> Six of the eight audit passes' correctness findings are **light-theme only**. A dark-only harness would have caught none of them. The light cell is the point of this task.

### ⬛ Regression tests

One test per row above, failing on the old code. Priority order: [LB-1](../ACTION-REPORT.md#LB-1), [LB-2](../ACTION-REPORT.md#LB-2), [F1](../notes/WORKFLOW_DESIGN_REPORT.md#F1), [F2](../notes/WORKFLOW_DESIGN_REPORT.md#F2), [LB-3](../ACTION-REPORT.md#LB-3)/LB-4.

### ⬛ Exit gate

| Check                                       | Passes when                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Clean-clone verification                    | All eleven commands green                                                                                                      |
| `docs/` + `.design-sync/`                   | Tracked and pushed                                                                                                             |
| Design-sync                                 | 16 components × 2 themes, three graded                                                                                         |
| [LB-1](../ACTION-REPORT.md#LB-1)            | Blank winner refused at form, rules and callable; test fails on old code                                                       |
| [F2](../notes/WORKFLOW_DESIGN_REPORT.md#F2) | Fresh OAuth sign-in produces all five profile documents                                                                        |
| Rules delta                                 | A1's deployed-vs-repo diff recorded                                                                                            |
| Baseline                                    | Local fixtures/emulator checks recorded; staging export and reconciliation deferred until an authorized staging project exists |

---

## Handoffs into Sprint D2

| From | To  | What                                                                                                         |
| ---- | --- | ------------------------------------------------------------------------------------------------------------ |
| A1   | A3  | The rules delta — it decides which of tomorrow's client writes are currently refused                         |
| A2   | A1  | The `stats` field list after the [L14](../notes/HARMONIZATION_REPORT.md#L14) strip, for tomorrow's whitelist |
| A3   | A4  | `ScoreModal` is now winner-less on open — tomorrow's rework builds on that, not around it                    |
| A5   | all | Graded baseline, so Wednesday's diffs mean something                                                         |
