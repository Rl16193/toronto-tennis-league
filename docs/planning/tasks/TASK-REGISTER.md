# Task register — every task, and the sprint it belongs to

**121 tasks across four sprints.** This is the index. The full before/after, acceptance
criteria and exit conditions live in the per-sprint breakdowns.

| Sprint                        | Phase                         | Jobs     | Tasks | Breakdown                  |
| ----------------------------- | ----------------------------- | -------- | ----: | -------------------------- |
| [D6](../sprints/SPRINT-D6.md) | M1 — the five non-negotiables | 26       |    41 | [TASKS-D6.md](TASKS-D6.md) |
| [D7](../sprints/SPRINT-D7.md) | M2 — UI/UX simplification     | 7 groups |    56 | [TASKS-D7.md](TASKS-D7.md) |
| [D8](../sprints/SPRINT-D8.md) | M3 — additional scope         | 7        |    12 | [TASKS-D8.md](TASKS-D8.md) |
| [D9](../sprints/SPRINT-D9.md) | M4 — payment gateway          | 6        |    12 | [TASKS-D9.md](TASKS-D9.md) |

**Id shape:** `<SPRINT>-<JOB>-T<n>`. Every task closes on the same four conditions — its
acceptance criteria pass, `npm run verify` is green, both reviews are PASS, and no findings are
outstanding. Anything a task needs beyond that is in its **Exit adds** column.

---

## D6 — corrections and the partner pool · phase M1

| Task ID   | Title                               | Job | Lane         |
| --------- | ----------------------------------- | --- | ------------ |
| D6-V1-T1  | Confirm the base is green           | V1  | A5           |
| D6-C1-T1  | Unblock the knockout gate           | C1  | A3           |
| D6-C2-T1  | Restore points won and total played | C2  | A1           |
| D6-C3-T1  | `tournamentsPlayed` on join         | C3  | A1           |
| D6-C3-T2  | `tournamentsPlayed` backfill        | C3  | A2           |
| D6-C4-T1  | Delete `loses` from code            | C4  | A1 + A3      |
| D6-C4-T2  | Strip `loses` from stored data      | C4  | A2           |
| D6-C5-T1  | One award table                     | C5  | A1           |
| D6-C6-T1  | Rename the booking stamp            | C6  | A3 + A1      |
| D6-C7-T1  | Delete dead code                    | C7  | A3           |
| D6-C8-T1  | Remove group lessons and lock       | C8  | A1           |
| D6-C8-T2  | Rebuild coach ↔ player contacts     | C8  | A1           |
| D6-C8-T3  | Confirm the Book button             | C8  | A4           |
| D6-C9-T1  | No-show leftovers                   | C9  | A1           |
| D6-C10-T1 | Retire `result_application`         | C10 | A1           |
| D6-C11-T1 | Mistyped addresses go home          | C11 | A3           |
| D6-C12-T1 | `services` security rules           | C12 | A1           |
| D6-C13-T1 | Score margin threshold 10 → 21      | C13 | A1 + A3      |
| D6-C14-T1 | No re-notification on a lower score | C14 | A1           |
| D6-C15-T1 | One result model — server           | C15 | A1           |
| D6-C15-T2 | One result model — client and words | C15 | A3           |
| D6-C16-T1 | Re-seat a re-added participant      | C16 | A1 + A3      |
| D6-C17-T1 | Four event types                    | C17 | A3           |
| D6-C17-T2 | Event type casing migration         | C17 | A2           |
| D6-C18-T1 | Remove per-event draw hiding        | C18 | A3           |
| D6-C19-T1 | Zone change without approval        | C19 | A1 + A3      |
| D6-C20-T1 | Expand — add `location`             | C20 | A1 + A2      |
| D6-C20-T2 | Migrate — rules and functions       | C20 | A1           |
| D6-C20-T3 | Migrate — client read paths         | C20 | A3           |
| D6-C20-T4 | Contract — enforce scoping          | C20 | A1 + A3      |
| D6-C21-T1 | Expand — add the rally form         | C21 | A1 + A3      |
| D6-C21-T2 | Migrate — call sites and data       | C21 | A1 + A2 + A3 |
| D6-C21-T3 | Contract — delete `friendly`        | C21 | A1 + A3      |
| D6-C23-T1 | Beta notifications stay in-app      | C23 | A1           |
| D6-F1-T1  | Partner pool — schema and rules     | F1  | A1 + A2      |
| D6-F1-T2  | Partner pool — server               | F1  | A1           |
| D6-F1-T3  | Partner pool — client hooks         | F1  | A3           |
| D6-F1-T4  | Partner pool — panel                | F1  | A4           |
| D6-F2-T1  | Courts, not zones, at join          | F2  | A3           |
| D6-F2-T2  | Join surface for courts             | F2  | A4           |
| D6-F3-T1  | Knockout size moves both ways       | F3  | A3 + A4      |

