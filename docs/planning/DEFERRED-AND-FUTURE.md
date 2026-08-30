# Deferred work and future sprints

> **Everything ruled out of [D6](sprints/SPRINT-D6.md), [D7](sprints/SPRINT-D7.md) and [D8](sprints/SPRINT-D8.md), plus the files that do not exist yet.**
> Same format as the sprint documents. Every row names the files it touches and the lines it changes, so nothing has to be re-discovered.

|                  |                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**         | 2026-08-29                                                                                                                               |
| **Scope**        | Deferred items with a recorded design, the 24 blocked backlog rows, the UI elements not yet built, and the 16 source files still missing |
| **Register**     | [BACKLOG.md](../BACKLOG.md) — 66 rows: 24 blocked, 18 pending, 18 backlog, 6 closed                                                      |
| **Sprint order** | [D6](sprints/SPRINT-D6.md) → [D7](sprints/SPRINT-D7.md) → [D8](sprints/SPRINT-D8.md) → this                                              |

**Line numbers are `dev-anuj` @ `ac4dfb1`.** Re-check before editing.

---

## 1 · Where the planning corpus moved

The `2026-08-23` reorganisation moved every planning document. Links here point at the new paths; anything still citing `docs/notes/…` or `docs/sprints/…` is stale — **both directories are now empty**.

| Was                                    | Now                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `docs/notes/HARMONIZATION_REPORT.md`   | [archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md](../archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md)     |
| `docs/notes/DECISIONS_BRIEF.md`        | [archive/planning-2026-08-23/notes/DECISIONS_BRIEF.md](../archive/planning-2026-08-23/notes/DECISIONS_BRIEF.md)               |
| `docs/notes/WORKFLOW-STATES.md`        | [archive/planning-2026-08-23/notes/WORKFLOW-STATES.md](../archive/planning-2026-08-23/notes/WORKFLOW-STATES.md)               |
| `docs/notes/WORKFLOW_DESIGN_REPORT.md` | [archive/planning-2026-08-23/notes/WORKFLOW_DESIGN_REPORT.md](../archive/planning-2026-08-23/notes/WORKFLOW_DESIGN_REPORT.md) |
| `docs/notes/DEV_ANUJ_CONFLICTS.md`     | [archive/planning-2026-08-23/notes/DEV_ANUJ_CONFLICTS.md](../archive/planning-2026-08-23/notes/DEV_ANUJ_CONFLICTS.md)         |
| `docs/notes/PROJECT-PLAN.md`           | [archive/planning-2026-08-23/notes/PROJECT-PLAN.md](../archive/planning-2026-08-23/notes/PROJECT-PLAN.md)                     |
| `docs/notes/UI-REMAINING.md`           | [archive/planning-2026-08-23/notes/UI-REMAINING.md](../archive/planning-2026-08-23/notes/UI-REMAINING.md)                     |
| `docs/ACTION-REPORT.md`                | [archive/planning-2026-08-23/ACTION-REPORT.md](../archive/planning-2026-08-23/ACTION-REPORT.md)                               |
| `docs/FIX-TODAY.md`                    | [archive/planning-2026-08-23/FIX-TODAY.md](../archive/planning-2026-08-23/FIX-TODAY.md)                                       |
| `docs/sprints/SPRINT-D1..D5.md`        | [archive/planning-2026-08-23/sprints/](../archive/planning-2026-08-23/sprints/)                                               |
| `docs/uisummary_report.md`             | [archive/planning-2026-08-23/uisummary_report.md](../archive/planning-2026-08-23/uisummary_report.md)                         |

`ELEMENT-DESIGN-BRIEFS.md` (407KB, per-element specs, needed by [D7](sprints/SPRINT-D7.md)) is **not committed anywhere** — it exists only on the `staging-setup` branch. **Do not delete that branch.**

---

## 2 · Files that do not exist yet

Verified absent on `dev-anuj` @ `ac4dfb1`. Every sprint row that names one is creating it, not editing it.

### Domain and service modules

| File                                          | Created by                    | Purpose                                                       |
| --------------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `src/features/tournament/domain/seeding.ts`   | [D8 S1](sprints/SPRINT-D8.md) | `seedCount`, `seedAnchors`, `assignByes` — pure, no Firestore |
| `src/features/events/services/partnerPool.ts` | [D6 F1](sprints/SPRINT-D6.md) | `joinPool`, `leavePool`, `usePool`, `usePoolContacts`         |

