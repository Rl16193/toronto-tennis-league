# Racquets & Strings — Vision

> Built from the grilling sessions of 2026-08-31 (three rounds plus follow-up, Q1–Q22 —
> all answered). Everything below is the owner's answer, recorded; where a recommendation
> was overridden, the owner's ruling stands.

|              |                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Date**     | 2026-08-31                                                                                                       |
| **Beta**     | 3rd week of September 2026, on a staging Firebase project                                                        |
| **Platform** | PWA + website this season; native revisited after winter                                                         |
| **Related**  | [DECISIONS-2026-08-29.md](DECISIONS-2026-08-29.md) · [task queue](tasks/README.md) · [BACKLOG.md](../BACKLOG.md) |
| **Contains** | §1–§9 the vision · §10 the 2026-08-31 gap rulings · §11 pending work outside sprints D6–D8                       |

---

## 1 · The vision

**A one-stop shop for everything tennis, built as a platform of locations.** Members join
events, play matches — tournaments, standalone knockouts, challenges, rallies — and climb one
**global ranking system** shared by every location. Around the matches sits the club life:
tasks and rewards, a marketplace, provider services (stringing, coaching), court maps, and —
from this winter — court-booking options with partner venues. Membership is free, funded by
seasonal gifts and donations (summer and winter campaigns) and, later, by court-booking
partnerships. Toronto is the first location; expansion happens by appointing an organizer in
a new city.

> **Why "location", not "league":** the app already has a `league` field — the Men's/Women's
> distinction on profiles and the ladder. The city-level concept is called **location**
> everywhere to keep the two from colliding.

## 2 · The platform model

- **A location is created by an event.** Everything existing becomes **Toronto**. When a newly
  appointed organizer creates an event in Markham or Brampton, that location comes into
  existence and every established rule applies to it automatically. The `location` column
  enters the data model **before beta** (owner-confirmed), so expansion is a new value, not a
  migration.
- **Zones belong to a city**, set by how spread out its courts are (Toronto has 7). Zone lists
  are decided by the super-admin and the location's organizer together; conflicts settled in
  person.
- **Only the global leaderboard is visible across locations.** A leaderboard row shows name and
  stats, nothing more; **profiles and profile cards require an established connection.** A
  future release adds a **city + country location tag** to profile cards, leaderboard rows, and
  player rows.
- **A member's location is derived from the city of their preferred courts** (Toronto courts →
  Toronto location), set at signup with no extra UI and updating itself when they change courts.
- **Playing is location-scoped.** Challenges and rallies cannot be sent to members of another
  location. Across zones _within_ a location they are allowed — zones exist for court
  convenience, not as walls. Enforced server-side.
- **Providers and services belong to a city.** The current batch moves under Toronto. The
  super-admin curates the catalogue; a location's organizer requests additions for their region.
- **One person can hold several roles** (member + organizer, member + provider, …).

## 3 · Roles and their workflows

**Every role:** sign up · edit profile · view the contact details and profile card of anyone
in their connections.

| Role                          | Responsibilities                                                                                                                                                                                                                                                                                   | Workflows                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Member**                    | Join events · submit scores · view the leaderboard · complete tasks · book services · redeem discounts and offers · post on the marketplace · send/accept/decline challenges and rallies · withdraw from an event · change courts/zones (organizer notified) · join/leave the doubles partner pool | Score submission · booking · challenge/rally · withdrawal · zone change             |
| **Organizer / event creator** | Add and edit events · generate draws and matches · resolve score disputes · record walkovers (organizer-only) · withdraw/remove/re-add participants (re-added players get re-seated) · download draws with participant contacts · share draws externally · receive zone-change notifications       | Draw generation · dispute resolution · participant management                       |
| **Provider**                  | See leads — members who join their coaching sessions or request stringing services · complete jobs · mutual contact visibility with players in their coaching sessions                                                                                                                             | Job completion                                                                      |
| **Super-admin**               | Sees all locations and users · creates locations by appointing regional organizers · sets zone lists with organizers · curates the provider/service catalogue per city · adds custom courts to the court map after verification · full data access via database export                             | Location creation · organizer appointment · catalogue curation · court verification |

**The system does these — no role owns them:** paying points · creating connections ·
flagging disputes · deriving streaks and leaderboards · sending notifications.

