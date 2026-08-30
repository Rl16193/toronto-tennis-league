# Data shape — the post-remodel contract, and the test data built from it

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**      | 2026-08-28                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Scope**     | The field-level target shape for every surviving collection, the old→new delta that produces it, and the two tiers of test data that conform to it.                                                                                                                                                                                                                                                                                                       |
| **Authority** | Product rulings live in [`DECISIONS_BRIEF.md`](../archive/planning-2026-08-23/notes/DECISIONS_BRIEF.md) (PD) and [`HARMONIZATION_REPORT.md`](../archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md) (D/L/N/S/R). The delta spine is [`WORKFLOW-STATES.md`](../archive/planning-2026-08-23/notes/WORKFLOW-STATES.md) section 0. This file says what the documents look like once those rulings land; it does not make product decisions of its own. |
| **Companion** | [`DATA_MODEL.md`](DATA_MODEL.md) — collections and access. [`FIRESTORE_SCHEMA_ASSESSMENT.md`](FIRESTORE_SCHEMA_ASSESSMENT.md) — findings and the migration contract.                                                                                                                                                                                                                                                                                      |

## 1. Two environments, one shape

`toronto-tennis-league` is the **live deployed project**. `racquets-and-strings` is the **test
environment**. The snapshot under `analysis/snapshots/` is real production data from the live
project in the **old** shape — 3,243 documents, taken 2026-08-17.

Nothing in this repository writes to either project. The pipeline below reads that snapshot from
disk and produces local test data.

## 2. Two tiers of test data

| Tier          | Where                                 | Size            | For                                                                        |
| ------------- | ------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| **Canonical** | `tests/fixtures/local-fixtures.mjs`   | 74 documents    | Rules tests, browser tests, one document per lifecycle state               |
| **Volume**    | `tests/fixtures/dataset/` (generated) | 3,233 documents | Driving the UI — real brackets, rosters, leaderboards, notification counts |

The two tiers are not interchangeable. **The volume tier contains no disputed result** — production
has none, because the auto-apply amendment has not shipped. States that do not exist in live data
exist only in the canonical tier: the dispute flag, the bookings lifecycle, the derived partner pool,
the guest partner, and a withdrawal with a recorded reason. Use the canonical tier to test those
screens and the volume tier to test everything at scale.

Both are checked against the same declaration, `tests/fixtures/shape-reference.mjs`, which carries
one **uniform** document per collection with every field populated. `tests/unit/fixtureShape.test.mjs`
enforces the canonical tier; `scripts/build-sample-dataset.mjs` enforces the volume tier as it
builds. A field renamed in one place and not the other fails the unit suite.

```bash
npm run dataset:build
```

```bash
npm run seed:dataset
```

`dataset:build` transforms the newest snapshot into `tests/fixtures/dataset/` and prints a full
transformation report. `seed:dataset` loads it into the local emulator and creates an Auth account
for every member, all sharing the password `local-dataset-123!`, so the UI can be signed in as
anyone. Both refuse to touch a non-local project.

```bash
npm run dataset:xlsx
```

`dataset:xlsx` writes the same dataset to `analysis/exports/new_database/` as one Excel workbook per
collection, for reading the converted database without a Firestore client. Each workbook carries a
`data` sheet (documents, columns in schema order, nested values as JSON text, timestamps as ISO 8601)
and a `schema` sheet (per field: how many documents carry it, how populated it is, a sample value,
and whether the shape reference declares it). `_INDEX.xlsx` lists every collection and records the
provenance — source snapshot, source project, and whether names were pseudonymised.

### Pseudonymisation

**On by default.** Member names, emails, phone numbers and avatars are replaced with deterministic
synthetic values — the same uid always yields the same persona, so `users`, `stats`, `matches`,
`notifications` and `connections` all keep agreeing about who is who. Everything that is _not_
personal survives exactly: event titles, court names, score lines, bracket structure, zone
distribution, timestamps, document ids.

A per-field pass is not sufficient on its own. Some live members have no display name — their email
address _is_ their display name — so it ends up inside notification titles and bodies as free text.
A second pass rewrites known member names, then any surviving email address, then any surviving
phone number, across every string in the output. Verified: zero real-domain addresses and zero
non-555 phone numbers remain.

Generated personas are **unique by construction**. Thirty first names by twenty-six last names is 780
combinations for ~200 members, so by the birthday bound roughly two dozen pairs collide. Two members
sharing a generated name would also share a generated email, and Firebase Auth rejects the second —
seeding dies partway through with `auth/email-already-exists`. Colliding names take a middle initial
(`Kavya J. Xu`), and the email follows. Verified: 194 unique names, 193 unique emails, zero duplicates.