### Components — the 14 still to build

Thirteen of the shared set already exist, from D3 and D5: `Button`, `Sheet`, `Input`, `SegmentedControl`, plus the nine primitives `Checkbox`, `EmptyState`, `ErrorScreen`, `FieldError`, `PersonRow`, `Pill`, `ProgressRing`, `StatTile`, `Switch`. (`Accordion`, `AlertMessage`, `Toast` and `Tree` also exist but are pre-D3 and are folded into, not counted in, the set.) These fourteen do not exist:

| File                               | Group                              | Retires                                      |
| ---------------------------------- | ---------------------------------- | -------------------------------------------- |
| `src/components/PersonOption.tsx`  | [D7 g1](sprints/SPRINT-D7.md) CS-8 | nine picker surfaces                         |
| `src/components/PersonPairRow.tsx` | D7 g1 CS-9                         | seven copies of `{p1} vs {p2}`               |
| `src/components/PersonChip.tsx`    | D7 g1 CS-10                        | —                                            |
| `src/components/StatGrid.tsx`      | D7 g2 CS-2                         | seven tile geometries                        |
| `src/components/ListRow.tsx`       | D7 g2 CS-4                         | eight copies of one skeleton                 |
| `src/components/EntityCard.tsx`    | D7 g2 CS-5                         | five copies of one footer card               |
| `src/components/ReviewPanel.tsx`   | D7 g2 CS-6                         | five organizer queues                        |
| `src/components/ProfileCard.tsx`   | D7 g2 CS-7                         | **two 700-line components already drifting** |
| `src/components/ApprovePair.tsx`   | D7 g2 CS-11                        | six hand-written approve/reject pairs        |
| `src/components/PlaceCard.tsx`     | D7 g2 CS-16                        | —                                            |
| `src/components/ConfirmSheet.tsx`  | D7 g3 MF-10                        | four browser `confirm()` dialogs             |
| `src/components/Popover.tsx`       | D7 g3 MF-11                        | three in-flow popovers                       |
| `src/components/Skeleton.tsx`      | D7 g3 CS-35                        | —                                            |
| `src/components/Spinner.tsx`       | D7 g3 CS-36                        | the second loading mechanism                 |

**Binding rule from D7:** register each primitive in `.design-sync` **in the commit that creates it**, and consume it at one real call site in the same change. Tailwind compiles from `src/` only — a preview using a class no source file uses renders unstyled.

### Rules blocks

| Path                                    | Created by                                                       | State                             |
| --------------------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| `services/{serviceId}`                  | [D6 C12](sprints/SPRINT-D6.md) — insert at `firestore.rules:303` | **absent; falls through to deny** |
| `partner_pool/{eventId}/members/{uid}`  | D6 F1                                                            | absent                            |
| `partner_pool/{eventId}/contacts/{uid}` | D6 F1                                                            | absent                            |

> Rules do **not** cascade into subcollections. Each nested path needs its own `match` block at the full path. This is the exact trap that silently broke Round Robin drafts for months.

### Cloud Functions

| Function                    | File                               | Created by                                                                                              |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `onPartnerPoolJoin`         | `functions/` (new)                 | D6 F1                                                                                                   |
| `onPartnerPoolLeave`        | `functions/` (new)                 | D6 F1                                                                                                   |
| `onParticipantReactivated`  | `functions/participantWorkflow.js` | [D6 C16](sprints/SPRINT-D6.md) — the placer is `onDocumentCreated` at `:91`, so a re-add never fires it |
| unmapped-court notification | `functions/notifications.js`       | D6 F2 — **not implemented anywhere**                                                                    |

---

## 3 · UI elements not yet built

Each names its call site. None of these exist today.