**Connections form** when a match, rally, or challenge is **created** (so opponents can reach
each other to schedule), between a participant and the **organizer** when the participant
joins an event, and between a member and a **provider** when the member requests a service or
joins a coaching session.

## 4 · The September beta

**Where:** a staging Firebase project (hosting + rules + functions deployed) with a shareable
`*.web.app` URL. The migrated live-data snapshot seeds it, contacts included — connections gate
who can see them (ruling, §10.2). The emulator remains the owner's
local test bench only. **Standing up staging is critical path** (backlog BLG0022).

**Who:** 10–20 invited members across at least two zones.

**Notifications during beta:** in-app only. Nothing is sent by email or push (ruling, §10.3).

**Support during beta:** the existing WhatsApp group. The beta carries on through problems;
issues are recorded as **live bugs** in [BACKLOG.md](../BACKLOG.md) and worked through the task
queue (ruling, §10.7).

**Beta scope (owner-defined), in four blocks:**

**Block 1 — the five non-negotiables**

1. Player profile — edit zones, skills, everything
2. Event joining
3. Score submission, draw generation and advancement
4. Download a draw and share it externally — **contacts stay in the shared draw** (owner
   ruling, so opponents can be contacted without opening the app)
5. Court map interactions

**Block 2 — UI/UX simplification**

- Simpler, uniform UI/UX element design across beta surfaces (the D7 shared-component look)

**Block 3 — additional scope**

- Service booking
- Challenges and rallies (the unified result model; _rally_ terminology throughout)
- Tasks and rewards
- Marketplace
- Doubles partner pool

**Block 4 — payment gateway**

- **Donations**: real payment gateway (Stripe — cards, Google Pay, Apple Pay), a
  "Support the league" button, a new collection recording payments and donors, a
  **Contributor Badge** on the donor's profile, and refunds tested end-to-end

> **Honest flag:** this is an aggressive three weeks. If the clock wins, cutting from
> Block 3 costs the beta least; the five non-negotiables cannot slip.

**Explicitly not in beta:** transactional winter booking, native app, season dashboard,
location tags, production cutover.

## 5 · Milestones — the project is developed in phases

A phase closes only when its **acceptance criteria** pass and its **exit gate** is met; the
next phase starts on a closed phase. Staging (M5) is infrastructure and can be stood up in
parallel at any point before M6.

| #      | Milestone                                | In one line                                                                                                                                                    |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** | **A provably green branch**              | `npm run verify` passes on `dev-anuj` at one exact commit; every failure fixed or linked to a backlog row                                                      |
| **M1** | **Phase 1 — the five non-negotiables**   | The core league loop works end to end                                                                                                                          |
| **M2** | **Phase 2 — UI/UX simplification**       | One uniform element set on every beta surface                                                                                                                  |
| **M3** | **Phase 3 — additional scope**           | Booking, challenges/rallies, tasks/rewards, marketplace, partner pool                                                                                          |
| **M4** | **Phase 4 — payment gateway**            | Donations with refunds, proven in test mode                                                                                                                    |
| **M5** | **Staging live**                         | Shareable staging URL, seeded snapshot, installs as a PWA on a phone                                                                                           |
| **M6** | **Beta release — 3rd week of September** | Cohort live; feedback triaged through the task queue; a real-money donation and refund proven; profile-card consolidation and seeding land during beta         |
| **M7** | **Production cutover**                   | Backup/restore tested with a real non-production restore; migration evidence recorded; independent reviews approve the same commit; the live league moves over |
| **M8** | **Winter & money (Oct–Dec)**             | Partner-bubble listings with off-peak discounts; winter donation campaign; season dashboard reporting §6's numbers                                             |
| **M9** | **The second location**                  | A Markham/Brampton event creates a live location with zones, rules, and regional services; location tags on cards and rows                                     |

For M0 and M5–M9 the one-liner is the exit gate. The four development phases get explicit
criteria:

### M1 · Phase 1 — the five non-negotiables

**Scope.** Profile editing (zones, skills), event joining, score submission, draw generation
and advancement, draw download and external share, court map — plus the corrections and the
`location` field underneath them.

**Acceptance criteria**

- Each of the five journeys passes end to end on the emulator, each backed by a test that
  failed before the fix
- The knockout gate opens correctly with incomplete groups and placeholder matches (the C1
  fault stays dead)
- The one result model applies on tournament matches: either player submits, lower-margin
  rule, dispute flag on conflicting winners
- Downloaded draw carries the draw and participant contacts; the shared version renders
  cleanly outside the app
