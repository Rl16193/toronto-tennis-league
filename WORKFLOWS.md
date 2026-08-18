# Racquets & Strings — Complete Workflow Map

**Revised 2026-08-12.** Updated for: the `matches`/`courts`/`tasks` collection consolidation
(`tournament_matches` is gone), zone-based draws, the current RR engine (`buildZoneTierGroups`),
removal of the LL/reserves draw (dead code, deleted), placement-based draw visibility, the
Friendlies/Challenges hub at `/matches`, server-side rewards, and the connections-based contact
model. Sections marked **NEW** are workflows added since the last revision — each maps to a test
block in `Test_Cases_Gaps.xlsx` (prefix noted).

---

## 1. Authentication

### Sign Up (Email)
1. `/signup` — personal info: name, email (mailcheck typo hints; `checkSignupEmail` callable
   pre-checks for an existing account), password, phone (`@intl-tel-input`), avatar, contact mode
2. Skills & preferences: NTRP skill level, preferred courts, availability days/times
3. On submit: Firebase Auth create → `profileBootstrap` guarantees `users/{uid}`, `stats/{uid}`,
   `preferences/{uid}`; contact details land in `contacts/{uid}` (PII is **never** written to
   `users` — it is world-readable)
4. Redirect to `returnTo` param

### OAuth (Google / Apple)
1. One shared flow in `useOAuthSignIn.ts`: popup → redirect fallback on `popup-blocked` →
   `getRedirectResult` on mount → profile bootstrap → `account-exists-with-different-credential`
   linking hand-off
2. `useGoogleSignIn` / `useAppleSignIn` are thin wrappers; each filters redirect results on its own
   `providerId`. **Add providers by adding a wrapper.**
3. New user → `/signup` to complete the profile; returning user → `returnTo`

### Session
- Email verification is removed: `AuthContext` marks any signed-in user `isVerified: true`
  (idempotent) which fires the one-shot Resend welcome email on `welcomeEmailSent` false → true
- "Stay logged in" toggles local vs session persistence
- Public routes: `/`, `/events`, `/leagues`, `/courts`, `/marketplace`, static pages. Everything
  else is behind `<PrivateRoute>`

*Test coverage: A-01…A-14, X-10…X-13.*

---

## 2. Profile & Player Profile

- `/profile` — name/bio/avatar (→ `users`), skill + tournament preference (→ `stats`, the only
  scoring-doc fields an owner may write), contact details (→ `contacts`), preferred courts,
  availability tags, visibility settings (→ `preferences`)
- `/players/:userId` — public view of another player; contact details render **only** if the
  viewer passes the contacts read rule (owner / organizer / connection / public-contact — see §12)

*Test coverage: P-*, PP-*.*

---

## 3. Events

### Browsing & joining
1. `/events` lists `events`; expired events hidden
2. Join expands inline: Singles/Doubles → division → (doubles) partner name + in-app toggle +
   combined skill
3. Submit creates `event_participants` (`uid`, `event_id`, `skill`, `division`, `dateselected`, …)
4. **Knockout events:** slot status is computed against generated `matches` — full draws offer the
   sibling skill bracket as fallback
5. **RR events:** slot status is **bypassed** — registration stays open even after the draw is
   generated (late joiners, §7)

### Creating (creator only)
`event_creator` flag → "Add an Event" → writes `events` doc (image via Storage). Format field
selects knockout vs `tournament_format: 'rr'`.

*Test coverage: E-*, C-*.*

---

## 4. Tournament Page

**Route:** `/tournament` (private). Tabs Upcoming / Active / Past per event; accordion per event.

### Draw visibility — placement-based, not skill-based
| Viewer | Sees |
|---|---|
| Creator | All draws |
| Participant, draw generated | The draw their `user_id` **actually appears in** (`userDraw` scans generated matches) |
| Participant, pre-generation | **Every draw** — `userDraw` is deliberately `undefined`; there is no skill-derived fallback. Don't "fix" this |
| RR participant | **Both skill draws of their own division**, read-only |
| Non-participant | All draws (preview) |