| Element                                                    | Where it goes                                                                                                                           | Sprint                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Book button on every service card**                      | `src/pages/services/ServicesElements.tsx` — `bookService` exists at `servicesApi.ts:21` with **no control calling it**; verified absent | [D6 C8](sprints/SPRINT-D6.md)                                    |
| **"Racquet dropped" / "Completed" controls**               | `ServicesElements.tsx` — the `lead → in_progress → completed` transitions                                                               | D6 C8                                                            |
| **"Got your racquet back?" yes/no form**                   | `ServicesElements.tsx`                                                                                                                  | D6 C8                                                            |
| **Partner pool panel**, three states                       | doubles tournament tab — open by default in-pool with contacts; names-only when paired                                                  | D6 F1                                                            |
| **Court multi-select at join**, replacing zone chips       | `src/features/events/EventsElements.tsx:612-627`, gate at `useJoin.ts:132-133`                                                          | D6 F2                                                            |
| **Link to `/courts` with zone layers on**                  | below the court picker, and `ProfileInfo.tsx:266`                                                                                       | D6 F2                                                            |
| **Unplayed-group-match warning**                           | above the size bar, `RoundRobinView.tsx:232-241`                                                                                        | D6 C1                                                            |
| **Withdraw button** (member)                               | `useJoin.ts`                                                                                                                            | D6, from L12                                                     |
| **Reset control + orange `!` withdrawal form** (organizer) | `useTournament.ts`                                                                                                                      | D6, from L12                                                     |
| **Seed badge `(1)`**                                       | the `seed` slot on `PersonRow`                                                                                                          | [D7 CS-3b](sprints/SPRINT-D7.md) → [D8 S3](sprints/SPRINT-D8.md) |
| **Consent banner before analytics fires**                  | app shell                                                                                                                               | D7 g4 AX-26 — gates the Privacy claim in BLG0067                 |
| **Leaderboard progress chart**, rebuilt                    | last 5 matches, inverted rank axis, no tick labels                                                                                      | D7 g7                                                            |

---

## 4 · Deferred, with the design recorded

Not scheduled. Each has enough written down to start without re-deciding.

### 4.1 Privacy Policy and Terms of Service — [BLG0067](../BACKLOG.md)

**Files** · `src/pages/StaticPages.tsx:213-311` (Terms, 9 sections) · `:313-364` (Privacy, 5 sections). Routes at `App.tsx:39-40, 170-171`.

Deferred by owner ruling 2026-08-29. Under "the member pays the provider directly", Terms need a provider-relationship section, a points-and-rewards section, a corrected §2 (`:226-232` calls this a "non-profit platform" and never mentions money), and an effective date. Privacy needs **EXIF GPS on court photos** (`courts` stores `exif_gps_lat`, `exif_gps_lng`, `exif_camera`, `exif_taken_at` — undisclosed), the contact-sharing model, photos, WhatsApp, named processors, retention, PIPEDA rights, a named contact, and breach notification.

**Blocked on two facts:** the accountable privacy contact, and the legal entity name.
**Lawyer review before publication:** the liability waiver (`:268-284`), the minors clause (`:235-241`), the provider section.

### 4.2 Provider contact through a booking connection

Recorded in [D6 C12](sprints/SPRINT-D6.md). Booking creates a connection keyed on `services.provider_id` → `providers/{providerId}`; the contact button and booking number appear once the member books or the provider accepts. Same shape as the opponent `connections/{a__b}` mechanism.

**While deferred:** `contact_phone` and `contact_email` sit on the world-readable `services` document, so they are readable by anyone querying the collection directly. Closing that is a one-line change to `scripts/build-sample-dataset.mjs` plus the shape reference, whenever the connection work lands.

### 4.3 The lesson add-on and coaching pool

Documented by [D8 S5](sprints/SPRINT-D8.md), **not built**. Full sketch in [DATA_SHAPE.md §9](../architecture/DATA_SHAPE.md). Storage would follow D6 F1's precedent — a `lesson_pool/{eventId}/members/{uid}` subcollection, because batching four players across an event is **not** derivable from a participant row.

**Five questions still unanswered:** what separates the $20/hr and $15/hr tiers; the "free 15/hr" contradiction; where the pool lives; how the add-on fee reaches `services` and `bookings`; whether "games" hold state. [BLG0061](../BACKLOG.md) is the formal row.

### 4.4 Reseeding a generated draw

Forbidden by D8 decision 4. Seeds freeze at generation; a later entrant takes an open slot and renumbers nobody.

### 4.5 Backup and restore before a live migration

[BLG0023](../BACKLOG.md). Not a D6 blocker under emulator-first — C3 and C4 run against a disposable database. It becomes blocking the moment those migrations are pointed at `toronto-tennis-league`. The only real restore point today is `analysis/snapshots/2026-08-17T01-21-49-655Z/` (3,243 documents), and it ages.

