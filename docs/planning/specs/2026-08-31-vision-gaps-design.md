# Vision gaps — rulings of 2026-08-31

> Output of a brainstorming session over [VISION.md](../VISION.md), run after the Q1–Q22
> grilling. Seven gaps were found in what the vision does **not** say; all seven now carry an
> owner ruling. This document records the rulings, what each one costs against code that
> already exists, and which file each one has to reach.

|             |                                                                                   |
| ----------- | --------------------------------------------------------------------------------- |
| **Date**    | 2026-08-31                                                                        |
| **Source**  | Brainstorming session over VISION.md; all seven rulings are the owner's           |
| **Status**  | Awaiting owner review. Nothing here is implemented                                |
| **Related** | [VISION.md](../VISION.md) · [DECISIONS-2026-08-29.md](../DECISIONS-2026-08-29.md) |

---

## Why this document exists

The vision is internally consistent and well-evidenced. Every gap below is something it does
not mention at all, rather than something it gets wrong.

One of the seven had been decided before and never written down. The league-points halving was
recorded in no planning document — the only season reference in the whole vision is a glossary
line about donation campaigns. That is the argument for this file: a ruling that lives only in
a conversation is a ruling that gets made twice.

---

## 1 · Doubles

**Ruling.** Doubles is not a gap and needs no separate treatment. A doubles result pays through
the same one result model as everything else and moves the same global ranking. There is no
separate doubles points system.

**The only doubles-specific thing** is presentational: inside the doubles pool, each player row
card carries doubles-only statistics.

**Ruling — what the doubles pool card carries.** Five things: doubles matches won, P/G won %,
partners numbered 1, 2, 3… where a member has played with several, an availability tag, and a
nearby tag.

**Why this surface needed its own ruling.** Ruling 6 of the decisions register fixes exactly
what the leaderboard row and the Round Robin group table show and states that nothing else
renders on either. The doubles pool card is a third surface it does not cover, so nothing
previously said what belongs on it.

**How it sits against the readability rule.** The two numbers are doubles matches won and
P/G won %, which is exactly the budget D7 allows beside a name at 360px. Partners and the two
tags are not numbers, so they do not spend that budget — but they do spend width. On a 360px
row the workable split is the two numbers plus one tag inline, with the partner list and the
second tag in the expanded drawer. That is a D7 layout decision, not a further ruling.

---

## 2 · The staging seed

**The gap.** §4 seeds staging from the migrated live snapshot. That snapshot is 3,243 documents
covering 185 real members with their names, emails and phone numbers, and staging is a separate
project with a shareable public URL. The beta cohort are themselves league members, so they are
not strangers — but the other ~165 people are in that data and were never asked.

**Ruling.** Real data with contacts scrubbed. Real names, matches, events and standings are
kept, so draws and leaderboards look and behave correctly. Every email and phone is replaced
with a synthetic value before the seed reaches staging.

**What it costs.** One pass over the seeding script.

**Consequence to handle.** Block 2 ships a draw that carries participant contacts out of the
app. With every contact scrubbed, that feature cannot be exercised end to end on staging. The
fix is to let the 10–20 cohort members set their own real contact details on staging after
seeding, so the feature is proven by the people who agreed to be there.

---

## 3 · Notifications

**The gap.** §3 makes notifications a system responsibility, organizers are notified on zone
changes, and a declined challenge notifies its creator — but no delivery channel was ever
chosen, and both candidates sit on blocked backlog rows: BLG0065 for email delivery, DNS and
secrets, BLG0020/21 for PWA versus native and push.

**Ruling.** In-app only for the September beta. Nothing is sent outside the app.

**What it buys.** Neither blocked row enters the critical path three weeks out. No DNS, no
sending domain, no secrets, no delivery allowlist. A 10–20 person cohort can also be reached
directly.

**Not decided here.** What happens after beta. Email and push remain open questions on their
existing backlog rows.

---

## 4 · Consent

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