A creator can move a player across skill groups without touching their `event_participants` skill —
placement-based visibility is what keeps the moved player looking at the right draw.

*Test coverage: T-*, VS-01…VS-03.*

---

## 5. Zone-Based Draws — **NEW** *(tests: Z-01…Z-08)*

Draws in the same division/skill can be split by city zone. Zone geometry lives in
`src/utils/zones.ts` (built from the Toronto Centreline dataset; the DVP and Hwy 404 are spliced
into one polyline, Steeles stands in for the 407).

Workflow rules, each learned from a real defect:

1. **`effectiveZone`** — groups generated before zones went live carry no `zone`; they are mapped
   onto the **default zone** (Downtown-Midtown), never shown as a separate zone-less draw (that
   double-counted every signup)
2. **Every destructive path is zone-filtered** — reset, cancel and regenerate iterate
   `currentMatches`, which **must** filter on `zone`; without it, resetting one zone deletes the
   other zone's matches and reverses those players' points
3. **Winner advancement normalizes zone** — template match ids (M1, M5, …) repeat across zone
   draws; advancement matches on zone + bracket, not id alone
4. **Zone change requests** — a participant may write only
   `zone_change_requested`/`zone_change_requested_at` on their own participant doc;
   `onZoneChangeRequested` notifies the creator, who moves them
5. **Cross-draw dedupe is disabled** (`AUTO_DEDUPE_ENABLED = false`) — a player seated in two draws
   is surfaced, never silently unseated

---

## 6. Knockout Draw Lifecycle

### Preview (client-side only)
1. `filterParticipantsForDraw` → `buildPlayerList` → `getDrawSize(count)` — Singles **and**
   Doubles both scale 8/16/32 with participant count
2. Bracket template generated; players slotted; empty slots show "Player Loading";
   `previewSlotOverrides` hold the creator's manual placements
3. Draw size recalculates live as participants change; creator may override it (cleared on
   generate)

### Generate
Batched write of every match to `matches/{eventId}_{drawKey}_{matchId}`
(`drawKey = getDrawKey(choice, division, skillGroup)`). Draw size is then **locked**.

### After generation
- `handleAddPlayer` → new participant appears in the unplaced list; the **main draw does not
  expand** (cancel + regenerate first, only possible with no completed matches)
- `handleEditPlayer` on a live match rewrites the doc directly (creator)
- Merge toggles: Challengers + Masters into one draw (`skillGroup: 'All'`); doubles consolidation.
  Merge inference on load keys on `[matches, statsMap]` — with a stale statsMap it silently guessed
  wrong
- **There is no LL/reserves draw.** The `bracket: 'reserves'` flow was dead code and was removed —
  nothing generates or reads those docs

### Cancel / reset
Blocked if any match in **this zone's** draw is complete; otherwise deletes this draw's docs and
returns to preview, reversing stats via `reverseMatchStatsInto` (which honors the bonus and partner
stamps — §9).

*Test coverage: T-*, X-05…X-22, Z-02…Z-04.*

---

## 7. Round Robin Lifecycle — **NEW shape** *(tests: RR-01…RR-12, LJ-01…LJ-04)*

Events with `tournament_format === 'rr'`.

### Group formation (`buildZoneTierGroups`) — skill-band × zone, auto-sized
1. Players bucket by skill band (Beginners 2–2.5, Challengers 3–3.5, Masters 4–5), then by
   preferred-court zone
2. Each bucket splits via `splitEvenly(n)`: `g = ceil(n/5)` balanced groups of 3–5
   (6→[3,3], 7→[4,3], 9→[5,4], 12→[4,4,4])
3. **≤5 total players = one group** (band/zone ignored)
4. A lone player in a distinct zone gets a placeholder group only when the draw already has >3
   zone-clustered groups; otherwise the band pools and the singleton folds in
5. Labels: `Group X · Band · Zone` (zone segment dropped when mixed/unassigned); letters are
   positional at render; a creator rename (`rr_label_custom`) shows verbatim
6. **The size algorithm is authoritative** — band boundaries never force uneven splits
7. Preview (`previewRRGroups`) uses the same function, so preview == generated