`--real-names` keeps the live values. The output is then **real member data**: `tests/fixtures/dataset/`
is gitignored for exactly this reason, and that output must not be seeded anywhere public.

### Verified

Built and seeded end to end against a local emulator on 2026-08-28: 3,233 documents, 194 Auth
accounts, 172 Firestore Timestamps rehydrated, subcollections (`rr_drafts`, `ranking_history/entries`)
intact, `events/ladder` remapped, 32 walkovers preserved.

## 3. Collections in the new shape

25 collections survive. Four retire outright.

| Collection                             | Change                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `users/{uid}`                          | Contact fields and `profile_details_visible` removed                      |
| `contacts/{uid}`                       | Unchanged shape; readership narrows (L13)                                 |
| `stats/{uid}`                          | Five stored fields become derived or deleted                              |
| `preferences/{uid}`                    | Role and provider flags move out; two new member toggles                  |
| `providers/{providerId}`               | **New** — roles, never assignments                                        |
| `services/{serviceId}`                 | **New** — the catalog, from `tasks` rows with `type: 'offer'`             |
| `bookings/{bookingId}`                 | **New** — the stringing lifecycle                                         |
| `events/{eventId}`                     | `organizer_ids`, `zones`, deadlines keyed by draw and round, lesson block |
| `events/{eventId}/rr_drafts/{drawKey}` | The `withdrawn` array retires                                             |
| `event_participants/{id}`              | One `status` replaces the removal flag and the RR withdrawn list          |
| `matches/{id}`                         | The largest delta — see 4.6                                               |
| `ranking_history/{uid}/entries/{id}`   | Unchanged                                                                 |
| `courts/{id}`                          | Unchanged                                                                 |
| `tasks/{id}`                           | Progress documents only — catalog and award rows move out                 |
| `task_claims/{id}`                     | Deterministic ids for volunteer and host                                  |
| `awards/{awardId}`                     | **New** — one document per award with the winners' receipt (PD10)         |
| `offers/{uid}`                         | Only `pointsSpent` survives                                               |
| `redemptions/{code}`                   | Two review states retire; provider fields renamed                         |
| `listings/{id}`                        | Unchanged                                                                 |
| `public_contacts/{uid}`                | Unchanged (a field projection, not a marker)                              |
| `connections/{pair}`                   | Unchanged                                                                 |
| `notifications/{id}`                   | Unchanged                                                                 |
| `mailing_list/{id}`                    | Unchanged                                                                 |
| `site_stats/{id}`                      | `updatedAt` normalises to `updated_at`                                    |
| `admin_stats/{id}`                     | Unchanged                                                                 |

**Retired collections**

| Collection                    | Ruling   | Replacement                                           |
| ----------------------------- | -------- | ----------------------------------------------------- |
| `group_lessons`               | L8 · PD2 | An add-on block on a social event                     |
| `group_lesson_contact_access` | L8 · PD2 | Retires with the collection it gated                  |
| `redemption_locks`            | WDR 8    | Removed with the `flagged` review state               |
| `public_preferences`          | R7       | `preferences` is world-readable, so it has no purpose |

## 4. The delta, collection by collection

Counts are documents affected in the live snapshot, from the transform's own report.

### 4.1 `users` — 194 documents

| Field                                                                                                          | Change | Ruling                                                           | Live |
| -------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- | ---: |
| `profile_details_visible`                                                                                      | drop   | L6 — hid only the league pill, public on the leaderboards anyway |   17 |
| `email`, `phone`, `secondary_email`, `whatsapp_contact`, `whatsapp_same_as_phone`, `preferred_mode_of_contact` | drop   | Duplicates of `contacts`, on a world-readable document           |  186 |

### 4.2 `stats` — 204 documents

| Field                            | Change  | Ruling                                                                 | Live |
| -------------------------------- | ------- | ---------------------------------------------------------------------- | ---: |
| `loses`                          | derived | S1 — `matchesPlayed − wins`; both writers stop together                |  187 |
| `pointswon`, `totalPointsPlayed` | drop    | L14 — P/G Won % derives client-side from the member's matches          |  188 |
| `tournamentsPlayed`              | delete  | DC-12 — and the stored value is wrong (F-D: incremented on every loss) |  187 |
| `rankPosition`                   | delete  | DC-11 — written, rendered nowhere                                      |   97 |
| `rrPointsBackfilledAt`           | drop    | One-off migration stamp                                                |   12 |

`rankTrend`, `rankMove` and `rankUpdatedAt` stay — only `rankPosition` is named by DC-11.