- A member's location is derived from their courts; cross-location challenge/rally is refused
  server-side
- Vocabulary, event-type, and location migrations rehearsed on the emulator snapshot with
  before/after counts recorded

**Exit gate**

- `npm run verify` green; owner walks the five journeys on the emulator and signs off

### M2 · Phase 2 — UI/UX simplification

**Scope.** The shared element set applied across beta surfaces; every browser `confirm()` and
native dropdown replaced by a modal form; one name formatter. Running after Phase 1 means each
dialog is built once, against settled behaviour.

**Acceptance criteria**

- Every beta surface uses the shared element set — no one-off variants of buttons, inputs,
  rows, or modals remain on those screens
- Zero native `confirm()` dialogs and zero native `<select>` elements in beta surfaces
- Names render `Blake Bell` style everywhere; bracket placeholders (`BYE`, `Winner of …`)
  survive intact
- Layouts hold on a phone, in light and dark

**Exit gate**

- `npm run verify` green; a walkthrough of the five core journeys on the emulator shows the
  uniform look; owner signs off on the visual result

### M3 · Phase 3 — additional scope

**Scope.** Service booking, challenges and rallies on the unified model, tasks and rewards,
marketplace, doubles partner pool.

**Acceptance criteria**

- Challenges and rallies use the same result path as tournaments; the old handshake and the
  rally dead-end are gone; `friendly` is renamed to `rally` in UI and stored data
- Booking round-trip works: member books → provider sees the lead → job completed → connection
  exists both ways
- Firestore rules cover the services path (today it falls through to deny)
- Partner pool: join, leave, and pool-only contact visibility all enforced
- Tasks pay out server-side; marketplace posts are listing-mediated as ruled

**Exit gate**

- `npm run verify` green, including rules tests for every collection this phase touches;
  owner sign-off

### M4 · Phase 4 — payment gateway

**Scope.** Stripe donations: cards, Google Pay, Apple Pay; "Support the league" button;
payments-and-donors collection; Contributor Badge; refunds.

**Acceptance criteria**

- A test-mode donation completes and writes a payment + donor record
- The Contributor Badge appears on the donor's profile from that record
- A test-mode refund processes and is reflected in the record
- No card data ever touches the app or database — Stripe-hosted surfaces only; keys held as
  server secrets, never in client env

**Exit gate**

- `npm run verify` green; end-to-end test-mode donation **and** refund demonstrated to the
  owner. (The live-money proof happens at M6 on staging)

## 6 · A successful season — the numbers

- **No pending results** at season end; **> 90 %** of matches have a submitted score or a walkover
- **All events and tournaments finished; prizes distributed** (prizes handled entirely off-app)
- **Matches played per active member per month > 1**
- Season participation: **singles > 60 %** of all users, **doubles > 30 %**

The M8 season dashboard exists so these are read from a screen, not from database exports.

## 7 · Money

- **Never a paid membership.** Free for members.
- **Donations** (from beta): Stripe gateway with cards + Google/Apple Pay, payments-and-donors
  collection, Contributor Badge, refund path tested.
- **Winter courts** (Oct–Dec): partner with bubble organizations, present availability for all
  hours with discounts for off-peak; the league does not book courts except for events —
  members book with the venue themselves. In-app booking + payment becomes worthwhile only
  with a real partner API or revenue share.

## 8 · Glossary