## D7 — the shared component set · phase M2

| Task ID    | Title                         | Job         | Group |
| ---------- | ----------------------------- | ----------- | ----- |
| D7-CS1-T1  | One name formatter            | CS-1        | 1     |
| D7-CS3-T1  | `PersonRow` densities         | CS-3        | 1     |
| D7-CS3b-T1 | `seed` slot                   | CS-3b       | 1     |
| D7-CS8-T1  | `PersonOption`                | CS-8        | 1     |
| D7-CS9-T1  | `PersonPairRow`               | CS-9        | 1     |
| D7-CS10-T1 | `PersonChip` / `PersonInline` | CS-10       | 1     |
| D7-CS17-T1 | `initialOf` and avatars       | CS-17       | 1     |
| D7-CS20-T1 | The 78px action slot          | CS-20       | 1     |
| D7-CS21-T1 | Expanded-row behaviour        | CS-21       | 1     |
| D7-AX25-T1 | Names for screen readers      | AX-25       | 1     |
| D7-CS2-T1  | `StatGrid`                    | CS-2        | 2     |
| D7-CS4-T1  | `ListRow` + `ListGroup`       | CS-4        | 2     |
| D7-CS5-T1  | `EntityCard`                  | CS-5        | 2     |
| D7-CS6-T1  | `ReviewPanel`                 | CS-6        | 2     |
| D7-CS7-T1  | One `ProfileCard`             | CS-7        | 2     |
| D7-CS11-T1 | `ApprovePair`                 | CS-11       | 2     |
| D7-CS13-T1 | Queue heading pattern         | CS-13       | 2     |
| D7-CS14-T1 | Fold disclosures              | CS-14       | 2     |
| D7-CS15-T1 | One drawer layout             | CS-15       | 2     |
| D7-CS16-T1 | `PlaceCard`                   | CS-16       | 2     |
| D7-CS43-T1 | Bracket column width          | CS-43       | 2     |
| D7-MF8-T1  | `FieldError` everywhere       | MF-8        | 3     |
| D7-MF9-T1  | One banner                    | MF-9        | 3     |
| D7-MF10-T1 | `ConfirmSheet`                | MF-10       | 3     |
| D7-MF11-T1 | `Popover`                     | MF-11       | 3     |
| D7-MF12-T1 | `Checkbox` everywhere         | MF-12       | 3     |
| D7-MF13-T1 | `Switch` everywhere           | MF-13       | 3     |
| D7-MF14-T1 | Dropdowns become modals       | MF-14       | 3     |
| D7-MF7-T1  | Field chrome                  | MF-7        | 3     |
| D7-CS35-T1 | `Skeleton`                    | CS-35       | 3     |
| D7-CS36-T1 | One `Spinner`                 | CS-36       | 3     |
| D7-CS30-T1 | `ProgressRing` reuse          | CS-30…32    | 3     |
| D7-CS34-T1 | Honest loading                | CS-34       | 3     |
| D7-SW-T1   | Light-theme fills and rules   | CT-3/5/7    | 4     |
| D7-SW-T2   | Page backgrounds and tints    | CT-6/8/9/10 | 4     |
| D7-SW-T3   | Selected states               | CT/BT       | 4     |
| D7-SW-T4   | Light-mode clay               | CT-31       | 4     |
| D7-SW-T5   | Clay borders off buttons      | CT-32       | 4     |
| D7-SW-T6   | Touch targets, in order       | BT-17/9/10  | 4     |
| D7-SW-T7   | Radius, elevation, motion     | BT-16/20…28 | 4     |
| D7-SW-T8   | Typography floor              | TY-1…10     | 4     |
| D7-SW-T9   | Colour literals               | CT-18…30    | 4     |
| D7-SW-T10  | Keyboard and labels           | AX-3…22     | 4     |
| D7-SW-T11  | Consent before analytics      | AX-26       | 4     |
| D7-CS24-T1 | One vocabulary on the card    | CS-24       | 5     |
| D7-CON-T1  | Consent line                  | new         | 5     |
| D7-DPC-T1  | Doubles pool card             | new         | 5     |
| D7-STA-T1  | The stats a member sees       | ruling 6    | 5     |
| D7-DDW-T1  | Download Draw                 | ruling 8    | 5     |
| D7-LAB-T1  | One label per stat            | CS-22…29    | 5     |
| D7-INI-T1  | The last `initialOf`          | ruling 12   | 5     |
| D7-CPY-T1  | Remaining copy defects        | CS-38…68    | 5     |
| D7-G6-T1   | Store what was paid           | group 6     | 6     |
| D7-G7-T1   | Copy sweep                    | group 7     | 7     |
| D7-G7-T2   | Rows fit 5.8 inches           | group 7     | 7     |
| D7-G7-T3   | The leaderboard chart         | group 7     | 7     |