### 4.3 `preferences` — 204 documents

| Field                                                   | Change  | Ruling                                              | Live |
| ------------------------------------------------------- | ------- | --------------------------------------------------- | ---: |
| `event_creator`                                         | drop    | PD6 · S6 — ends at the `providers` cutover          |  204 |
| `stringer`, `stringer_id`, `coach`, `coach_id`          | move    | R7 — to `providers`                                 |    3 |
| `availability`, `availability_day`, `availability_time` | drop    | Superseded by `availability_tags`                   |  204 |
| `preferred_zone_manual`                                 | **add** | L5 — stops a court edit silently re-zoning a member |    — |
| `available_to_play`                                     | **add** | L16 — off shows an Away pill                        |    — |

Read access becomes public (L9 · PD1 · R7) once the role fields are gone.

### 4.4 `providers` — new, 4 rows derived

Derived from the three live `preferences` role flags plus the provider ids on the catalog rows:
`karan` and `fortyforty` (stringer), `archie` (coach), and one more from the offer rows. Roles only —
event authority stays on `events.organizer_ids` (L4). Issued and re-issued by an Admin-SDK script,
never in-app (PD5).

### 4.5 `services` and `awards` — the `tasks` split

`tasks` is three collections wearing one name. The transform splits it:

| Live `tasks` rows | Becomes    | Ruling |               Count |
| ----------------- | ---------- | ------ | ------------------: |
| `type: 'offer'`   | `services` | N1     |                   9 |
| `award_name` set  | `awards`   | PD10   | 34 rows → 11 awards |
| everything else   | `tasks`    | —      |                 153 |

Award rows collapse: `tasks/{awardId}_{uid}` becomes one `awards/{awardId}` carrying a `winners`
array, which is what PD10 asks for. `tasks` keeps progress documents only, and stays publicly
readable (PD1).

Rows with `type: 'group'` have no home in the new shape and are dropped, not migrated.

### 4.6 `matches` — 399 documents, the largest delta

| Field                                                              | Change  | Ruling                                                           | Live |
| ------------------------------------------------------------------ | ------- | ---------------------------------------------------------------- | ---: |
| `player_1_contact`, `player_2_contact`                             | drop    | Contacts resolve at display time from `contacts`                 |  272 |
| `rr_group_bonus_v2`                                                | rename  | N2 → `rr_groupbonus`                                             |   58 |
| `schedule_requested`                                               | drop    | S5 — the boolean never recorded who asked; no backfill           |   27 |
| `no_show`                                                          | drop    | D6 · L10 — walkovers only                                        |    8 |
| `proposed_date`, `proposed_slot`, `proposed_by`, `schedule_status` | drop    | WDR 3 — no dates or times are stored                             |    5 |
| `claimed_winner_uid`, `claimed_winner_name`, `score_line`          | drop    | Sprint D5 strip                                                  |    5 |
| `result_at`                                                        | **add** | L2 — re-stamped on every apply                                   |  163 |
| `result_submissions`                                               | **add** | Amendment 2026-08-23 — map keyed by submitter uid                |    3 |
| `score_disputed`, `score_disputed_at`                              | **add** | Amendment — set only when two submissions name different winners |    — |
| `score_pending`                                                    | never   | Retired before it shipped                                        |    0 |

`completed_at` pins at first scoring and is never rewritten (D3); `result_at` moves with every
apply (L2). The transform back-fills `result_at` from `completed_at` wherever a result already
exists, and reconstructs `result_submissions` from the retired `claimed_winner_*` pair on the three
matches a player actually reported.

**The four `no_show` rows.** All four are unscored RR fixtures — all-zero scores, no winner,
`walkover: false`. A walkover requires a winner (D6), so they are not walkovers. They revert to
plain pending matches with the flag dropped. See open question 10.

### 4.7 `event_participants` — 297 documents

| Field                    | Change  | Ruling                                      | Live |
| ------------------------ | ------- | ------------------------------------------- | ---: |
| `removal`, `removal_at`  | replace | L12 — one `status`: `active` \| `withdrawn` |    1 |
| `zone_change_requested`  | drop    | L15 — legacy twin of `req_zone_change`      |   10 |
| `status` + `withdrawn_*` | **add** | L12 — reason, note, at, by                  |    — |
| `zone`                   | **add** | L15 — per-event, organizer-set              |    — |

`req_zone_change` and `new_zone` are **kept** by owner ruling (L15): after generation the player
sits in both zone draws until the organizer resolves it, and a zone change never unseats.

The migrated withdrawal carries `withdrawn_reason: 'other'` and a note saying so — the retired
`removal` flag never recorded a reason, so inventing one would be fabrication.