| Term                                                     | Meaning                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Location**                                             | A city's competition community, created by an event's location (Toronto now; Markham/Brampton on expansion). A member's location derives from their preferred courts' city. Playing is location-scoped        |
| **League**                                               | The app's existing `league` field — the **Men's / Women's** distinction on profiles and the ladder. Never used for cities                                                                                     |
| **Zone**                                                 | Geographic grouping of courts inside a location (Toronto has 7), derived from a member's chosen courts. Cross-zone play is allowed                                                                            |
| **Global leaderboard**                                   | One ranking system across all locations — the only surface visible cross-location. Future: city + country location tag on rows                                                                                |
| **Member / Organizer / Provider / Super-admin**          | The four roles — §3. One person can hold several                                                                                                                                                              |
| **Event types**                                          | Exactly four: **Socials, Tournaments, Specials, League Ladder**                                                                                                                                               |
| **Challenge**                                            | A competitive match one member proposes to another, within their location; declining notifies the creator                                                                                                     |
| **Rally**                                                | The canonical term (replaces _friendly_ everywhere). A casual match; entering a score is optional and earns extra points — an unplayed rally pays nothing                                                     |
| **Knockout**                                             | Elimination play — the stage after Round Robin groups **or a standalone competition**                                                                                                                         |
| **Draw**                                                 | The competition structure inside an event, shown only when players in it exist                                                                                                                                |
| **Round Robin / group**                                  | Everyone-plays-everyone stage; groups formed by zone, then skill, then courts                                                                                                                                 |
| **Seeding**                                              | Placing the strongest apart in a knockout — draw of 4→2 seeds, 8→4, 16→8, 32→10; ties alphabetical                                                                                                            |
| **One result model**                                     | Either player submits; the score applies immediately; same winner twice → lower aggregate margin stands; different winners → dispute flag for the organizer                                                   |
| **Walkover**                                             | Organizer-recorded unplayed match: 1 point each in groups, advancement in knockouts; never counts as played                                                                                                   |
| **Withdrawn**                                            | The only player state, scoped to one event; unplayed matches pay per the scoring table but don't count as played                                                                                              |
| **Pending / Done**                                       | The only two words a member sees on a match card                                                                                                                                                              |
| **`confirmed` / `declined` / `withdrawn` / `completed`** | The four stored status words — one per idea                                                                                                                                                                   |
| **Connection**                                           | What unlocks contact details and profile viewing: created when a match/rally/challenge is **created**, organizer↔participant on event join, and member↔provider on a service request or coaching-session join |
| **Shared draw**                                          | The externally shareable draw **includes participant contacts** (owner ruling — opponents reachable without the app)                                                                                          |
| **Points economy**                                       | Match points, tasks, rewards, redemptions — server-authoritative, paid by Functions                                                                                                                           |
| **Contributor Badge**                                    | Profile badge for members who donate; backed by the payments/donors collection                                                                                                                                |
| **Season**                                               | Summer and winter halves, each with its own donation campaign. Distinct from the **league year**, which is what the points halving turns on                                                                   |
| **Lead**                                                 | A member who joins a provider's coaching session or requests their stringing service — what the provider sees                                                                                                 |
| **P/G won %**                                            | Percentage of points/games won — the efficiency stat                                                                                                                                                          |
| **Streak**                                               | Consecutive wins or losses (`2W`/`2L`), derived, never stored                                                                                                                                                 |
| **Location tag**                                         | Future: city + country shown on profile cards, leaderboard, player rows                                                                                                                                       |
| **Task packet / `/queue`**                               | The delivery loop: one file per task moving plan → code (Codex) → test → dual review — [tasks/README.md](tasks/README.md)                                                                                     |
| **League year**                                          | The year a league-points column belongs to (`leaguePoints26`, `leaguePoints27`…). At the boundary the column halves into the next one — §10.5                                                                 |
| **Carry-forward**                                        | Half of the previous league year's standing, seeded into the new year's column. It moves that year's league points, never the wallet                                                                          |
| **Wallet**                                               | What a member can actually spend: every league point ever earned, plus task points, minus points already redeemed. Never halved — §10.8                                                                       |
| **Live bug**                                             | A problem found once the beta is live. Recorded in [BACKLOG.md](../BACKLOG.md) and queued; it never stops the beta — §10.7                                                                                    |

## 9 · Notes

**Settled — a member's location** (Q22, 2026-08-31): derived from the city of their preferred
courts (Toronto courts → Toronto location), set at signup with no extra UI, updating when the
member changes courts.

**Settled — dispute resolution and result correction are one mechanism** (2026-08-31): the
organizer opens the disputed match and enters the final score; that entry applies, clears the
dispute flag, reverses and repays points, and is recorded in the audit trail. There is no
separate result-correction workflow, and none is listed. One guard applies: the winner cannot
change once the next match already has a result.

**Settled — consent for shared contacts** (2026-08-31): one plain sentence at signup and at event
join says that a shared draw carries the member’s contact details. Court photos have their EXIF
GPS stripped on upload, so there is nothing further to disclose about them. This is the narrow
slice the beta needs; the full Privacy and Terms rewrite (BLG0067) stays deferred. See §10.4.

**Note — where rulings live.** Behaviour rulings stay in the decisions register
([DECISIONS-2026-08-29.md](DECISIONS-2026-08-29.md) and successors); this document carries the
vision, roles, milestones, and glossary. The 2026-08-31 glossary expansions (rally, standalone
knockout, connection timing, name display) are definitions, not rulings, per the owner.