---

## 5 · The 24 blocked backlog rows

Nothing below can start until a decision is recorded.

### Gating a scheduled sprint

| Row                                                 | Decision needed                            | Gates                                               |
| --------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| [BLG0013](../BACKLOG.md) · [BLG0031](../BACKLOG.md) | The authoritative court roster             | **D6 F2** — courts-not-zones needs a canonical list |
| [BLG0012](../BACKLOG.md)                            | Runtime-editable court and zone resolution | D6 F2's unmapped-court flow                         |
| [BLG0026](../BACKLOG.md)                            | Expanded-control clearance                 | **D7 g4** BT-9/10/17                                |
| [BLG0027](../BACKLOG.md)                            | Hit expansion on bracket and RR rows       | D7 g4                                               |
| [BLG0028](../BACKLOG.md)                            | 16px versus pill corners                   | D7 g4                                               |
| [BLG0029](../BACKLOG.md)                            | Marketing display type exception           | D7 g4                                               |
| [BLG0034](../BACKLOG.md)                            | Court Map design-system contract           | D7 g4 CT-26                                         |
| [BLG0035](../BACKLOG.md)                            | The fixed 78px action slot                 | D7 g1 CS-20                                         |
| [BLG0036](../BACKLOG.md)                            | Avatar scale                               | D7 g1 CS-17                                         |
| [BLG0037](../BACKLOG.md)                            | Tasks headline-ring denominators           | D7 g3 CS-30                                         |
| [BLG0039](../BACKLOG.md)                            | Canonical prose width                      | D7 g4                                               |

### Product and platform

| Row                                                 | Decision needed                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [BLG0011](../BACKLOG.md)                            | One surviving Challenge entry point                                                      |
| [BLG0019](../BACKLOG.md)                            | Event taxonomy and the creation modal                                                    |
| [BLG0020](../BACKLOG.md) · [BLG0021](../BACKLOG.md) | Mobile app versus PWA, then push notifications                                           |
| [BLG0022](../BACKLOG.md)                            | Staging tier — **answered for D6 by emulator-first**, still open for eventual deployment |
| [BLG0023](../BACKLOG.md)                            | Backup and restore policy — see 4.5                                                      |
| [BLG0038](../BACKLOG.md)                            | Contact-method switches and migration                                                    |
| [BLG0055](../BACKLOG.md)                            | Replace the hard-coded super-admin bootstrap — `firestore.rules:17` pins a literal uid   |
| [BLG0058](../BACKLOG.md)                            | Verify deployed trigger versions and legacy document shapes                              |
| [BLG0059](../BACKLOG.md)                            | A public-field sensitivity contract — the general form of 4.2                            |
| [BLG0061](../BACKLOG.md)                            | Event add-on schema — see 4.3                                                            |
| [BLG0065](../BACKLOG.md)                            | Resend, DNS, secrets, allowlisted delivery                                               |
| [BLG0066](../BACKLOG.md)                            | Mobile offline, sync, deep-link and device acceptance contract                           |
| [BLG0067](../BACKLOG.md)                            | Privacy and Terms — see 4.1                                                              |

---

## 6 · Carried debt

| Item                              | Where                                                                       | Clears when                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The legacy fixture island**     | `tests/fixtures/local-fixtures.mjs` — `LEGACY_COMPAT_FIXTURES`, 6 documents | The `providers` cutover and the `services` migration land. Then deleting one array is the whole change. A unit test asserts the list does not grow |
| **`result_application`**          | `functions/tournamentResults.js:212, 223, 307`                              | [D6 C10](sprints/SPRINT-D6.md), lowest priority in that sprint                                                                                     |
| **Two copies of the award table** | `functions/lib/tournamentResult.js` and the browser                         | D6 C5 takes three to two; [D7 g6](sprints/SPRINT-D7.md) removes the browser's need entirely via stored `points_winner` / `points_loser`            |
| **`test:e2e` never run**          | —                                                                           | Port 8080 freed; the launcher now moves around a busy port, so this is no longer blocked by a stale process                                        |
| **Seven data-shape corrections**  | `tests/fixtures/shape-reference.mjs`, `scripts/build-sample-dataset.mjs`    | [D8](sprints/SPRINT-D8.md) — see its "Also in this sprint"                                                                                         |