### Creator group editing
- `handleSaveGroupEdit` rewrites one group's roster; a cross-group move = include the player in the
  target's list, omit from the source — **both docs reconcile atomically**
- Rename (`handleRenameGroup`), Add Group from unplaced players (`handleCreateRRGroup`)
- Emptying a group dissolves it; a one-player group keeps a placeholder match (never silently
  dropped)
- Any move into/out of a group with a played match is **refused**
- Cross-skill-draw moves have no dedicated action: a background effect removes a player from this
  draw's groups when they're found seated in the sibling skill draw (self-heal)
- Pre-generation edits persist to `events/{eventId}/rr_drafts/{drawKey}` — ⚠️ **currently broken**:
  the rules declare `/rr_drafts` top-level, so draft writes are silently denied (test DR-01 is
  expected-fail until the nested rule ships)

### Knockout stage
`handleGenerateRRKnockout` at creator-chosen R4/R8/R16. Group winners auto-seed
(`selectGroupWinners`: points → gamesWon; top seed slot 1); remaining slots stay `PLAYER_LOADING`
for manual fill (`manualFill: true` also disables first-round bye auto-advance). Re-selecting a
size rebuilds — refused once any knockout match is played. No automatic runner-up fill.

### Late joiners (EOD workflow)
1. RR registration stays open post-generation; joiners are **not** sent to any reserves flow
2. `npm run regroup:rr` (Admin SDK; **always `--dry-run` first**):
   - groups with **4–5 players or any played match are locked**
   - a joiner lands in a **≤3 group with a matching band** (zone preferred)
   - overflow forms new `(band, zone)` groups via `splitEvenly`
   - idempotent — a run with no new joiners writes nothing
3. The script hand-mirrors the pure helpers in `rrGeneration.ts`/`utils.ts` — keep in sync

---

## 8. Score Submission

### Player-filed submissions
A player may create a `matches` doc with `category: 'score_submission'`
(`submitted_by`, `match_id`). `onScoreSubmitted` notifies the creator; confirming (or the
submitter retracting) **deletes** it, firing `onScoreSubmissionResolved` back to the submitter.

### Creator scoring (`handleSubmitScore` → `updateMatchWithSubmission`)
**Three isolated steps** — a rules rejection in a later step never rolls back a recorded score:
1. Match result batch (scores, `winner_uid`, `status: 'complete'`)
2. Stats batch (best-effort)
3. Winner advancement (best-effort; resolves the next match from loaded state with normalized
   bracket **and zone**, reconstructed doc id as fallback)

Guards: a **blank `winner_uid` is rejected** (it used to complete the match with a phantom winner
and advance an empty uid). `completed_at` is **pinned to first scoring**; edits stamp
`score_edited_at` instead. Score edits apply stat deltas (new − old), never double-count.

*Test coverage: S-*, PT-07, PT-08, NT-03.*

---

## 9. Points — **NEW consolidated rules** *(tests: PT-01…PT-09)*

Computed by the shared `computeMatchPoints(match)` (and reversed by its exact inverse):

| Situation | Winner | Loser |
|---|---|---|
| RR group-stage match (incl. **walkover**) | **+3, live** | **+1** |
| Knockout R32 / R16 / QF / SF | — (nothing at that moment) | 1 / 2 / 3 / 5 |
| Final | **+20** | 10 |

- The walkover penalty (`isWalkover ? 1 : 3`) was deliberately removed — it penalised the player
  who showed up. `computeGroupStandings` is the display-side twin of the same 3/1 rule.
- **RR +5 group-completion bonus** — paid in a separate best-effort commit that stamps
  `rr_group_bonus_v2: true` on every group match. Payment **and** reversal check the stamp:
  "group complete" is not proof it was paid, and a corrected match must not pay it twice.
- **Doubles partner credits** — applied in the same scoring batch; reversed with the same
  per-captain `partner_uid` map (`doubles_partner_pts_v2` backfill stamp).