## 10 · The 2026-08-31 gap rulings

> Seven gaps were found in what this document did **not** say, and all seven now carry an owner
> ruling. Recorded here with what each costs against code that already exists. One of them — the
> league-points halving — had been decided before and had reached no document, which is why they
> live in the vision now rather than in a conversation.

### 10.1 · Doubles

**Ruling.** Doubles is not a gap and needs no separate treatment. A doubles result pays through
the same one result model as everything else and moves the same global ranking. There is no
separate doubles points system.

**The only doubles-specific thing** is presentational: inside the doubles pool, the **expandable
row** carries doubles-only statistics.

**Ruling — what the doubles pool card carries.** Five things: doubles matches won, P/G won %,
partners numbered 1, 2, 3… where a member has played with several, an availability tag, and a
nearby tag.

**Why this surface needed its own ruling.** Ruling 6 of the decisions register fixes exactly
what the leaderboard row and the Round Robin group table show and states that nothing else
renders on either. The doubles pool card is a third surface it does not cover, so nothing
previously said what belongs on it.

**Where it renders.** In the **expandable row** — the card a player row opens into, the same one
the leaderboard uses, as everywhere else in the app. The availability and nearby tags sit in
that card alongside the rest.

**So the readability rule does not bite.** D7's limit of two numbers beside a name at 360px
applies to the player row, which is unchanged here. The card it opens into has room for both
figures, the numbered partner list and both tags without competing for row width.

---

### 10.2 · The staging seed

**The gap.** §4 seeds staging from the migrated live snapshot. That snapshot is 3,243 documents
covering 185 real members with their names, emails and phone numbers, and staging is a separate
project with a shareable public URL. The beta cohort are themselves league members, so they are
not strangers — but the other ~165 people are in that data and were never asked.

**Ruling.** The snapshot seeds staging as it is, **contacts included**. No scrubbing.

**Why that is safe.** Contact visibility is gated by connections, not by the seed. A member
reaches another member's contacts only through a match, rally or challenge, through an event
they organize, or through a provider relationship. Seeding real contacts therefore exposes
nothing to a beta member who has no connection to that person — the concern this gap raised is
already closed by the connection model, and scrubbing would have been guarding a path the rules
do not open.

**What it buys.** Block 1's download-and-share journey is proven end to end on staging with the
data it will actually carry, and the seeding script needs no change at all.

---

### 10.3 · Notifications

**The gap.** §3 makes notifications a system responsibility, organizers are notified on zone
changes, and a declined challenge notifies its creator — but no delivery channel was ever
chosen, and both candidates sit on blocked backlog rows: BLG0065 for email delivery, DNS and
secrets, BLG0020/21 for PWA versus native and push.

**Ruling.** In-app only for the September beta. Nothing is sent outside the app.

**What it buys.** Neither blocked row enters the critical path three weeks out. No DNS, no
sending domain, no secrets, no delivery allowlist. A 10–20 person cohort can also be reached
directly.

**After beta.** Resend is connected and email notifications go out. BLG0065's work — the sending
domain, DNS, secrets and the allowlisted delivery path — lands then rather than now. Push stays
behind the BLG0020/21 platform decision.

---

### 10.4 · Consent

**The gap.** §9 left this as a recommendation rather than a ruling: that draws shared outside
the app carry participant contacts, and the join terms should say so. Meanwhile court photos
store EXIF GPS coordinates that nothing discloses to anyone.

**Ruling.** Two things ship with the beta:

- One plain sentence at signup and at event join, saying that a shared draw carries your
  contact details.
- EXIF GPS is stripped from court photos on upload.

**Why these two and not the full policy.** Both close without the two facts that block the
Privacy and Terms rewrite — the accountable privacy contact and the legal entity name — and
neither needs lawyer review. BLG0067 stays deferred exactly as it is.

**Note on the EXIF choice.** Stripping is cheaper than disclosing. Once the coordinates are not
stored, there is nothing to write a policy paragraph about.

---

### 10.5 · League points at the year boundary

**The gap.** §8 defines a season as summer and winter halves with their own donation campaigns.
§1 has one global ranking. Nothing said what happens to points at a boundary. The rule below
had been agreed previously and appears in no document.

**Ruling.** At the end of the year, that season's league points halve — league26's 100 becomes
league27's 50. Task points are untouched.