## D8 — seeding, the coaching pool, and the workflow record · phase M3

| Task ID   | Title                       | Job | Lane |
| --------- | --------------------------- | --- | ---- |
| D8-S1-T1  | `seedCount`                 | S1  | A3   |
| D8-S1-T2  | Entry ordering              | S1  | A3   |
| D8-S1-T3  | `seedAnchors`               | S1  | A3   |
| D8-S2-T1  | `seed` on the player type   | S2  | A3   |
| D8-S2-T2  | RR knockout ordering        | S2  | A1   |
| D8-S2-T3  | Place by anchors            | S2  | A3   |
| D8-S3-T1  | Seed display                | S3  | A4   |
| D8-S4-T1  | Seeds freeze at generation  | S4  | A3   |
| D8-S5-T1  | Coaching pool documented    | S5  | A1   |
| D8-S5-T2  | Account creation documented | S5  | A1   |
| D8-RNK-T1 | Restore `rankPosition`      | —   | A1   |
| D8-SHP-T1 | Update the data shape       | —   | A2   |

## D9 — donations and the payment gateway · phase M4

| Task ID  | Title                                    | Job | Lane    |
| -------- | ---------------------------------------- | --- | ------- |
| D9-P1-T1 | The payments collection                  | P1  | A1 + A2 |
| D9-P5-T1 | Payments in the sidebar, and their rules | P5  | A1 + A3 |
| D9-P2-T1 | Checkout session                         | P2  | A1      |
| D9-P2-T2 | The webhook                              | P2  | A1      |
| D9-P3-T1 | Donate from the profile card             | P3  | A3 + A4 |
| D9-P4-T1 | Request a cancellation                   | P4  | A3      |
| D9-P4-T3 | Organizer approves, refund runs          | P4  | A1 + A4 |
| D9-P4-T2 | What a refund means                      | P4  | A1      |
| D9-P6-T1 | Contributor Badge                        | P6  | A3 + A4 |
| D9-V-T1  | Donation journey test                    | —   | A5      |
| D9-V-T2  | Cancellation journey test                | —   | A5      |
| D9-V-T3  | No-leak check                            | —   | A5      |

---

## Deferred out of these sprints

| Item                                     | Was | Now                                                                                                                                |
| ---------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **C22**, halve league points at year end | D6  | End of year milestone, blocked by the wallet split. See [TASKS-D6.md](TASKS-D6.md#deferred-c22-league-points-at-the-year-boundary) |

## Cross-sprint dependencies

These are the edges that cross a sprint boundary. Everything else blocks only inside its own
sprint and is recorded in that sprint's breakdown.

| Task         | Waits on   | Because                                                     |
| ------------ | ---------- | ----------------------------------------------------------- |
| D7-CS30-T1   | D6-C1-T1   | No completion ring beside a gate that cannot open           |
| D8-S1-T2     | D6-C2-T1   | The tiebreak reads P/G won %, which C2 unfreezes            |
| D8-S1-T1..T3 | D6-C7-T1   | `selectGroupWinners` is deleted, so seeding is built fresh  |
| D8-S2-T3     | D6-C1-T1   | Nothing to seed while the knockout gate is pinned shut      |
| D8-S3-T1     | D7-CS3b-T1 | The seed number needs the row slot to render into           |
| D9-P6-T1     | D7-CS7-T1  | The badge rides the shared profile card                     |
| D9-P3-T1     | D7-CS7-T1  | The donate button sits on the profile card                  |
| D9-P4-T3     | D7-CS6-T1  | The organizer approval queue reuses the shared review panel |

## Where the frontier starts

Nothing in D6 starts before **D6-V1-T1** proves the branch is green. After that, the tasks with
no blockers at all are the wide-refactor expands (**D6-C20-T1**, **D6-C21-T1**), the standalone
corrections (**C1, C2, C5, C6, C7, C9, C11, C12, C13, C14, C22, C23**), and **D6-F1-T1**.