- **Community/RS points** are a separate system: tiers in `taskCatalog.ts`, awarded server-side by
  `taskPoints.js`, summed by `earnedRsPoints` in `functions/lib/points.js` — the two files are
  hand-synced twins (parity test PT-09).

---

## 10. Matches Hub (Friendlies & Challenges) — **NEW** *(tests: LD-01…LD-05)*

**Route:** `/matches` (private; `/friendlies` and `/challenges` redirect here).

### Friendlies (rallies)
Request → accept/decline → play. No points, no standings, no organizer. `matches` docs with
`category: 'rally'`; sender may retract while open; recipient responds (rules-whitelisted fields).

### Challenges (ladder)
1. Challenge sent (`category: 'challenge'`, `status: 'open'`) → recipient accepts
2. Either player reports (`status: 'reported'`, claimed winner + score line)
3. **Organizer confirms — `confirmChallenge` runs in a `runTransaction`**: reads the `applied`
   flag inside the txn (a double-tap must not apply ±3 twice), floors the loser's deduction at 0,
   and uses `set(merge)` so a missing stats doc can't strand the challenge in `reported`
4. Scheduling: either player proposes/confirms times (whitelisted `schedule_*` fields);
   `onScheduleRequested` notifies the opponent

### Suggestion filters
Three exclusive pools allocated in order of **constraint, not display**: Nearby picks first
(smallest candidate set), each filter claims a block wider than the 10 shown, so the weekly refresh
and the dice draw from spares — and the visible sets can never overlap.

---

## 11. Rewards, Services & Providers — **NEW** *(tests: RW-01…RW-07)*

1. Offers are `type: 'offer'` rows in `tasks` (seeded by `seed-rewards.mjs`, **bare** doc ids)
2. Player redeems via the `redeemReward` **callable** — the server recomputes their redeemable
   balance from `earnedRsPoints` (client numbers are display-only) and writes a `redemptions` doc
   whose **id is the coupon code**
3. Coupon lifecycle — all callables, role-checked server-side: provider `markCouponUsed` /
   `flagCoupon`; player `requestCancellation`; organizer `reviewRedemption`
4. Group lessons: `joinGroupLesson` / `leaveGroupLesson` against the monthly
   `group_lessons/{month}` roster, capacity enforced server-side
5. Providers are `preferences.coach_id` / `stringer_id` (assigned via `set-stringer.mjs`);
   `isProviderFor()` in rules lets a provider read **their own** redemptions only
6. The whole surface is browsable logged-out inside `/marketplace` — balance reads 0, nothing
   redeemable
7. `offers`, `redemptions`, `group_lessons` reject **all** client writes

---

## 12. Marketplace & Contact Sharing — **NEW** *(tests: MP-01…MP-06)*

### Listings
Create (`kind: 'rent' | 'sell'`, `status: 'available'`, own uid — rules-enforced) → photos to
`listings/{uid}/` (image-only, <5 MB, SafeSearch-moderated) → edit/delete by owner.

### The contact model (no in-app messaging)
`contacts/{uid}` is readable by: the owner; an organizer; a **connection**
(`connections/{uidA__uidB}`, written *only* by `onMatchConnection` on an **accepted**
rally/challenge or a shared tournament fixture — an open request earns nothing); or a
**public-contact holder** (`public_contacts/{uid}`, maintained by `onListingContact`: posting a
listing *is* the invitation to be contacted; deleting the last listing revokes it).

**Consequence for all code:** a denied `contacts` read is *normal*. `.catch()` every read
individually — one `Promise.all()` over the batch blanks the whole page when a single connection
doc hasn't landed yet.

`pairId()` exists in both `functions/connections.js` and `firestore.rules` — the two must stay
byte-identical (test MP-06).

---

## 13. Tasks, Check-ins & Group Awards *(tests: GA-01…GA-03)*

- `/tasks`: tiered tasks (play/challenge/check-in/photo/social), progress in `tasks/{uid}` —
  owners may write only the whitelisted setup fields; points are server-awarded (`taskPoints.js`)
- Check-ins/attendance: geolocated, ≤400 m from the court, uid-prefixed doc ids (rules-enforced)
- Photo reports (condition / waiting board / queue): auto-approve on create; **`courts` docs are
  immutable** — which is why Board Freshness pays from `onDocumentCreated`