**Ruling.** The halving applies to **the member's league points for that year only** — the new
year's column is seeded from half the previous year's. The member's spendable balance carries
forward whole.

#### What this costs, and it is the largest item in this document

**The wallet and the year's league points are the same number today.** `functions/rewards.js` computes a
member's redeemable balance as `leaguePoints26` plus earned task points minus points already
spent. The same rule is written down in [REWARDS_RULES.md](../domain/REWARDS_RULES.md).
League points are therefore not only the leaderboard figure — they are half of the member's wallet.
Halving them would halve unspent purchasing power, which the ruling explicitly forbids.

So the lifetime total of league points earned has to be separated from the current year's
league points.

**Ruling — the split is deferred.** It goes to the backlog as a future milestone timed to the
end of the year, not before beta. The recommendation had been to land it before beta, by the
same reasoning §2 applies to the `location` column — put the field in before the data grows, so
the change is a new value rather than a migration. Deferring means it arrives instead as a
backfill over live member data. That is accepted.

**The one constraint the deferral creates.** The split must land **before the first halving
runs**. If the halving runs while the wallet and the year's league points are still the same
field, it takes unspent purchasing power down with them — which is exactly what this ruling
exists to prevent. End of year is therefore both when the split is due and when the halving is
due, and the split has to go first.

**The year rollover is a code change, not a data operation.** `leaguePoints26` is a literal
field name in:

- `firestore.rules` — including the organizer-gated write rule and a field allowlist
- seven Cloud Functions — competition results, friendly points, court counts, withdrawal
  workflow, rewards, rank snapshot, and the shared tournament result library
- four test files
- D8's seeding query, which ranks entrants by it at join time

Moving to `leaguePoints27` means editing all of that, every year. Two things follow. The
rollover needs to be a written, rehearsed procedure rather than remembered in December. And the
halving must be **idempotent** — running it twice must not halve twice.

---

### 10.6 · Super-admin identity

**The gap.** `isSuperAdmin()` compares against a single hardcoded uid in `firestore.rules`.
Organizer is grantable — it reads an `event_creator` flag on the member's preferences document
— but super-admin is a literal string.

**This blocks M5.** Staging is a separate Firebase project with its own Auth tenant and its own
uids. The literal matches nobody there, so on staging there is no super-admin at all: no
location creation, no organizer appointment, no catalogue curation, no court verification. M5
is on the critical path.

**Ruling.** Super-admin stays hardcoded. Alternatives were considered — a uid-keyed row in the
`providers` collection, which is already `write: if false` and already designed to hold
server-issued roles, and a separate role document with the same posture — and both were
declined.

**What must travel with this decision.** The deployed rules have to carry a uid that exists in
the project they are deployed to. Before M5, either:

- the rules carry a second literal for the staging account, alongside the current one; or
- the staging account is created first and the literal updated before the rules are deployed.

**Recorded risk, not a reopened argument.** The role cannot be held by two people, and if that
one account is lost the league has no administrator. This is accepted.

---

### 10.7 · Running the beta

**The gap.** M6 puts a cohort live for several weeks. Feedback was routed "through the task
queue", which is the development loop — not something a member can reach. No trigger existed
for stopping the beta.

**Ruling.** Beta support runs through the existing WhatsApp group. The league already uses it,
the cohort is already there, and it needs no build. The owner triages reports into the task
queue.

**Ruling — the beta carries on.** There are no abort tiers. Issues found during the beta are
recorded as **live bugs** and worked through the normal queue; nothing stops the beta and no
feature is switched off in response. A tiered stop / switch-off / carry-on model was proposed
and declined.

**Where they are recorded.** `docs/BACKLOG.md`, which already carries a bug column alongside its
BLG rows, using the live-bug convention the D1 and D5 sprints ran on.

**Recorded risk, not a reopened argument.** One case in the declined model does not degrade
gracefully: a member able to see contact details for someone they have no connection to.
Recording it and carrying on leaves the exposure running while the fix is queued. This is
accepted.

---

### 10.8 · The wallet split — design

Ruling 5 defers this to an end-of-year milestone. The mechanism is settled here so the work can
start without re-deciding it.

#### What the owner specified

Total points = 2026 points + 2026 carry-forward + 2027 season points + task points − 2026
carry-forward. The carry-forward is added into the season's standing and subtracted again from
the total, so it cancels: **the wallet keeps everything ever earned, and only that year's league
points halve.** Ranking is a stored value, never computed, and each year gets its own column.

