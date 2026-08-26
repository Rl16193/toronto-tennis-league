# Project plan — Racquets & Strings

|                     |                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**            | 2026-08-23                                                                                                                                                                                                                                                            |
| **Sprint week**     | Mon 24 Aug – Fri 28 Aug 2026                                                                                                                                                                                                                                          |
| **Working branch**  | `dev-anuj` @ `ca54741` — Sprint D5 implementation merged from isolated `codex/sprint-5-d5`; no production deployment or data mutation                                                                                                                                 |
| **Combines**        | `docs/archive/anuj/DECISIONS_BRIEF.md` · `DEV_ANUJ_CONFLICTS.md` · `HARMONIZATION_REPORT.md` · `WORKFLOW_DESIGN_REPORT.md` · `docs/ACTION-REPORT.md` · `FIX-TODAY.md` · `ELEMENT-DESIGN-BRIEFS.md` · `UI-UX-INVENTORY.md` · `uisummary_report.md` · `UI-REMAINING.md` |
| **Detail lives in** | `docs/sprints/SPRINT-D1.md` … `SPRINT-D5.md` — self-contained. An agent needs its daily sprint file and nothing else.                                                                                                                                                 |
| **Future work**     | `docs/FUTURE-WORK.md` — everything deliberately not scheduled                                                                                                                                                                                                         |
| **Status**          | Sprint D1 through Sprint D5 are merged on `dev-anuj`; staging remains deferred until an authorized project and recovery path exist.                                                                                                                                   |

---

## 1 · Points — the numbers every document uses

Read from the code, not from prose. `src/features/tournament/domain/scoring.ts` and `functions/lib/tournamentResult.js:84`.