- Claims (volunteer/ambassador/host): player creates as `pending`; only an organizer may update
- Collective bonuses (`groupAwards.js`): Matchday (±36h-bounded query), Hourly Coverage, Court
  Pioneer, Board Freshness, Full Zone Sweep → `tasks.bonusPoints`. Distinct from per-player tier
  points — the two engines never pay for the same thing

---

## 14. Player Removal (creator) *(tests: RM-01…RM-03)*

Removal is an **event-wide purge in one batch**: strip the player from every match doc in the
event (any survivor keeps reconstructing their name), delete their `event_participants` doc (it is
what routes them into a draw), and update the withdrawn list — all in the **same batch**, or the
snapshot race re-seats them before the withdrawal lands.

---

## 15. Notifications *(tests: NT-01…NT-04)*

14 Firestore triggers (`functions/notifications.js`) cover match/rally/challenge lifecycle, score
submissions, schedule and zone-change requests, task progress and event joins; `weeklyReminders`
and `pruneNotifications` run on schedules. Clients can never create; recipients may read,
mark-read (`read`/`read_at` only) and delete their own.

---

## 16. Firestore Collections Reference

The authoritative table (with primary/foreign keys and access model) lives in
`TECHNICAL_HANDOVER.md` §7 and CLAUDE.md. Quick map:

| Collection | Purpose | Writers |
|---|---|---|
| `users` / `stats` / `preferences` / `contacts` | Identity (doc id = uid; PII only in `contacts`) | Signup / profile / functions |
| `events` (+ `rr_drafts` subcoll.) | Events + pre-generation RR drafts | Creator |
| `event_participants` | Joins, routes players into draws | Player / creator |
| `matches` | singles · doubles · rally · challenge · score_submission | Tournament / ladder / rally services |
| `courts` | check-in · attendance · condition · waiting_board · queue (immutable) | Check-in / photo services |
| `tasks` (+ `task_claims`) | Progress per uid + `offer` catalog rows | Player (whitelist) / functions |
| `offers` / `redemptions` / `group_lessons` | Rewards (server-only writes) | `rewards.js` |
| `listings` | Marketplace | Owner |
| `connections` / `public_contacts` | Contact-visibility grants (server-only) | `connections.js` |
| `notifications` / `ranking_history` / `site_stats` | Feed, rank history, aggregates (server-only) | Functions |
| `mailing_list` | Newsletter (open create) | Public form |

**Retired (do not reintroduce):** `tournament_matches`, `court_visits`, `court_attendance`,
`court_reports`, `court_suggestions`, `rallies`, `ladder_challenges`, `score_submissions`,
`task_progress`, `redeemable`, `rewards`, `group_awards`, `zone_sweeps`.

---

## 17. New workflows to test — quick index

| Workflow | Section | Test cases |
|---|---|---|
| Zone-based draws (reset/advancement isolation, zone changes) | §5 | Z-01…Z-08 |
| RR group formation & editing | §7 | RR-01…RR-09 |
| RR knockout generation | §7 | RR-10, RR-11 |
| RR sibling-draw self-heal | §7 | RR-12 |
| RR late joiners + `regroup:rr` EOD script | §7 | LJ-01…LJ-04 |
| Points: RR 3/1, +5 stamped bonus, doubles partners, round table | §9 | PT-01…PT-09 |
| Ladder confirm (transaction, floor, connections) | §10 | LD-01…LD-05 |
| Rewards / coupons / group lessons (server-side) | §11 | RW-01…RW-07 |
| Marketplace listing → contact visibility | §12 | MP-01…MP-06 |
| Notifications routing & access | §15 | NT-01…NT-04 |
| Player removal purge | §14 | RM-01…RM-03 |
| Group awards (create-trigger, bounded queries) | §13 | GA-01…GA-03 |
| RR drafts rules bug (expected-fail regression) | §7 | DR-01, DR-02 |
| Placement-based draw visibility | §4 | VS-01…VS-03 |