#### Two stored counters

| Field                           | Holds                                                           | Written by                     | Halved? |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------ | ------- |
| `stats/{uid}.leaguePoints{YY}`  | That season's standing — the score the leaderboard **sorts on** | Match awards, and the rollover | Yes     |
| `stats/{uid}.leagueEarnedTotal` | Every league point ever earned — the **wallet** base            | Match awards only              | Never   |

Both are stored. Neither the standing nor the wallet base is derived, which is what the owner
asked for. Task points are untouched and already live apart, in `tasks/{uid}` — `earnedRsPoints` sums
setup, tiers and bonus there and never reads `stats`.

#### The rollover, once a year

On 1 January, per member, in one transaction:

- `leaguePoints{new} = floor(leaguePoints{prev} / 2)` — seeds the new season's standing with the
  carry-forward
- `leagueEarnedTotal` — untouched
- `lastRolledOverTo = {new year}` — the idempotency marker

**Floor, not round**, so a halving never inflates: 101 becomes 50, not 51.

**Idempotency** is per member rather than one job-level flag, so a run that fails half way can be
resumed without halving the first half twice. The transaction reads `lastRolledOverTo` and exits
if it already names the target year.

#### Worked example

A member earning 100 in 2026 and 40 in 2027, spending nothing:

| Moment            | `leaguePoints26` | `leaguePoints27` | `leagueEarnedTotal` | Leaderboard reads   | Wallet |
| ----------------- | ---------------- | ---------------- | ------------------- | ------------------- | ------ |
| End of 2026       | 100              | —                | 100                 | the '26 column: 100 | 100    |
| After rollover    | 100              | 50               | 100                 | the '27 column: 50  | 100    |
| After 2027 season | 100              | 90               | 140                 | the '27 column: 90  | 140    |

The standing halves and rebuilds; the wallet only ever grows. Past columns freeze — `leaguePoints26`
stays at 100 forever as the closed 2026 season.

**Score, not position.** The live column is the number the leaderboard _sorts on_, not a rank
itself. `rankSnapshot` runs daily, reads the whole `stats` collection, sorts by that score within
each division, and writes `rankPosition` and `rankTrend`. So the chain is column → sort →
position, and only the first link halves.

#### What changes in code

**One read.** `readBalance` in `functions/rewards.js` currently takes its league component from
`leaguePoints26`. It takes it from `leagueEarnedTotal` instead. The rest of that function —
`earnedRsPoints`, `pointsSpent`, the clamp to a non-negative integer — is unchanged.

**Seven writes.** Every site that awards league points increments `leagueEarnedTotal` alongside
the season column, in the same transaction on the same document: competition results, friendly
points, the shared tournament result library, the withdrawal workflow, and the remaining award
paths. Two increments on one document cost nothing extra.

**Nothing on the leaderboard side.** `rankSnapshot` still reads the season column and sorts in
memory, and D8's seeding still reads it at join time. Neither changes. There is no `orderBy` on
league points anywhere in the codebase, so no index work either.

**Rules.** `leagueEarnedTotal` and `lastRolledOverTo` are server-written only, and go into the
same organizer-gated treatment and field allowlist that already protects `leaguePoints26`. A
member must never be able to write their own wallet base.

#### Backfill

At the moment the split lands — before any halving has run — lifetime earned equals the 2026
column, because nothing has been removed yet. So the backfill is
`leagueEarnedTotal = leaguePoints26` for every member, once, with no reconciliation needed.

**This is the reason for the sequencing constraint in §5.** If a halving runs first, the removed
amount is recorded nowhere and lifetime earned becomes unrecoverable — it cannot be reconstructed
from a halved figure. The constraint is not "avoid a migration", it is "avoid destroying the
information the wallet is made of".

#### The annual checklist

Per-year columns mean January work, which is accepted. Each new season needs the column name
added in the rules allowlist, in `readBalance`, in `rankSnapshot`, in D8's seeding query, and in
the four test files that name the field. This wants to be a written procedure rather than
remembered, since missing one silently reads a season as zero.

#### Tests

- The wallet survives a halving: earn 100, roll over, the year's league points are 50 and the
  balance is still 100
