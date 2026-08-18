# Firestore Consolidation — Migration Report

**Project:** `toronto-tennis-league` · **Cutover completed:** 2026-08-10

Consolidated 13 legacy collections into 4 (`courts`, `matches`, `tasks`, `offers`), discriminated
by a `type`/`category` field rather than by collection name, and standardised every owner
reference to `uid`. This report records what moved, what was already done before this pass, the
defects found en route, and what remains.

---

## 1. Final collection state

| Collection | Docs | Note |
|---|---:|---|
| `users` | 189 | doc id = uid |
| `contacts` | 186 | PII split out of `users` |
| `stats` | 191 | |
| `preferences` | 191 | |
| `events` | 10 | |
| `event_participants` | 285 | |
| `matches` | 328 | singles 273 · rally 27 · challenge 22 · doubles 6 |
| `courts` | 74 | check-in / attendance / condition / waiting_board / queue |
| `tasks` | 190 | 149 progress · 25 group · 16 offer *(9 canonical + 7 duplicates pending removal)* |
| `offers` | 1 | per-user redeemable balance |
| `redemptions` | 1 | |
| `listings` | 6 | Marketplace |
| `task_claims` | 1 | |
| `notifications` | 714 | |
| `rr_drafts` | 4 | |
| `site_stats` | 6 | |
| `email_log` | 7 | |
| `ranking_history` | 0 | top-level empty by design — entries live in `{uid}/entries` subcollections |
| `_archive_database_consolidation` | 163 | pre-deletion snapshots (Admin SDK only) |

**Legacy collections remaining: 1 of 13** — a single `task_progress` doc, re-created after
deletion (see §4).

## 2. What moved

Migrated and deleted **before** this pass, by earlier tooling — **without an archive**, so these
have no rollback snapshot:

`court_visits` · `court_attendance` · `court_reports` · `court_suggestions` ·
`tournament_matches` · `rallies` · `score_submissions` · `group_awards` · `zone_sweeps`

Completed **in** this pass, all archived first:

| Source | Docs | Destination | Outcome |
|---|---:|---|---|
| `ladder_challenges` | 4 | `matches` (`category:'challenge'`) | 4 live challenges — 2 already `accepted` — that the deployed build could not see. `matches` 324 → 328. |
| `task_progress` | 149 | `tasks` | 148 already present; 1 missing copied, 1 differing left as the newer live `tasks` version. |
| `rewards` | 9 | `tasks` (`type:'offer'`) | Re-seeded with full pricing at canonical bare ids. |
| `redeemable` | 1 | `offers` | Already copied under the same id; retired. |

Archive contents: `ladder_challenges` 4 · `redeemable` 1 · `rewards` 9 · `task_progress` 149.

**Phase D (uid standardisation)** backfilled 43 notifications and one doc each in `users`,
`stats`, `preferences`, and `event_participants`.

## 3. Defects found and fixed

**Offer catalog was corrupt.** The 7 migrated `tasks` offer docs had lost `points_cost`, `offer`,
and all prices, and carried wrongly prefixed ids (`offer_pandemic-tennis`). `seed-rewards.mjs`,
`functions/rewards.js` (`doc('tasks/'+rewardId)`), and the live `redemptions.reward_id` all agree
the canonical id is the **bare** slug — so redemption lookup could never have resolved them.
Re-seeded at bare ids with full pricing; provider `karan` display name set to **Tivoryx**.

**Three security-rule regressions in the new `matches` block** — all player-facing features that
worked under the legacy rules and were silently denied after consolidation:

1. `create` rejected `category:'score_submission'` → **players could not submit scores**.
2. `delete` required event-creator → **players could not cancel their own rally or challenge**,
   and `onRallyDeleted` / `onLadderChallengeDeleted` could never fire from a client action.
3. `update` permitted only the five scheduling keys → **accept/decline and result reporting were
   denied**, breaking `respondRally`, `respondChallenge`, `reportChallenge`, `confirmConversion`.

Additionally, every `isCreatorOfEvent()` call in that block read `event_id` unguarded. A rally
carries no `event_id`, and reading a missing field errors and denies the whole request — so rally
creation was failing on the first clause regardless. All calls are now guarded with
`'event_id' in …`.

**Two migration-script bugs** in `consolidate-db.cjs`: the `zone_sweeps` loop had no in-loop batch
commit (would exceed the 500-write cap past 450 docs), and `renameFieldInCollection` only *added*
the new key, never removing the old — which is why duplicates existed at all.

**One field wrongly assumed legacy.** `submitted_by` looks like a legacy alias but is live —
written by `useTournament.ts:1623`, read by `functions/notifications.js:135`. Excluded from
stripping; had it been removed, score-submission notifications would have broken.

## 4. Duplication audit (`uid` vs `user_id`)

Scan of every collection for a legacy field co-existing with its canonical twin.

**Resolved** — duplicates stripped across `notifications`, `event_participants`, `courts`,
`listings`, `task_claims`, `redemptions`, and `matches` (`player_1_user_id`, `player_2_user_id`,
`winner_user_id`, `challenger_id`, `opponent_id`, `from_id`, `to_id`, `claimed_winner_id`,
`claimed_winner_user_id`).

**Outstanding — 150 docs still carry both:**

| Collection | Docs | Fields | Cause |
|---|---:|---|---|
| `tasks` | 149 | `user_id` + `uid` | Omitted from the strip map |
| `offers` | 1 | `user_id` + `uid` | Omitted from the strip map |

**Outstanding — legacy field with no canonical (3 docs):**

| Collection | Docs | Detail |
|---|---:|---|
| `notifications` | 2 | `ladder_cancelled`, 17:40:16. The migration's delete fired the then-still-deployed legacy `onLadderChallengeDeleted` trigger, sending two players a spurious "challenge cancelled" notice. Written by the old `notify.js` with `recipient_id`, so they are already invisible in the bell. |
| `task_progress` | 1 | Re-created 17:40:57 by a stale browser session on the pre-cutover bundle. Verified to contain nothing its `tasks` twin lacks. The deployed rules no longer grant `task_progress`, so this cannot recur. |

**Not defects** (flagged by the scan, expected by design):
`contacts` has no `uid` field — the doc id is the uid and `ContactData` never declared one. The 9
`tasks` offer-catalog docs have no `uid` — they are catalog entries, not per-user documents.

## 5. Cleanup pass — complete

A follow-up pass resolved all four outstanding items:

- Stripped `user_id` from 149 `tasks` docs and 1 `offers` doc.
- Deleted the 7 duplicate `offer_*` catalog docs, taking the Services catalog from 16 to 9.
- Deleted the re-created `task_progress` doc, retiring the last legacy collection.
- Deleted the 2 orphan `ladder_cancelled` notifications.

**Post-cleanup verification:** 0 legacy collections · 0 duplicate field pairs · 0 legacy-only
fields · offer catalog 9 docs, all priced. Counts settled at `tasks` 183, `notifications` 712,
`matches` 328.

The migration tooling (`scripts/consolidate-db.cjs`, `scripts/consolidation-cleanup.cjs`, and the
three `consolidate:*` npm entries) has been removed.

## 6. Rollback position

The uncommitted working tree remains the code-level rollback point (GitHub branch unchanged).
For data: the 4 collections retired in this pass are recoverable from
`_archive_database_consolidation`. The 9 retired earlier are **not** — they were deleted without
an archive, before this pass began.