| Result                                |                Winner |              Loser | Note                                                                                                                                                                                              |
| ------------------------------------- | --------------------: | -----------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Round Robin group — played match**  |                 **3** |              **1** |                                                                                                                                                                                                   |
| **Round Robin group — walkover**      |                 **1** |              **1** | **Both players 1.** A walkover is not a played result. This is the payout the removed no-show concept used to carry ([D6](HARMONIZATION_REPORT.md#D6) · [L10](HARMONIZATION_REPORT.md#L10) · Q-4) |
| **RR group bonus** (organizer switch) |                **+5** |             **+5** | Every player in the group. Manual, never automatic. `rr_groupbonus` stamp is the receipt                                                                                                          |
| **Knockout R32**                      | advances, banks **0** |              **1** |                                                                                                                                                                                                   |
| **Knockout R16**                      | advances, banks **0** |              **2** |                                                                                                                                                                                                   |
| **Knockout QF**                       | advances, banks **0** |              **3** |                                                                                                                                                                                                   |
| **Knockout SF**                       | advances, banks **0** |              **5** |                                                                                                                                                                                                   |
| **Knockout Final**                    |                **20** |             **10** | The only knockout match that pays its winner                                                                                                                                                      |
| **Knockout — walkover**               | advances, banks **0** | that round's award | Same as a played knockout match                                                                                                                                                                   |
| **Ladder challenge**                  |                **+3** |             **−3** | Loser floored at 0                                                                                                                                                                                |
| **Friendly / rally**                  |                **+2** |             **+1** | Neither player ever loses points                                                                                                                                                                  |
| ~~No show~~                           |                 ~~1~~ |              ~~1~~ | **Removed** — D6. A missed match is a real 6-0, paid normally                                                                                                                                     |

**Worked example — one 8-player Round Robin draw, two groups of 4, R8 knockout.**

| Player  | Group record | Group pts | Bonus | Knockout                     | Round pts |  Total |
| ------- | ------------ | --------: | ----: | ---------------------------- | --------: | -----: |
| Chandra | 3-0          |         9 |    +5 | wins R8, wins SF, **wins F** |    **20** | **34** |
| Rahul   | 2-1          |         7 |    +5 | wins R8, loses SF            |         5 | **17** |
| Meera   | 2-1          |         7 |    +5 | loses R8                     |         2 | **14** |
| Dev     | 1-2          |         5 |    +5 | loses R8                     |         2 | **12** |
| Anil    | 0-3          |         3 |    +5 | —                            |         0 |  **8** |

A group of 4 plays 3 matches per player: 3 wins = 9, 2-1 = 3+3+1 = 7, 1-2 = 3+1+1 = 5, 0-3 = 1+1+1 = 3.

---

## 2 · Journey 3 — score reporting, auto-approved _(replaces D4)_

**This reverses `HARMONIZATION_REPORT.md` [D4](HARMONIZATION_REPORT.md#D4) ("nothing auto-applies") and `WORKFLOW_DESIGN_REPORT.md` §1.** Those documents carry a dated amendment pointing here.

### The rule

1. **Either player** opens the match, picks the winner, enters games, submits.
2. **The server validates.** Integers 0–99; when the higher score exceeds 10 the margin is exactly **2**; the winner takes the set majority; **a winner must be named** — a blank `winner_uid` is rejected outright (this is `LB-1`, live today).
3. **It applies immediately.** No organizer approval. Points paid per §1, stats written, knockout winner advanced.
4. **Both players are notified, differently:**
   - Winner → _"Win recorded — 7-2, 7-4 v. Rahul"_
   - Loser → _"Score recorded — 2-7, 4-7 v. Chandra"_
5. **If the opponent submits afterwards:**

| Case                             | Outcome                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Same winner, same score**      | No-op. Idempotent, no second payout                                                                                                                                                          |
| **Same winner, different score** | **The submission with the smaller aggregate winning margin is recorded.** Reverse-then-reapply in one transaction. Both players re-notified with the final score                             |
| **Different winner**             | Nothing changes. **The first submitted result stays applied and displayed.** The match is flagged, both players see _"Result disputed — organizer reviewing"_, the organizer gets one notice |

6. **Margin** = Σ(winner's games) − Σ(loser's games), across all sets. **Tie → the first submission stands.**
7. **Walkovers are organizer-only.** A walkover is all-zero scores plus a winner; letting a player submit one is `LB-1` coming back through the front door.
8. **The organizer can rescore any match, any number of times** ([D3](HARMONIZATION_REPORT.md#D3)). `result_at` re-stamped, `completed_at` pinned at first scoring, every edit logged.
9. **Scope: all three.** Tournament matches, ladder challenges (+3/−3) and friendlies (+2/+1) all auto-apply on submission.

### Worked example — the differing-score reconcile

Quarter-final. Chandra beat Rahul.

| Step | Submission                                     |                 Margin | Applied                                                                             |
| ---- | ---------------------------------------------- | ---------------------: | ----------------------------------------------------------------------------------- |
| 1    | **Chandra** submits `7-0, 7-0`, winner Chandra | (7+7) − (0+0) = **14** | ✅ Applied. Chandra → SF. Rahul banks **QF = 3 pts**. Chandra banks **0**           |
| 2    | **Rahul** submits `7-2, 7-4`, winner Chandra   |  (7+7) − (2+4) = **8** | ✅ **8 < 14 → `7-2, 7-4` records.** Games reversed and reapplied in one transaction |
| —    | Points                                         |                        | **Unchanged.** Rahul still 3, Chandra still 0. Only the games move                  |
| —    | Notices                                        |                        | Chandra: _"Win recorded — 7-2, 7-4"_ · Rahul: _"Score recorded — 2-7, 4-7"_         |

Had Rahul instead submitted **himself** as winner: nothing changes, `7-0, 7-0` stays applied and on the card, the match flags, both see _"Result disputed"_, the organizer resolves. If the organizer flips the winner and the SF already holds a result, the flip is **refused with a message** — an approval never overwrites a played slot.

### Why "lower margin wins"

You cannot inflate your own dominance. The conservative scoreline is the one that survives, whoever typed it. It needs no `pointswon` / `totalPointsPlayed`, so **[L14](HARMONIZATION_REPORT.md#L14) stands untouched** — those two fields still go.

---

## 3 · The five agents

|        | Agent                 | Branch            | Owns                                                                                                                                                   |
| ------ | --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A1** | **Rules + Functions** | `rules-functions` | `firestore.rules`, `storage.rules`, all Cloud Functions and callables, triggers, App Check, deploy order                                               |
| **A2** | **Data**              | `dev-data`        | Firestore schema ([L1](HARMONIZATION_REPORT.md#L1)–[L18](HARMONIZATION_REPORT.md#L18)), field naming, migrations, backfills, exports, stat definitions |
| **A3** | **Client / Dev**      | `dev-client`      | React hooks, services, page behaviour, routing, the draw engine — everything in `src/` that is not presentation                                        |
| **A4** | **UI/UX**             | `ui-ux`           | `src/index.css`, `src/components/*`, the `*Elements.tsx` presentational modules, `.design-sync`, colour, type, a11y                                    |
| **A5** | **Verify**            | `dev-verify`      | The test harness, fixtures, rules matrix, e2e journeys, sprint exit gates, the release runbook                                                         |

Five branches off `tbtc/dev-anuj`, merged back at sprint end. Nothing more elaborate than that.

### Path ownership — the collision contract

Primary owner writes. Co-owner reviews and may not edit.

| Path                                                                        | Primary           | Co-owner                                                                                                         |
| --------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `firestore.rules`, `storage.rules`                                          | **A1**            | A2                                                                                                               |
| `functions/**` (except `lib/points.js`)                                     | **A1**            | A3                                                                                                               |
| `functions/lib/points.js`                                                   | **A1**            | A2 — hand-synced twin of `taskCatalog.ts`                                                                        |
| `scripts/migrations/**`, `scripts/backfill-*.mjs`, `firestore.indexes.json` | **A2**            | A1                                                                                                               |
| `src/pages/tournament/useTournament.ts`, `rrGeneration.ts`, `utils.ts`      | **A3**            | A2                                                                                                               |
| `src/features/**/hooks/`, `**/services/`, `**/domain/`, `**/types.ts`       | **A3**            | A2                                                                                                               |
| `src/App.tsx`, `src/main.tsx`                                               | **A3**            | A4                                                                                                               |
| `src/components/**`, `src/index.css`, `src/lib/motion.ts`                   | **A4**            | A3                                                                                                               |
| `src/**/*Elements.tsx`                                                      | **A4**            | A3 — presentation only; a Firestore call found inside one is an A3 escalation                                    |
| `src/pages/*.tsx`                                                           | **split by hunk** | A3 takes hooks/handlers/effects, A4 takes JSX and class strings. **A3 first, A4 rebases. Never both in one day** |
| `tests/**`, `functions/test/**`, `scripts/verify*.mjs`, `scripts/run-*.mjs` | **A5**            | all — every agent adds tests, A5 owns the harness                                                                |
| `CLAUDE.md`, `docs/**`, `package.json`, `firebase.json`                     | **A5**            | all — single writer so the canon does not fork                                                                   |

---

## 4 · Agent prompts

Each block is the complete standing prompt. Paste verbatim; the daily sprint file supplies the task list.

### Common preamble — prepend to all five

> You are one of five agents on the Racquets & Strings programme, working on branch `<your-branch>` cut from `tbtc/dev-anuj`.
>
> **Read first, every session:** `CLAUDE.md`, `docs/PROJECT-PLAN.md`, and today's `docs/sprints/SPRINT-D<n>.md`. The sprint file is self-contained — it carries the file paths, the current code, the target code and the verification command for every task you own. You should not need to open `ACTION-REPORT.md`, `UI-UX-INVENTORY.md` or the anuj briefs; if a task sends you there, it says so explicitly.
>
> **Boundaries.** You own only the paths listed for your agent id in §3 of the plan. If a change you need falls outside them, **stop and report the cross-boundary need** — do not edit another agent's file, and do not work around it.
>
> **Citations move.** `dev-anuj` is 116 commits ahead of the branch the UI audit was written against. Line numbers in the sprint files were re-verified on `dev-anuj`, but re-check before you edit. Re-cite a row **only when you touch it** — never in bulk.
>
> **Discipline.** Fix exactly what the task says. Do not bundle adjacent cleanup, refactors or new files. If you notice something else broken, note it in one line at the end of your report and wait.
>
> **Data safety.** There is no staging tier and no backups. Any script that writes data runs `--dry-run` first and the diff goes in your report before anything is applied.
>
> **Report format.** For each task: row id · files touched · what changed · the verification command you ran and its output · anything you did not do and why.

---

### A1 · Rules + Functions — `rules-functions`

> **Mandate.** You own the security boundary and the server. `firestore.rules` **is** the API layer — the client talks to Firestore directly and there is no server in between. Every privileged action must be enforced here or in a callable, or it is not enforced at all.
>
> **You own:** `firestore.rules`, `storage.rules`, `functions/**`, every callable and trigger, App Check, the deploy order.
>
> **You never touch:** anything under `src/`. If a callable needs a client caller, you specify the signature and A3 wires it.
>
> **House rules, all learned from real defects:**
>
> - Whitelist writable fields with `hasOnly()`, **never** blacklist with `!hasAny()`. A blacklist permits every field you did not think of, including PII into a world-readable doc.
> - **Rules do not cascade into subcollections.** `match /events/{eventId}` does not cover `events/{eventId}/rr_drafts/{drawKey}`. That exact mistake meant not one RR draft saved for months, silently, because the `onSnapshot` error path sets the draft to `null`.
> - A UI role toggle grants nothing. Admin/creator/provider views switch on a `preferences` flag in the same session. That flag decides what is _rendered_. Treat it as cosmetic.
> - Server-only collections stay server-only: `connections`, `public_contacts`, `notifications`, `offers`, `redemptions`, `site_stats`, `ranking_history`. A client that could write `connections` could grant itself anyone's phone number. Do not "temporarily" open one — add a callable.
> - The deployed rules may not be the repo rules. Deployment is manual. Diff against the console before trusting the file.
> - `pairId()` exists in both `functions/connections.js` and `firestore.rules` and **must stay identical**, or every contact read in the app starts failing.
>
> **Verification you run before handing back:** `npm run test:rules` · `npm run test:storage` · `cd functions && npm test` · `npm run test:functions:integration` · `npm run functions:syntax`. A rules change without a passing rules test is not done.
>
> **Worked example — your [Sprint D2](../sprints/SPRINT-D2.md) task, [conflict 4](DEV_ANUJ_CONFLICTS.md#4-round-robin-group-bonus--broken).**
>
> _Task:_ `setGroupBonus` callable. Today `useTournament.ts:2231` is a disabled stub and no server operation exists.
> _Build:_ one callable, event-manager check, stamps or unstamps `rr_groupbonus` on **every** match in the group and pays or reverses **+5** to every member in **one transaction**. No-op when the stamp already matches the requested state.
> _Why the stamp matters:_ it is the only proof of payment. Without it a corrected match re-confirmed pays a second +5 while a later reset removes only 5 — a permanent surplus. That happened.
> _Done when:_ on pays each member exactly +5 once · off removes exactly +5 · a repeat of either is a no-op · a non-manager is rejected · a group with unplayed matches can still be awarded (the organizer gets a confirm warning, but reversal must not gate on completeness).
>
> **Use cases you will meet this week:**
>
> 1. _A callable must be idempotent._ Two confirms fired close together — a mobile double-tap — each read a pre-confirm world and both applied ±3: winner +6, loser −6, spendable on Services. Read the applied flag **inside** the transaction, always.
> 2. _A deploy order that takes the site down._ Scoring has no fallback and the signup email check fails closed. reCAPTCHA key → functions → rules → hosting-with-App-Check-key. Any other order breaks scoring or signups.
> 3. _A field rename mid-deploy._ Ship **union whitelists** — old names and new both permitted — so the middle of a deploy is never a denied write. Strip the legacy name only after functions **and** hosting are both out.

---

### A2 · Data — `dev-data`

> **Mandate.** You own the shape of the data and every change to it. A field is stored **only if the server cannot derive it** — `points_spent` is the model case: it is stored, and totals and balances are derived at read.
>
> **You own:** the schema decisions [L1](HARMONIZATION_REPORT.md#L1)–[L18](HARMONIZATION_REPORT.md#L18), field naming, `scripts/migrations/**`, `scripts/backfill-*.mjs`, `firestore.indexes.json`, the stat definitions, exports and reconciliation.
>
> **You never touch:** `firestore.rules` (you propose the field whitelist, A1 writes it), `src/components/**`.
>
> **House rules:**
>
> - **One name per thing.** Every surviving duplicate pair in this codebase became a bug. Do not add another.
> - Every migration is reversible or it does not ship. `--dry-run` first, always, and the diff goes in your report.
> - Reconciliation baselines from the archived counter snapshot, **never** from matches. Counters are authoritative for pre-2026 history; all live match docs are 2026.
> - `users` must never carry `email` / `phone` / `whatsapp_contact` again. It is `allow read: if true` — anything there is public to the entire internet.
> - Collections were consolidated and discriminated by a `type` / `category` field. The legacy names are gone. Do not reintroduce one.
>
> **Verification:** `npm run migrations:*` dry-run, then `npm test`, then a recompute-and-diff against a seeded emulator. `R6` says all 204 stats docs satisfy `loses = matchesPlayed − wins` today. That must still hold after every pass you run.
>
> **Worked example — your [Sprint D1](../sprints/SPRINT-D1.md) task, [F2](WORKFLOW_DESIGN_REPORT.md#F2) + [L14](HARMONIZATION_REPORT.md#L14).**
>
> _Task:_ OAuth newcomers are stuck. `profileBootstrap.ts` writes `pointswon` and `totalPointsPlayed`; the `stats` whitelist rejects both, so the whole write fails and the member never gets a profile.
> _Build:_ L14 says neither field is stored — "P/G Won %" derives client-side from the member's matches. So this is one deletion, not a whitelist widening: drop both from the bootstrap write, drop both from the type, and write the migration that strips them from the 204 existing docs.
> _Done when:_ a fresh Google sign-in produces `users` + `stats` + `preferences` + `tasks` + `contacts` · `grep -rc 'pointswon\|totalPointsPlayed' src/` returns 0 outside the derivation helper · the strip migration's dry-run diff shows exactly 204 docs and no other field touched.
>
> **Use cases you will meet this week:**
>
> 1. _A field that looks derivable but is not._ `points_spent` is stored because the server cannot reconstruct what someone bought. `loses` is **not** stored because `matchesPlayed − wins` gives it. Apply that test to every L-row.
> 2. _A rename with live readers._ `req_zone_change` / `new_zone` replaced `zone_change_requested`. The rules whitelist still listed only the legacy pair, so `hasOnly()` rejected the whole update and **a player could not request a zone change at all.** Ship the union whitelist first, the rename second, the strip third.
> 3. _A migration you cannot undo._ Production is the only environment. Assume every destructive pass is permanent and behave accordingly.

---

### A3 · Client / Dev — `dev-client`

> **Mandate.** You own behaviour in the browser: hooks, services, derivation, routing, the draw engine, state. Presentation is not yours — props in, callbacks out belongs to A4.
>
> **You own:** `src/pages/tournament/useTournament.ts`, `rrGeneration.ts`, `utils.ts`, `src/features/**/hooks|services|domain|types`, `src/App.tsx`, `src/main.tsx`, and the hook/handler/effect hunks of `src/pages/*.tsx`.
>
> **You never touch:** `src/components/**`, `src/index.css`, the `*Elements.tsx` modules, `firestore.rules`, `functions/**`.
>
> **House rules:**
>
> - **Do not change a stored field or move a point without A2's amendment landing first.**
> - A denied `contacts` read is **normal**, not an error. `.catch()` each read individually — never wrap a batch in one `Promise.all().then()`. The connection doc lands a moment _after_ a request is accepted, and one denial otherwise rejects every contact on the page.
> - `currentMatches` must filter on `zone`. Every destructive path iterates it; without the zone term, resetting one zone deleted the other zone's matches and reversed those players' league points.
> - Winner advancement must normalize `zone` too — template match ids are identical across zone draws, so `matches.find` can write a winner over a real player's slot in the other zone, silently, and report success.
> - Never retry a failed write in a `.catch()` that clears the guard. That turned a rules rejection into an endless render→write→reject spin — the Profile page flicker.
>
> **Verification:** `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e`.
>
> **Worked example — your [Sprint D1](../sprints/SPRINT-D1.md) task, [LB-1](../ACTION-REPORT.md#LB-1). This is the highest-priority row in the entire audit.**
>
> _Task:_ `useTournament.ts:1826` sets `winnerUserId: match.player_1_uid` when the score modal opens. The fastest possible interaction — open, submit — records a 0-0 result the engine files as a **walkover paying a real 3/1** to whoever happens to be player 1. Against a production database with no backups.
> _Build:_ default `winnerUserId` to empty string. Disable Submit until a winner is chosen. Both handlers currently `return` silently when no winner is set — surface a message instead of a dead press.
> _Second site:_ submission now also flows through `src/features/tournament/domain/scoreSubmission.ts`. `:16` already refuses a blank winner. **Check both paths** — the refactor moved the flow but left the seed.
> _Done when:_ opening the modal selects neither player · Submit is disabled with a visible reason until a winner is picked · a blank `winner_uid` is refused at form, rules **and** callable · a unit test fails on the old code.
>
> **Use cases you will meet this week:**
>
> 1. _A stub that must become a call._ `handleSetGroupBonus` (`useTournament.ts:2231`) throws today. A1 builds the callable; you wire it and surface its errors. Do not reimplement the logic client-side — that is exactly what the server-authority work removed.
> 2. _A derivation with three definitions._ Streaks are computed three different ways and `status === 'complete'` silently excludes challenges and rallies, which are `'confirmed'`. Extract one predicate, have all three call it.
> 3. _An effect keyed wrong._ The merge-inference effect must key on `[matches, statsMap]`. Inside the matches snapshot callback `statsMap` is a stale `{}` closure, so every band lookup returns 0 and the inference silently falls back.

---

## 5 · Sprints

Five days, Mon 24 – Fri 28 Aug. Each sprint file is self-contained.

| Day        | Sprint                               | Theme                                         | File                                              |
| ---------- | ------------------------------------ | --------------------------------------------- | ------------------------------------------------- |
| **Mon 24** | **[S1](HARMONIZATION_REPORT.md#S1)** | Foundation and the live bugs                  | [`sprints/SPRINT-D1.md`](../sprints/SPRINT-D1.md) |
| **Tue 25** | **[S2](HARMONIZATION_REPORT.md#S2)** | Server authority and the new scoring contract | [`sprints/SPRINT-D2.md`](../sprints/SPRINT-D2.md) |
| **Wed 26** | **[S3](HARMONIZATION_REPORT.md#S3)** | Design foundation — tokens, then primitives   | [`sprints/SPRINT-D3.md`](../sprints/SPRINT-D3.md) |
| **Thu 27** | **[S4](HARMONIZATION_REPORT.md#S4)** | Data remodel, zones, withdrawal, the knockout | [`sprints/SPRINT-D4.md`](../sprints/SPRINT-D4.md) |
| **Fri 28** | **[S5](HARMONIZATION_REPORT.md#S5)** | Component system, roles, bookings, release    | [`sprints/SPRINT-D5.md`](../sprints/SPRINT-D5.md) |

### Phases, mapped to sprints

The remodel phases from `WORKFLOW_DESIGN_REPORT.md` land as follows.

| Phase                                    | Content                                                                                                                                                                                         | Sprint                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **NOW**                                  | [F1](WORKFLOW_DESIGN_REPORT.md#F1)–[F13](WORKFLOW_DESIGN_REPORT.md#F13), live bugs, the five branch conflicts                                                                                   | [S1](HARMONIZATION_REPORT.md#S1), [S2](HARMONIZATION_REPORT.md#S2) |
| **[P1](WORKFLOW_DESIGN_REPORT.md#P1)**   | Welcome email on first name set                                                                                                                                                                 | S1                                                                 |
| **[P2a](WORKFLOW_DESIGN_REPORT.md#P2a)** | Per-event zone, zone-request rework, withdrawal data, doubles partner shape, format lock, `events/ladder`, `profile_details_visible` dropped, late-join placer removed                          | [S4](HARMONIZATION_REPORT.md#S4)                                   |
| **[P3](WORKFLOW_DESIGN_REPORT.md#P3)**   | `requested_by` scheduling, deadlines per draw and round, notification noise and purge, `eventOrganizerUids`                                                                                     | [S3](HARMONIZATION_REPORT.md#S3) (A1), S4                          |
| **[P4b](WORKFLOW_DESIGN_REPORT.md#P4b)** | Score modal rework, task counters on apply/reverse, conversion removed, server placer, multi-draw membership, merges persisted, knockout bar, withdrawal walkovers, partner access, P/G derived | S2, S4                                                             |
| **[P5](WORKFLOW_DESIGN_REPORT.md#P5)**   | Organizer-assignment UI, admin recovery, `event_creator` fallback end                                                                                                                           | [S5](HARMONIZATION_REPORT.md#S5)                                   |
| **[P6b](WORKFLOW_DESIGN_REPORT.md#P6b)** | Claim review by organizer, ambassador auto-approve, claim dedupe, checklist `category`                                                                                                          | S5                                                                 |
| **[P6c](WORKFLOW_DESIGN_REPORT.md#P6c)** | Bookings lifecycle, catalog callable, `redemption_locks` removed                                                                                                                                | S5                                                                 |
| **Design**                               | The 272 UI action rows                                                                                                                                                                          | S3 (foundation), S5 (component system)                             |

---

## 6 · The board

Tasks by lane, phase and sprint. Row ids are the audit's; open the sprint file for the detail.

### Lane — Rules + Functions (A1)

| Task                                                                                                  | Rows                                                                                                                                        | Phase                                    | Sprint                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| Court check-in: client writes attendance, server stamps the passport                                  | [F1](WORKFLOW_DESIGN_REPORT.md#F1), [LB-16](../ACTION-REPORT.md#LB-16)                                                                      | NOW                                      | [S1](HARMONIZATION_REPORT.md#S1) |
| Welcome email bypasses the delivery gate; fires on first name set                                     | [F4](WORKFLOW_DESIGN_REPORT.md#F4)                                                                                                          | NOW / [P1](WORKFLOW_DESIGN_REPORT.md#P1) | S1                               |
| Group awards skip `no_account`                                                                        | [F13](WORKFLOW_DESIGN_REPORT.md#F13)                                                                                                        | NOW                                      | S1                               |
| Rank snapshot weekly → daily                                                                          | [F12](WORKFLOW_DESIGN_REPORT.md#F12)                                                                                                        | NOW                                      | S1                               |
| Deploy runbook; deployed-vs-repo rules diff                                                           | [conflict 6](DEV_ANUJ_CONFLICTS.md#6-deployment-order--trap)                                                                                | NOW                                      | S1                               |
| Organizer rescore: reverse-then-reapply in one transaction                                            | [conflict 1](DEV_ANUJ_CONFLICTS.md#1-organizer-score-editing--broken), [D3](HARMONIZATION_REPORT.md#D3)                                     | NOW                                      | [S2](HARMONIZATION_REPORT.md#S2) |
| Score validator at callable and rules — the twelve examples                                           | [conflict 2](DEV_ANUJ_CONFLICTS.md#2-set-score-bounds--gap)                                                                                 | NOW                                      | S2                               |
| `challengeResults` callable; restore the event-manager confirm branch                                 | [conflict 3](DEV_ANUJ_CONFLICTS.md#3-ladder-confirmation--broken), [D2](HARMONIZATION_REPORT.md#D2)                                         | NOW                                      | S2                               |
| `setGroupBonus` callable; `rr_groupbonus` stamp is the receipt                                        | [conflict 4](DEV_ANUJ_CONFLICTS.md#4-round-robin-group-bonus--broken), [N2](HARMONIZATION_REPORT.md#N2)                                     | NOW                                      | S2                               |
| `onParticipantJoin` connections trigger; drop super-admin contacts read                               | [conflict 5](DEV_ANUJ_CONFLICTS.md#5-organizer-contact-access--gap), [F6](WORKFLOW_DESIGN_REPORT.md#F6), [L13](HARMONIZATION_REPORT.md#L13) | NOW                                      | S2                               |
| **Auto-approval, margin reconcile, dispute flag**                                                     | **new**                                                                                                                                     | NOW                                      | S2                               |
| Walkovers only — remove `no_show` from the model and the points path                                  | [D6](HARMONIZATION_REPORT.md#D6), [L10](HARMONIZATION_REPORT.md#L10)                                                                        | [P4b](WORKFLOW_DESIGN_REPORT.md#P4b)     | S2                               |
| Notification noise: one draw notice, join digest, weekly deadline                                     | —                                                                                                                                           | [P3](WORKFLOW_DESIGN_REPORT.md#P3)       | [S3](HARMONIZATION_REPORT.md#S3) |
| Rules whitelists for every [S4](HARMONIZATION_REPORT.md#S4) field; `onZoneChanged` both-draws default | [L15](HARMONIZATION_REPORT.md#L15), S3, S4                                                                                                  | [P2a](WORKFLOW_DESIGN_REPORT.md#P2a)     | S4                               |
| Server-side placer on participant-create                                                              | [D5](HARMONIZATION_REPORT.md#D5)                                                                                                            | P4b                                      | S4                               |
| Withdrawal operation applying walkovers through the result path                                       | [L12](HARMONIZATION_REPORT.md#L12)                                                                                                          | P4b                                      | S4                               |
| `providers` cutover; `event_creator` ends; admin recovery script                                      | [PD5](DECISIONS_BRIEF.md#PD5), [PD6](DECISIONS_BRIEF.md#PD6), [S6](HARMONIZATION_REPORT.md#S6)                                              | [P5](WORKFLOW_DESIGN_REPORT.md#P5)       | [S5](HARMONIZATION_REPORT.md#S5) |
| Bookings callables; claim review; ambassador auto-approve                                             | [L11](HARMONIZATION_REPORT.md#L11)                                                                                                          | [P6b](WORKFLOW_DESIGN_REPORT.md#P6b)/c   | S5                               |

### Lane — Data (A2)

| Task                                                                                                 | Rows                                                                                                                                  | Phase                                  | Sprint                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| Strip `pointswon` / `totalPointsPlayed`; unblock OAuth bootstrap                                     | [F2](WORKFLOW_DESIGN_REPORT.md#F2), [L14](HARMONIZATION_REPORT.md#L14)                                                                | NOW                                    | [S1](HARMONIZATION_REPORT.md#S1) |
| `result_at`; idempotency hash inside `score_pending`; `organizer_ids`                                | [L2](HARMONIZATION_REPORT.md#L2), [L3](HARMONIZATION_REPORT.md#L3), [L4](HARMONIZATION_REPORT.md#L4)                                  | NOW                                    | [S2](HARMONIZATION_REPORT.md#S2) |
| Two-submission shape on the match doc                                                                | new                                                                                                                                   | NOW                                    | S2                               |
| Stat definitions: one Matches population, one `pgWinPct`, one streak, one skill label, one rank pool | [LB-7](../ACTION-REPORT.md#LB-7)…[LB-15](../ACTION-REPORT.md#LB-15)                                                                   | [P4b](WORKFLOW_DESIGN_REPORT.md#P4b)   | [S3](HARMONIZATION_REPORT.md#S3) |
| Surface `Losses`; delete `rankPosition` and `tournamentsPlayed`                                      | [DC-11](../ACTION-REPORT.md#DC-11), [DC-12](../ACTION-REPORT.md#DC-12)                                                                | P4b                                    | S3                               |
| Per-event participant `zone`; `preferred_zone_manual`                                                | [L15](HARMONIZATION_REPORT.md#L15), [L5](HARMONIZATION_REPORT.md#L5)                                                                  | [P2a](WORKFLOW_DESIGN_REPORT.md#P2a)   | [S4](HARMONIZATION_REPORT.md#S4) |
| Withdrawal fields replacing the removal flag and the RR withdrawn list                               | [L12](HARMONIZATION_REPORT.md#L12)                                                                                                    | P2a                                    | S4                               |
| Doubles partner shape and partner pool                                                               | [L18](HARMONIZATION_REPORT.md#L18)                                                                                                    | P2a                                    | S4                               |
| Drop `profile_details_visible`; ladder keeps `event_id`, `events/ladder`                             | [L6](HARMONIZATION_REPORT.md#L6), [L1](HARMONIZATION_REPORT.md#L1), [LB-44](../ACTION-REPORT.md#LB-44)                                | P2a                                    | S4                               |
| `available_to_play`; `zone_draw_config`; deadlines per draw and round                                | [L16](HARMONIZATION_REPORT.md#L16), [L7](HARMONIZATION_REPORT.md#L7), [L17](HARMONIZATION_REPORT.md#L17)                              | P2a/P3                                 | S4                               |
| `providers`; bookings lifecycle; `services` catalog; `group_lessons` retires                         | [L11](HARMONIZATION_REPORT.md#L11), [N1](HARMONIZATION_REPORT.md#N1), [L8](HARMONIZATION_REPORT.md#L8), [PD2](DECISIONS_BRIEF.md#PD2) | [P5](WORKFLOW_DESIGN_REPORT.md#P5)/P6c | [S5](HARMONIZATION_REPORT.md#S5) |

### Lane — Client / Dev (A3)

| Task                                                            | Rows                                                                                                                                                                                                                                                                                                                            | Phase                                  | Sprint                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| **Score modal winner seed — live point corruption**             | **[LB-1](../ACTION-REPORT.md#LB-1)**                                                                                                                                                                                                                                                                                            | NOW                                    | [S1](HARMONIZATION_REPORT.md#S1) |
| Placeholder matches pinning the Knockout gate shut              | [LB-2](../ACTION-REPORT.md#LB-2)                                                                                                                                                                                                                                                                                                | NOW                                    | S1                               |
| Batched `contacts` reads split into per-id catches              | [LB-3](../ACTION-REPORT.md#LB-3), [LB-4](../ACTION-REPORT.md#LB-4), [F3](WORKFLOW_DESIGN_REPORT.md#F3)                                                                                                                                                                                                                          | NOW                                    | S1                               |
| Signup reporting success after a failed write                   | [LB-6](../ACTION-REPORT.md#LB-6)                                                                                                                                                                                                                                                                                                | NOW                                    | S1                               |
| Dead and silent controls                                        | [LB-19](../ACTION-REPORT.md#LB-19)…[LB-29](../ACTION-REPORT.md#LB-29), [LB-31](../ACTION-REPORT.md#LB-31)…[LB-37](../ACTION-REPORT.md#LB-37), [LB-39](../ACTION-REPORT.md#LB-39), [LB-42](../ACTION-REPORT.md#LB-42), [LB-45](../ACTION-REPORT.md#LB-45), [LB-47](../ACTION-REPORT.md#LB-47)…[LB-50](../ACTION-REPORT.md#LB-50) | NOW                                    | S1                               |
| Wire the five new callables; remove client-side points paths    | conflicts 1–4                                                                                                                                                                                                                                                                                                                   | NOW                                    | [S2](HARMONIZATION_REPORT.md#S2) |
| Three-layer score validation reconciled                         | [LB-5](../ACTION-REPORT.md#LB-5)                                                                                                                                                                                                                                                                                                | NOW                                    | S2                               |
| Routing: named tabs, catch-all, login bounce, scroll-on-query   | [RT-1](../ACTION-REPORT.md#RT-1)…[RT-6](../ACTION-REPORT.md#RT-6)                                                                                                                                                                                                                                                               | —                                      | [S3](HARMONIZATION_REPORT.md#S3) |
| Dead code removal                                               | [DC-1](../ACTION-REPORT.md#DC-1)…[DC-14](../ACTION-REPORT.md#DC-14)                                                                                                                                                                                                                                                             | —                                      | S3                               |
| One profile-completeness set; delete the modal and the nag      | [F7](WORKFLOW_DESIGN_REPORT.md#F7)                                                                                                                                                                                                                                                                                              | [P2a](WORKFLOW_DESIGN_REPORT.md#P2a)   | [S4](HARMONIZATION_REPORT.md#S4) |
| Single `resolveZone`; manual flag on explicit picks             | [F8](WORKFLOW_DESIGN_REPORT.md#F8)                                                                                                                                                                                                                                                                                              | NOW                                    | S4                               |
| Skill edit stops rewriting `event_participants.skill`           | [F9](WORKFLOW_DESIGN_REPORT.md#F9), [LB-17](../ACTION-REPORT.md#LB-17)                                                                                                                                                                                                                                                          | NOW                                    | S4                               |
| `isEventManager` helper; `available_to_play` toggle             | [F10](WORKFLOW_DESIGN_REPORT.md#F10), [F11](WORKFLOW_DESIGN_REPORT.md#F11)                                                                                                                                                                                                                                                      | NOW                                    | S4                               |
| **Knockout fully organizer-controlled**                         | [KO-1](../ACTION-REPORT.md#KO-1), [KO-2](../ACTION-REPORT.md#KO-2), [KO-3](../ACTION-REPORT.md#KO-3)                                                                                                                                                                                                                            | [P4b](WORKFLOW_DESIGN_REPORT.md#P4b)   | S4                               |
| Knockout size bar expand-only; reset scoped to one draw         | [R-4](../ACTION-REPORT.md#R-4)                                                                                                                                                                                                                                                                                                  | P4b                                    | S4                               |
| Event-scoped organizer honoured; checklist writes only the flag | —                                                                                                                                                                                                                                                                                                                               | [P5](WORKFLOW_DESIGN_REPORT.md#P5)/P6b | [S5](HARMONIZATION_REPORT.md#S5) |

### Lane — UI/UX (A4)

| Task                                                                                        | Rows                                                                                                                                                                                                                                                                                                                                                                                                                         | Phase                                | Sprint                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------- |
| Crash screen white heading; Escape closes only the top overlay                              | [CT-12](../ACTION-REPORT.md#CT-12), [LB-30](../ACTION-REPORT.md#LB-30)                                                                                                                                                                                                                                                                                                                                                       | NOW                                  | [S1](HARMONIZATION_REPORT.md#S1) |
| Score modal rework: no preselected winner, Walkover switch, number fields, delete `Stepper` | [R-5](../ACTION-REPORT.md#R-5), [BT-14](../ACTION-REPORT.md#BT-14)                                                                                                                                                                                                                                                                                                                                                           | [P4b](WORKFLOW_DESIGN_REPORT.md#P4b) | [S2](HARMONIZATION_REPORT.md#S2) |
| Dispute banner and the two notification strings                                             | new                                                                                                                                                                                                                                                                                                                                                                                                                          | NOW                                  | S2                               |
| **Token split — page / card / recess, accent retune, the 5 literals**                       | [CT-1](../ACTION-REPORT.md#CT-1), [CT-2](../ACTION-REPORT.md#CT-2), [CT-15](../ACTION-REPORT.md#CT-15), [CT-17](../ACTION-REPORT.md#CT-17), [DC-15](../ACTION-REPORT.md#DC-15)                                                                                                                                                                                                                                               | —                                    | [S3](HARMONIZATION_REPORT.md#S3) |
| Card borders removed, fill separates                                                        | [CT-32](../ACTION-REPORT.md#CT-32), [R-2](../ACTION-REPORT.md#R-2)                                                                                                                                                                                                                                                                                                                                                           | —                                    | S3                               |
| Focus ring, reduced motion, disabled base                                                   | [AX-2](../ACTION-REPORT.md#AX-2), [AX-24](../ACTION-REPORT.md#AX-24), [BT-11](../ACTION-REPORT.md#BT-11), [BT-12](../ACTION-REPORT.md#BT-12)                                                                                                                                                                                                                                                                                 | —                                    | S3                               |
| `Button.tsx` — 91 call sites from one file                                                  | [BT-1](../ACTION-REPORT.md#BT-1), [BT-3](../ACTION-REPORT.md#BT-3)…[BT-8](../ACTION-REPORT.md#BT-8), [CT-13](../ACTION-REPORT.md#CT-13), [DC-16](../ACTION-REPORT.md#DC-16)                                                                                                                                                                                                                                                  | —                                    | S3                               |
| `Input.tsx` + the three page `fieldCls`                                                     | [MF-5](../ACTION-REPORT.md#MF-5), [MF-6](../ACTION-REPORT.md#MF-6), [TY-5](../ACTION-REPORT.md#TY-5)                                                                                                                                                                                                                                                                                                                         | —                                    | S3                               |
| `Sheet.tsx` — behaviour, then padding/header/footer                                         | [MF-1](../ACTION-REPORT.md#MF-1)…[MF-4](../ACTION-REPORT.md#MF-4), [MF-14](../ACTION-REPORT.md#MF-14), [MF-15](../ACTION-REPORT.md#MF-15), [CT-14](../ACTION-REPORT.md#CT-14), [AX-1](../ACTION-REPORT.md#AX-1)                                                                                                                                                                                                              | —                                    | S3                               |
| `SegmentedControl`, `ContactOpponentButton`, `Accordion`/`Tree`/`PlayerCard`, `LoadingBar`  | [BT-13](../ACTION-REPORT.md#BT-13), [BT-24](../ACTION-REPORT.md#BT-24), [AX-7](../ACTION-REPORT.md#AX-7), [BT-2](../ACTION-REPORT.md#BT-2), [CS-45](../ACTION-REPORT.md#CS-45), [DC-1](../ACTION-REPORT.md#DC-1), [BT-15](../ACTION-REPORT.md#BT-15), [AX-17](../ACTION-REPORT.md#AX-17), [AX-23](../ACTION-REPORT.md#AX-23), [CT-24](../ACTION-REPORT.md#CT-24)                                                             | —                                    | S3                               |
| The eight one-row files; the canon into `CLAUDE.md`                                         | CT-12, [CS-65](../ACTION-REPORT.md#CS-65), [AX-19](../ACTION-REPORT.md#AX-19), [RT-9](../ACTION-REPORT.md#RT-9), [AX-18](../ACTION-REPORT.md#AX-18), [BT-29](../ACTION-REPORT.md#BT-29), [DC-9](../ACTION-REPORT.md#DC-9), [DC-10](../ACTION-REPORT.md#DC-10), [TY-3](../ACTION-REPORT.md#TY-3), [DC-22](../ACTION-REPORT.md#DC-22)…[DC-27](../ACTION-REPORT.md#DC-27)                                                       | —                                    | S3                               |
| "Enter A Zone" modal; Withdraw / Reset / orange **!**; partner pool; Away pill              | —                                                                                                                                                                                                                                                                                                                                                                                                                            | [P2a](WORKFLOW_DESIGN_REPORT.md#P2a) | [S4](HARMONIZATION_REPORT.md#S4) |
| Component system — 22 new primitives, the CS rows, the per-site sweeps                      | [CS-2](../ACTION-REPORT.md#CS-2)…[CS-68](../ACTION-REPORT.md#CS-68), [CT-3](../ACTION-REPORT.md#CT-3)…[CT-11](../ACTION-REPORT.md#CT-11), [BT-9](../ACTION-REPORT.md#BT-9)…[BT-28](../ACTION-REPORT.md#BT-28), [TY-1](../ACTION-REPORT.md#TY-1)…[TY-10](../ACTION-REPORT.md#TY-10), [AX-3](../ACTION-REPORT.md#AX-3)…[AX-26](../ACTION-REPORT.md#AX-26), [MF-7](../ACTION-REPORT.md#MF-7)…[MF-13](../ACTION-REPORT.md#MF-13) | —                                    | [S5](HARMONIZATION_REPORT.md#S5) |
| Bookings UI; delete the freeze-list surfaces                                                | —                                                                                                                                                                                                                                                                                                                                                                                                                            | [P6c](WORKFLOW_DESIGN_REPORT.md#P6c) | S5                               |

### Lane — Verify (A5)

| Task                                                                                         | Phase                                    | Sprint                           |
| -------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| Branches cut; `docs/` and `.design-sync/` committed; clean verification run green            | NOW                                      | [S1](HARMONIZATION_REPORT.md#S1) |
| Grade the three pending design-sync reviews; add 13 previews + light cell + `Target44` guide | NOW                                      | S1                               |
| Regression test per live-bug row                                                             | NOW                                      | S1                               |
| The twelve score examples; the three reconcile cases; double-tap pays once                   | NOW                                      | [S2](HARMONIZATION_REPORT.md#S2) |
| Grep-assertion suite; design-sync diffs in both cells                                        | —                                        | [S3](HARMONIZATION_REPORT.md#S3) |
| Migration dry-run diffs; the seven journeys                                                  | [P2a](WORKFLOW_DESIGN_REPORT.md#P2a)/P4b | [S4](HARMONIZATION_REPORT.md#S4) |
| Full regression; recompute-and-diff; release runbook executed on a preview channel           | —                                        | [S5](HARMONIZATION_REPORT.md#S5) |

---

## 7 · Deploy order — the `TRAP`

Scoring has no fallback and the signup email check fails closed. A wrong order takes down scoring or signups.

```text
1. Firebase console: reCAPTCHA Enterprise key registered
2. firebase deploy --only functions
3. firebase deploy --only firestore:rules[,storage]
4. hosting build with VITE_FIREBASE_APP_CHECK_SITE_KEY, then deploy
```

- `tbtc` is the **test** environment. `storage.rules` is still in progress there; the "deploying replaces the console copy" warning applies when **promoting to the live project**, not to test deploys.
- Rules and storage rules require a **manual deploy**. A git push deploys nothing.
- Functions deploy individually — `firebase deploy --only functions:onZoneChanged`.
- Every phase deploys **functions → rules → hosting** with **union whitelists**, so the middle of a deploy is never a denied write.
- Strip legacy names (`claimed_winner_*`, `score_line`, `zone_change_requested*`) only after functions **and** hosting are both out.

---

## 8 · Do not touch

Everything the remodel deletes. Restyling any of it is thrown-away work.

| Surface                                                                                | Retires                                                                           | Phase                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- |
| `CompleteProfileModal.tsx` + the Matches gate                                          | 18 restyled elements — the largest block of thrown-away work in the audit         | [S4](HARMONIZATION_REPORT.md#S4) |
| The Profile Tasks nag block                                                            | with the gate chain                                                               | S4                               |
| The Profile day-toggle grid                                                            | also retires [BT-18](../ACTION-REPORT.md#BT-18)                                   | S4                               |
| The organizer date / AM-PM / Set scheduling controls and their two toasts              | no dates are stored after [P3](WORKFLOW_DESIGN_REPORT.md#P3)                      | S4                               |
| The score-modal no-show cluster, the `RRGroupCard` no-show branches, the no-show toast | the whole no-show concept goes                                                    | [S2](HARMONIZATION_REPORT.md#S2) |
| The "Also count as a Challenge" checkbox and `proposeConversion`                       | one physical match counts once                                                    | S2                               |
| The Services Dispute and Cancel controls and their six status strings                  | lifecycle becomes lead → in_progress → completed                                  | [S5](HARMONIZATION_REPORT.md#S5) |
| The ReviewQueue coupon section — **in both `ServicesElements.tsx` and `Tasks.tsx`**    | a one-sided delete strands orphan copy                                            | S5                               |
| `GroupLessonCard` and its four callable error strings                                  | retires [LB-38](../ACTION-REPORT.md#LB-38)                                        | S5                               |
| `OPEN_STATUSES` and the open-coupon list gate                                          | status set replaced wholesale                                                     | S5                               |
| The super-admin `AddServiceForm`                                                       | retires [AX-12](../ACTION-REPORT.md#AX-12) and [CS-58](../ACTION-REPORT.md#CS-58) | S5                               |
| `profile_details_visible` and both consumers                                           | hides only the League pill, already public                                        | S4                               |

**One reversal to honour:** the **Request Zone Change** flow is **no longer frozen**. It is kept and reworked, so it migrates with everything else.

**Deliberately not frozen despite adjacent deletions:** the round-deadline inputs (kept and expanded) and the RR knockout size bar (becomes organizer-only and expand-only).

---

## 9 · Risks

| #   | Risk                                                                                                           | Mitigation                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two agents in one page file                                                                                    | §3 path ownership. On `src/pages/*.tsx`, A3 first, A4 rebases, never both in one day                                                                                                          |
| 2   | A destructive migration with no way back                                                                       | Every script `--dry-run` first; the diff goes in the report before anything is applied                                                                                                        |
| 3   | `matchAward` and `computeGroupStandings` re-fork                                                               | They change in **one commit**. This has already happened once and paid players points nobody had given them                                                                                   |
| 4   | Restyling something the remodel deletes                                                                        | §8 is binding on A4                                                                                                                                                                           |
| 5   | Rules deployed ≠ rules in repo                                                                                 | A1's day-1 delta report; re-checked at release                                                                                                                                                |
| 6   | **Stale citations.** `dev-anuj` is 116 commits ahead of the audited tree; every UI row's `file:line` has moved | Sprint files carry re-verified `dev-anuj` line numbers. **Re-cite a row when you touch it, never in bulk** — a bulk re-citation of 273 rows costs more than it saves and the files move again |
| 7   | The auto-approval rule contradicts three decided documents                                                     | Each carries a dated amendment pointing at §2 of this plan. A decided doc that contradicts the build is how the last drift happened                                                           |
| 8   | A knockout dispute resolved after the next round is played                                                     | The organizer's winner flip is **refused with a message** when the next match already holds a completed or submitted result                                                                   |

---

## 10 · Decisions taken

| #   | Decision                                                                                                                                                      | Source                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Five agents, one branch each                                                                                                                                  | you, 2026-08-23                                                  |
| 2   | Work against `tbtc/dev-anuj`; `main` is 116 behind with nothing of its own                                                                                    | `UI-REMAINING.md` §7                                             |
| 3   | Backup and restore policy ([PD8](DECISIONS_BRIEF.md#PD8)) — **deferred**, no commitment yet                                                                   | you                                                              |
| 4   | Score auto-applies on submission; **lower aggregate winning margin wins**; different winners flag for review; the first submitted result shows until resolved | you — **replaces [D4](HARMONIZATION_REPORT.md#D4)**              |
| 5   | Auto-approval covers tournaments, challenges **and** friendlies                                                                                               | you                                                              |
| 6   | Walkovers are organizer-only                                                                                                                                  | you                                                              |
| 7   | Notifications: winner _"Win recorded — {score}"_, loser _"Score recorded — {score}"_                                                                          | you                                                              |
| 8   | Source documents are amended to match                                                                                                                         | you                                                              |
| 9   | 63 form fields reach 44px via `min-h-11` on the control — the `.hit-44` pseudo-element never renders on `<input>`/`<select>`                                  | you (Q-D)                                                        |
| 10  | "Matches" = `stats.matchesPlayed` everywhere; the Profile P/G fallback is deleted, `—` is the truthful answer                                                 | **assumed** — Q-E was not answered. Say if you want it otherwise |
| 11  | `storage.rules` console-replace warning applies to the live promotion only                                                                                    | you                                                              |
| 12  | Re-cite a row when you touch it, never in bulk                                                                                                                | you                                                              |