- The rollover is idempotent: running it twice leaves the same values as running it once
- A missing `leagueEarnedTotal` reads as zero rather than throwing
- Task points are unchanged by a rollover
- A redemption after a rollover spends against the full wallet, not the halved standing
- Floor rounding: 101 halves to 50

`REWARDS_RULES.md` states the redeemable-balance rule and has to change with this — it currently
says earned league points, which stops being the season column.

---

## 11 · Pending work not in sprints D6–D8

[D6](sprints/SPRINT-D6.md) covers the verification pass, corrections C1–C19 and features F1–F3.
[D7](sprints/SPRINT-D7.md) covers the shared component set. [D8](sprints/SPRINT-D8.md) covers
the seeding engine and the workflow record. Everything below is real work that **no sprint
schedules**.

> **Checked, not assumed.** The terms `location`, `Stripe`, `donation`, `payment`, `staging` and
> `PWA` appear **zero times** across all three sprint documents.

### Blocking the beta

| Work                              | Why it matters                                                                                                                                                                                               | Not scheduled because                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **The `location` column**         | §2 puts it in the data model _before beta_, so expansion is a new value rather than a migration. Deriving it from courts, scoping play to it server-side, and moving providers under Toronto all hang off it | The rulings that introduced it post-date D6–D8 |
| **Staging environment (M5)**      | §4 calls it critical path — shareable URL, seeded snapshot, installs as a PWA                                                                                                                                | BLG0022 is blocked on the tier decision        |
| **A super-admin uid for staging** | The rules pin one literal uid; on a second Auth tenant it matches nobody, so staging has no administrator                                                                                                    | Ruled 2026-08-31                               |
| **Payment gateway (M4)**          | The whole of beta block 4 — Stripe, the "Support the league" button, the payments-and-donors collection, the Contributor Badge, refunds                                                                      | Zero mentions in any sprint                    |
| **Consent sentence + EXIF strip** | Ships with block 1's shared draw, which carries contacts outside the app                                                                                                                                     | Ruled 2026-08-31                               |
| **In-app notification list**      | §3 makes notifications a system responsibility; ruled in-app only for beta                                                                                                                                   | Ruled 2026-08-31                               |
| **`npm run verify` does not run** | M0 is _defined_ as this command passing. Its format gate diffs against `origin/dev-anuj`, which is not on the remote                                                                                         | Pre-existing; predates this session            |

### Beta scope with no sprint row

| Work                             | Notes                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Marketplace**                  | Block 3. D7 touches only its copy defects; the listing-mediated posting work has no row                                  |
| **Tasks and rewards**            | Block 3. No feature row in any sprint                                                                                    |
| **Doubles pool card statistics** | Doubles matches won, P/G won %, partners, availability and nearby tags. D6 F1 builds the pool panel; these stats are new |

### Deferred, with the design already recorded

| Work                                              | State                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **The wallet / league-points split**              | Ruled deferred to an end-of-year milestone; the mechanism is designed in §10.8. **Must land before the first halving**   |
| **Privacy Policy and Terms** (BLG0067)            | Blocked on two facts — the accountable privacy contact and the legal entity name. Lawyer review needed on three sections |
| **Provider contact via a booking connection**     | Design recorded in D6 C12; implementation explicitly out of D8                                                           |
| **The lesson add-on and coaching pool** (BLG0061) | Documented in D8 S5, not built. Five questions still unanswered                                                          |
| **Backup and restore** (BLG0023)                  | Not blocking under emulator-first; becomes blocking the moment a migration points at the live project                    |

### After the beta

| Work                                              | Notes                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **M6 beta operations**                            | Cohort live, WhatsApp triage into live bugs, a real-money donation and refund proven                                                 |
| **M7 production cutover**                         | Backup and restore tested with a real non-production restore, migration evidence, independent reviews                                |
| **M8 winter and money**                           | Partner-bubble listings with off-peak discounts, the winter donation campaign, the season dashboard reporting §6                     |
| **M9 the second location**                        | A Markham or Brampton event creates a live location; location tags on cards and rows                                                 |
| **Email delivery** (BLG0065)                      | Resend is connected after beta and sends the email notifications (ruled, 10.3); domain, DNS, secrets and the allowlist land then     |
| **Mobile app versus PWA, then push** (BLG0020/21) | Blocked on the platform decision                                                                                                     |
| **The annual rollover procedure**                 | Per-year columns mean January work across the rules allowlist, `readBalance`, `rankSnapshot`, D8's seeding query and four test files |