## 5 · League points at the year boundary

**The gap.** §8 defines a season as summer and winter halves with their own donation campaigns.
§1 has one global ranking. Nothing said what happens to points at a boundary. The rule below
had been agreed previously and appears in no document.

**Ruling.** At the end of the year, that season's league points halve — league26's 100 becomes
league27's 50. Task points are untouched.

**Ruling.** The halving applies to **ranking only**. The member's spendable balance carries
forward whole.

### What this costs, and it is the largest item in this document

**The wallet and the ranking are the same number today.** `functions/rewards.js` computes a
member's redeemable balance as `leaguePoints26` plus earned task points minus points already
spent. The same rule is written down in [REWARDS_RULES.md](../../domain/REWARDS_RULES.md).
League points are therefore not only a ranking currency — they are half of the member's wallet.
Halving them would halve unspent purchasing power, which the ruling explicitly forbids.

So earned league points have to be separated from ranking league points.

**Ruling — the split is deferred.** It goes to the backlog as a future milestone timed to the
end of the year, not before beta. The recommendation had been to land it before beta, by the
same reasoning §2 applies to the `location` column — put the field in before the data grows, so
the change is a new value rather than a migration. Deferring means it arrives instead as a
backfill over live member data. That is accepted.

**The one constraint the deferral creates.** The split must land **before the first halving
runs**. If the halving runs while the wallet and the ranking are still the same field, it takes
unspent purchasing power down with the ranking — which is the thing the ranking-only ruling
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

## 6 · Super-admin identity

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

## 7 · Running the beta

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

## 8 · The wallet split — design

Ruling 5 defers this to an end-of-year milestone. The mechanism is settled here so the work can
start without re-deciding it.

### What the owner specified

Total points = 2026 points + 2026 carry-forward + 2027 season points + task points − 2026
carry-forward. The carry-forward is added into the season's standing and subtracted again from
the total, so it cancels: **the wallet keeps everything ever earned, and only the ranking
halves.** Ranking is a stored value, never computed, and each year gets its own column.

### Two stored counters

| Field                           | Holds                                                | Written by                     | Halved? |
| ------------------------------- | ---------------------------------------------------- | ------------------------------ | ------- |
| `stats/{uid}.leaguePoints{YY}`  | That season's standing — the **ranking** number      | Match awards, and the rollover | Yes     |
| `stats/{uid}.leagueEarnedTotal` | Every league point ever earned — the **wallet** base | Match awards only              | Never   |

Both are stored. Neither ranking nor the wallet base is derived, which is what the owner asked
for. Task points are untouched and already live apart, in `tasks/{uid}` — `earnedRsPoints` sums
setup, tiers and bonus there and never reads `stats`.

### The rollover, once a year

On 1 January, per member, in one transaction:

- `leaguePoints{new} = floor(leaguePoints{prev} / 2)` — seeds the new season's standing with the
  carry-forward
- `leagueEarnedTotal` — untouched
- `lastRolledOverTo = {new year}` — the idempotency marker

**Floor, not round**, so a halving never inflates: 101 becomes 50, not 51.

**Idempotency** is per member rather than one job-level flag, so a run that fails half way can be
resumed without halving the first half twice. The transaction reads `lastRolledOverTo` and exits
if it already names the target year.

### Worked example

A member earning 100 in 2026 and 40 in 2027, spending nothing:

| Moment            | `leaguePoints26` | `leaguePoints27` | `leagueEarnedTotal` | Ranking | Wallet |
| ----------------- | ---------------- | ---------------- | ------------------- | ------- | ------ |
| End of 2026       | 100              | —                | 100                 | 100     | 100    |
| After rollover    | 100              | 50               | 100                 | 50      | 100    |
| After 2027 season | 100              | 90               | 140                 | 90      | 140    |

The ranking halves and rebuilds; the wallet only ever grows.

### What changes in code