### 4.8 `rr_drafts` — 4 documents

The live draft carries a `withdrawn` array. **That array is the RR withdrawn list L12 replaces.**
Keeping both is how a re-seated withdrawal used to survive a reload — the matches change reached
`onSnapshot` before the list update, and the just-removed player was re-seated. The transform drops
it; `event_participants.status` is the single source.

### 4.9 `bookings` — new, no live source

The bookings lifecycle does not exist in the deployed project. The transform **synthesises** five,
one per L11 state: `lead`, `in_progress`, `in_progress` carrying `completion_requested_at`,
`completed`, `cancelled`. The stamp is deliberately its own fixture — it is a stamp, not a fourth
status, and that distinction is easy to lose.

### 4.10 `offers` and `redemptions`

`offers/{uid}` keeps only spend, under its existing name `pointsSpent`; `lastEarnedSnapshot` dropped.
Balances and totals derive at read (L9 · PD1).

`redemptions` renames `stringer_id` → `provider_id` and `stringer_name` → `provider_name` — the
field always held the provider id for both categories. The `flagged` and `cancel_requested` review
states retire with `redemption_locks` (L11); any live coupon in one lands on `active` and is
reported.

## 5. Findings this work produced

Things the transform surfaced that are not recorded in any decision document.

1. **`services` has no rules block.** `DATA_MODEL.md` lists it and `src/features/services/types.ts`
   defines its `Reward` interface, but `firestore.rules` contains zero occurrences of `services`, so
   it falls through to deny. Seeded service documents are unreadable by the client until a block
   lands. This blocks the Services UI on the new shape.
2. **`rr_drafts.withdrawn` is an unrecorded second withdrawn list.** L12 names the `removal` flag and
   "the RR withdrawn list"; this is that list, and no document names the field.
3. **`site_stats` carries both `updatedAt` and `updated_at`** on different documents — a one-name-per-thing
   breach the ledger does not cover.
4. **15 `event_participants` point at events that are not in the snapshot.** Real orphans in live
   data. The transform keeps them and reports them: the UI ships against production, so it should
   survive them, but they are worth a look.
5. **160 values are Firestore `Timestamp`s, not ISO strings** — on `users.lastActive`,
   `events.start_date`/`end_date`/`join_last_date`, and `event_participants.created_at`. The same
   logical field is an ISO string on other documents. The seeder rehydrates them; any code reading
   these fields must handle both.
6. **One live member has no display name** — their email address is their display name, so it reached
   notification bodies as free text. This is why pseudonymisation needs the free-text pass.

## 6. Open questions

These need an owner ruling. Each one is currently resolved the way the note says, and each is a
one-line change if the answer differs.

| #     | Question                                                                                                                                                                                                                                         | Currently                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| ~~1~~ | ~~**`walkover` or `is_walkover`?**~~ **RESOLVED 2026-08-28 (owner).** One name per thing: **`walkover` is kept; `is_walkover` is renamed to it.** Applied — see section 8.                                                                       | Applied                               |
| 2     | **`result_application`.** L3 says the hash lives inside `result_submissions`, but `tournamentResults.js` still writes both (F-G). Retire the separate field?                                                                                     | Both kept, and the deviation recorded |
| ~~3~~ | ~~**`points_spent` or `pointsSpent`?**~~ **RESOLVED 2026-08-28 (owner): keep `pointsSpent`.** L9 wrote it snake_case, but the deployed field and every reader are camelCase — the ledger spelling gives way, and no code change is needed.       | Applied                               |
| 4     | **Is the doubles partner pool stored or derived?** L18 does not say. It is derivable — doubles participants with neither `partner_uid` nor `partner_name` — and the standing rule is that a field is stored only if the server cannot derive it. | Derived, no stored field              |
| ~~5~~ | ~~**The lesson add-on block schema.**~~ **DEFERRED 2026-08-28 (owner).** The product shape is sketched in section 9 but is **not being built now**. The unratified minimum block stays in the shape reference, read by nothing.                  | Deferred, sketched                    |
| 6     | **Redemption statuses.** WORKFLOW-STATES 16 lists coupon and booking as one row moving to the booking lifecycle. Do coupons keep `active`/`used`/`cancelled` while bookings carry `lead → completed`, or do the two merge?                       | Kept separate                         |
| 7     | **The 15 orphan participants** — prune from the sample dataset, or keep so the UI is tested against them?                                                                                                                                        | Kept and reported                     |
| 8     | **The four `no_show` matches** — revert to pending, as unscored fixtures with no winner?                                                                                                                                                         | Reverted to pending                   |
| 9     | **Real names in the sample dataset.** Pseudonymised by default; `--real-names` keeps live values but makes the output real member data.                                                                                                          | Pseudonymised                         |

## 7. The legacy island

Six documents in `local-fixtures.mjs` are scheduled for deletion by shipped rulings and survive only
because live code still reads them. They are quarantined in `LEGACY_COMPAT_FIXTURES`, and a unit test
asserts the list does not grow silently.

| Document                                | Retires under | Breaks today if removed                                                          |
| --------------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| `preferences/organizer-a.event_creator` | PD6 · S6      | `isGlobalEventCreator()` in the rules — the e2e organizer-creates-event test     |
| `preferences/multi-role-a` role flags   | R7 · PD6      | Same                                                                             |
| `group_lessons/{month}`                 | L8 · PD2      | The e2e group-lesson coach-contact test, and the contacts rule's coach predicate |
| `group_lesson_contact_access/current`   | L8 · PD2      | Same                                                                             |
| `tasks/synthetic-offer`                 | N1            | The marketplace reads the catalog from `tasks`, not yet from `services`          |
| `tasks/synthetic-coaching-offer`        | N1            | Same                                                                             |

When the `providers` cutover and the `services` migration land, deleting that array is the whole
change.

## 8. Walkover — one name (owner ruling, 2026-08-28)

Finding **F-A** recorded two names for one thing: the match document stores `walkover`, while the
score submission carried `is_walkover`. `DECISIONS_BRIEF` section 1 asserted it was not stored at all.

**Ruling: `walkover` is the one name. `is_walkover` is renamed to it, not deleted.** The rule is
symmetric — whichever name is kept, the other conforms to it; here the stored field wins because it
is the one the server, the rules and the UI already read.

What this touched:

| Site                                                | Change                                               |
| --------------------------------------------------- | ---------------------------------------------------- |
| `src/features/tournament/domain/scoreSubmission.ts` | `ScoreIntent.isWalkover` → `walkover`, and its local |
| `src/pages/tournament/useTournament.ts`             | Parameter and call site                              |
| `tests/unit/scoreSubmission.test.mjs`               | Assertion                                            |
| `tests/rules/firestore.matrix.test.mjs`             | Payload field `is_walkover` → `walkover`             |
| `tests/integration/functions.emulator.test.mjs`     | Payload field `is_walkover` → `walkover`             |

Two things deliberately **not** changed:

- **`src/pages/tournament/ScoreModal.tsx`** keeps a local `isWalkover`. It is derived from a prop
  that is _already_ called `walkover` (`const isWalkover = !!walkover?.checked`), so taking the name
  would shadow the prop. This is a UI-local boolean, not the data field — the one-name rule is
  satisfied at the data layer.
- **Nothing on the server ever read `is_walkover`.** `functions/` contains zero occurrences; the two
  test payloads were sending a field no consumer looked at. Renaming them keeps the payload shape
  honest rather than leaving dead keys behind.

`walkover` stays a stored boolean rather than being derived from all-zero-plus-winner. Derivation
would be ambiguous against the four ex-`no_show` rows, which are all-zero with **no** winner.

## 9. Lesson add-on — product sketch, not scheduled

**Owner direction, 2026-08-28: no changes now, plan for later.** Recorded here so the intent is not
lost. Nothing below is built, and nothing reads the placeholder block in the shape reference.

The shape of the idea:

- A member **signing up for a social** is offered add-on options at sign-up.
- The options are **group classes**, **games**, and **coaching**.
- Choosing coaching puts the member into a **pool of players**.
- The pool is batched into **groups of four**, and coaches pick up a batch to deliver a group lesson.
- Pricing mentioned: **$20/hr** and **$15/hr**.
- The lesson is an **add-on fee on the event**, not a separate purchase.

Undecided, and needed before any schema is written:

1. **What separates the $20/hr and $15/hr tiers?** Group size, coach seniority, and a member discount
   are all consistent with what was said.
2. **"free 15$/hr classes"** — as dictated this is contradictory. Either the social itself is free and
   the class costs $15/hr, or there is a genuinely free tier alongside a paid one.
3. **Where does the pool live?** Batching four players across a whole event is not derivable from a
   participant row the way the doubles partner pool is (open question 4), so this one probably does
   need stored state — the first thing in this remodel that would.
4. **How does the add-on fee reach the points and payments model?** `services` and `bookings` already
   describe a paid provider engagement; a lesson may belong there rather than on the event.
5. **Are "games" an add-on with its own state, or just a social format?**

Until these are answered, `group_lessons` stays retired and `events.lesson` stays an unratified
placeholder.