**One read.** `readBalance` in `functions/rewards.js` currently takes its league component from
`leaguePoints26`. It takes it from `leagueEarnedTotal` instead. The rest of that function —
`earnedRsPoints`, `pointsSpent`, the clamp to a non-negative integer — is unchanged.

**Seven writes.** Every site that awards league points increments `leagueEarnedTotal` alongside
the season column, in the same transaction on the same document: competition results, friendly
points, the shared tournament result library, the withdrawal workflow, and the remaining award
paths. Two increments on one document cost nothing extra.

**Nothing on the ranking side.** `rankSnapshot` still reads the season column and sorts in
memory, and D8's seeding still reads it at join time. Neither changes. There is no `orderBy` on
league points anywhere in the codebase, so no index work either.

**Rules.** `leagueEarnedTotal` and `lastRolledOverTo` are server-written only, and go into the
same organizer-gated treatment and field allowlist that already protects `leaguePoints26`. A
member must never be able to write their own wallet base.

### Backfill

At the moment the split lands — before any halving has run — lifetime earned equals the 2026
column, because nothing has been removed yet. So the backfill is
`leagueEarnedTotal = leaguePoints26` for every member, once, with no reconciliation needed.

**This is the reason for the sequencing constraint in §5.** If a halving runs first, the removed
amount is recorded nowhere and lifetime earned becomes unrecoverable — it cannot be reconstructed
from a halved figure. The constraint is not "avoid a migration", it is "avoid destroying the
information the wallet is made of".

### The annual checklist

Per-year columns mean January work, which is accepted. Each new season needs the column name
added in the rules allowlist, in `readBalance`, in `rankSnapshot`, in D8's seeding query, and in
the four test files that name the field. This wants to be a written procedure rather than
remembered, since missing one silently reads a season as zero.

### Tests

- The wallet survives a halving: earn 100, roll over, ranking is 50 and the balance is still 100
- The rollover is idempotent: running it twice leaves the same values as running it once
- A missing `leagueEarnedTotal` reads as zero rather than throwing
- Task points are unchanged by a rollover
- A redemption after a rollover spends against the full wallet, not the halved standing
- Floor rounding: 101 halves to 50

`REWARDS_RULES.md` states the redeemable-balance rule and has to change with this — it currently
says earned league points, which stops being the season column.

---

## Where each ruling has to be recorded

Three of these belong in files that already exist and currently contradict them.

| Ruling                           | Lands in                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Halving; ranking-only scope      | Decisions register as a new ruling, **and** `docs/domain/REWARDS_RULES.md`, whose redeemable-balance rule is what the ruling changes |
| Wallet / ranking point split     | BACKLOG.md as an end-of-year milestone per §5; the mechanism is designed in §8                                                       |
| Staging seed scrubbing           | VISION.md §4, which currently says the snapshot seeds staging unqualified                                                            |
| Consent sentence; EXIF stripping | VISION.md §9, replacing the "recommended, not ruled" note                                                                            |
| Notifications in-app for beta    | VISION.md §4 beta scope                                                                                                              |
| Super-admin stays hardcoded      | Decisions register, with the staging-uid requirement attached                                                                        |
| WhatsApp support; live-bug log   | VISION.md §4, alongside the cohort description                                                                                       |
| Doubles pays through one model   | VISION.md §8 glossary, under Rally / one result model                                                                                |
| Doubles pool card statistics     | D7 sprint board, as a row on the partner pool panel                                                                                  |

---

## Open items

None. Every gap raised in this session now carries a ruling.

**Closed since the session opened.** The doubles pool card statistics are ruled in §1. The
abort-criteria question is ruled in §7 — the beta carries on and issues are logged as live bugs.
The wallet and ranking split is ruled deferred in §5, and its mechanism is now designed in §8,
so the end-of-year milestone can start without re-deciding anything.

**The one thing that is sequenced, not open.** The split in §8 must land before the first
halving runs. Both are due at the same year boundary and the order is fixed.
