# Decisions — 2026-08-29

> **Owner rulings on app behaviour, taken to remove confusion across the key journeys.**
> These override anything they contradict. Where a decision reverses an earlier one, the earlier ruling is named.

|                |                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**       | 2026-08-29                                                                                                                                                                                    |
| **Supersedes** | [DECISIONS_BRIEF.md](../archive/planning-2026-08-23/notes/DECISIONS_BRIEF.md) and [HARMONIZATION_REPORT.md](../archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md) where they conflict |
| **Scheduled**  | [D6](sprints/SPRINT-D6.md) · [D7](sprints/SPRINT-D7.md) · [D8](sprints/SPRINT-D8.md)                                                                                                          |
| **Evidence**   | Usage figures from the live snapshot `2026-08-17`, 3,243 documents                                                                                                                            |

**Line numbers are `dev-anuj` @ `ac4dfb1`.** Re-check before editing.

---

## 1 · One result model for all three ways to play

**The problem.** Challenges and rallies each ran their own five-state handshake — `open → accepted → reported → confirmed` — with different words for identical states, and neither matched how a tournament result is entered. Three ways to record the same thing.

> **A rally without a score is not a failure.** Entering a rally score is optional by design — it is a way to earn extra points, and choosing not to is a normal outcome. The change here is that _when_ a player does enter one, it works the same way as everywhere else.

**Ruling.** All three match types use **one result model**, the auto-apply model already ruled for tournaments on 2026-08-23:

| Rule                                                                                                  | Applies to                     |
| ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Either player may submit a score**                                                                  | tournament · challenge · rally |
| **The score applies immediately.** No verification, no confirmation step                              | tournament · challenge · rally |
| **Two submissions, same winner, lower aggregate margin wins**                                         | all three                      |
| **Two submissions, different winners → dispute flag**, first result stays applied, organizer resolves | all three                      |
| **Walkovers are organizer-only and are stored**                                                       | tournaments only               |

**A rally score is optional.** A rally is a way to earn extra points; if neither player submits, nothing is recorded and no points are paid. It is never chased.

**A declined challenge notifies the player who created it.** Decline and reject are the same event — see decision 2.

**Retires:** the `accepted → reported → confirmed` handshake, the organizer confirmation step on challenges, and the rally `disputed` dead end (finding F-K).

---

## 2 · One vocabulary

**The problem measured.** A member sees **"Completed", "Done" and "Score recorded" for the same fixture** ([CS-24](../archive/planning-2026-08-23/ACTION-REPORT.md#CS-24) — four vocabularies in four files). Across domains, one idea had three names each time.

### What a member sees on a match

| Word        | Means                             |
| ----------- | --------------------------------- |
| **Pending** | The match has not been played yet |
| **Done**    | A score has been submitted        |

Two words. Nothing else appears on a match card.

> **CS-24's own proposal is void.** It proposed `Scheduled · Pending · Done · No show`. **`No show` was deleted** (D6/DECISIONS_BRIEF §1) and **`Scheduled` was deleted** (WDR §3 — no dates or times are stored). Only `Pending` and `Done` survive.

### Stored status words — one per idea

| Idea                                | Word            | Retires              |
| ----------------------------------- | --------------- | -------------------- |
| A match result is settled           | **`confirmed`** | `complete`, `used`   |
| An invitation was turned down       | **`declined`**  | `rejected`           |
| A player left a tournament          | **`withdrawn`** | `removal`, `removed` |
| A task or a service job is finished | **`completed`** | —                    |

**There is no app-level `inactive` state** (ruled out 2026-08-29). A player has exactly one state word, `withdrawn`, and it is scoped to a tournament.

> This collapses the "is this participant active?" check, which today tests `!['withdrawn','removed','inactive']` in **two** places — `functions/tournamentResults.js:97` and `functions/connections.js:103`. Both become a single test against `withdrawn`. That is finding **F-B**, where the two lists had already drifted and a withdrawn player stayed scoreable.

`confirmed` is the stored word for a settled match; **Done** is what the member reads. Tasks and service jobs are `completed`, never `confirmed` — a job is finished, a result is agreed.

---

## 3 · The points economy stays

One redemption in the entire dataset, against nine catalogue entries. **Ruling: it is necessary and stays.** The services, providers and bookings work in D6 is confirmed, not trimmed.

---

## 4 · No per-event draw hiding

**Remove `hide_seniors` and `hide_beginners`.** They exist only to hide draw tabs (`useTournament.ts:216-217`).

**A draw already appears only when players in that category join.** Seniors, beginners, and every zone draw are driven by who actually signed up — so an empty category shows nothing without anyone toggling it. The toggles were solving a problem that participation already solves.

**The Retired Pro draw itself survives** — it is a separate, league-gated concept (`useJoin.ts:140-142`), not the toggle. Same for Beginners. What goes is the per-event ability to hide either.

The zone edge cases these guarded were artefacts of tournaments already in flight; **the new event-join workflow removes the zone complexity** that produced them.

---

## 5 · Four event types

**`Socials` · `Tournaments` · `Specials` · `League Ladder`.** Nothing else.

Live data currently holds five values across ten events — including **`tournament` in lower case** alongside `Tournament`. That casing split is a data defect and needs a migration, not just a validator.

Closes [BLG0019](../BACKLOG.md).

---

## 6 · The stats a member sees

### Leaderboard row

**Matches won · P/G won % · rank move · streak** (`2W`, `2L`).

**Streak is derived, not stored** — the same stat the profile page already shows: consecutive wins or losses from the member's most recent completed matches until the run breaks.

> **Profile and PlayerProfile share one card — nothing is re-derived.** The streak is computed twice today, identically (`src/pages/Profile.tsx:152-162` and `src/pages/PlayerProfile.tsx:42-51`), because the two pages are separate 700-line components. [D7 CS-7](sprints/SPRINT-D7.md) collapses them into a single `ProfileCard` with `mode: 'own' | 'public'`; the streak travels with the card and the duplicate disappears on its own. Do not extract a streak helper — fix the card. `tasks.currentStreak` is a bare count with no W/L direction and cannot serve this either way.

### Round Robin group table

**Matches won in that group · overall P/G won % · pending · contact.**

Nothing else is rendered on either surface. Everything else is either derived on demand or not shown.

---

## 7 · Zone change needs no approval

A member **selects their zones freely**. There is no organizer approval step.

**The organizer is notified** of the change. Notified, not asked.

Confirms L15's direction and removes the second path: the tournament page's "Request Zone Change" becomes a direct change like the profile card's.

---

## 8 · Who can see whose contact details

| Viewer                         | Sees                                            | Condition                                                                        |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Any member                     | **Marketplace contacts**                        | Listing-mediated, all members                                                    |
| A member                       | **Another member's contacts**                   | Only through a valid connection — a tournament match, a friendly, or a challenge |
| A player in a coaching session | **That coach's contacts**                       | Mutual — the coach sees the player's too                                         |
| An event organizer             | **Contacts of everyone who joined their event** | Their own events only                                                            |

**New: a Download Draw button** gives the organizer the draw and the participants' contacts in one place. The only existing "Download the draw" control is an error-boundary fallback (`TournamentElements.tsx:65`); this is new UI.

> **This reinstates a contacts reader that D6 C8 removes.** `isCurrentGroupLessonCoachFor` was being deleted with `group_lessons`. The coach↔player rule returns, rebuilt against the **coaching session** (the lesson add-on block), not the retired collection. D6 C8 must be amended so the predicate is replaced rather than dropped.

---

## 9 · Conflicts closed

| Conflict                                                     | Ruling                                                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pointswon` / `totalPointsPlayed` — L14 removed, D6 restored | **Keep.** Stored.                                                                                                                                   |
| `rankPosition` — DC-11 deleted it as "rendered nowhere"      | **Keep.** DC-11's premise was wrong; it is read in three files.                                                                                     |
| Seeding — R-4 removed it                                     | **Reinstated.** See [D8](sprints/SPRINT-D8.md).                                                                                                     |
| `selectGroupWinners`                                         | **Delete it.** The seeding system replaces it — D8 builds `seeding.ts` fresh rather than reviving the stub. D6 C7 deletes it as originally written. |
| `walkover` vs `is_walkover`                                  | **`walkover`, stored, organizer-submitted only.**                                                                                                   |
| Match margin threshold                                       | **Above 21 requires a margin of exactly 2** (was 10).                                                                                               |
| Seed counts                                                  | Draw 4 → 2 · 8 → 4 · 16 → 8 · 32 → 10                                                                                                               |
| Seed ties                                                    | Alphabetical. Joining early earns nothing.                                                                                                          |
| Round Robin group formation                                  | **Unchanged** — zone, then skill, then courts. Seeding is knockout-only.                                                                            |

---

## 10 · What this removes from the app

| Gone                                     | Was                                             |
| ---------------------------------------- | ----------------------------------------------- |
| The accept → report → confirm handshake  | 5 states on challenges and rallies              |
| Rally `disputed`                         | a dead end with no exit                         |
| `rejected`                               | duplicate of `declined`                         |
| `complete`, `used`                       | duplicates of `confirmed`                       |
| `removal`, `removed`                     | duplicates of `withdrawn`                       |
| `Scheduled`, `No show`, `Score recorded` | display words for states that no longer exist   |
| `hide_seniors`, `hide_beginners`         | per-event draw hiding                           |
| A fifth event type                       | the lower-case `tournament`                     |
| Organizer approval for a zone change     | replaced by a notification                      |
| `selectGroupWinners`                     | replaced by the seeding engine                  |
| `inactive`                               | a third player state; only `withdrawn` survives |
| Points for an unplayed rally             | a rally with no submitted score pays nothing    |

---

## 11 · One name formatter

**Ruling: one helper, producing `Blake Bell`. Keep only it.**

**The problem measured.** There are **three** formatters, not two:

| Function           | Where                                     | Does                                             |
| ------------------ | ----------------------------------------- | ------------------------------------------------ |
| `formatPersonName` | `src/components/PersonRow.tsx:4`          | **trim and fall back only — no casing**          |
| `toTitleCase`      | `src/features/leagues/useStandings.ts:18` | title-cases                                      |
| `formatPlayerName` | `src/pages/tournament/utils.ts:155`       | title-cases **and** guards the bracket sentinels |

Building `PersonRow` did not merge the two, it **added a third under the name the fix was supposed to take**. [CS-1](../archive/planning-2026-08-23/ACTION-REPORT.md#CS-1) reads as done and is not.

**This is live.** 6 of 185 members have all-lowercase names (`blake bell`, `sergio trujillo`) and 2 are ALL-CAPS. They render **`blake bell` on every `PersonRow` surface** and **`Blake Bell` on the leaderboard** — one member, two spellings, depending on the screen.

**The merge has a trap.** Only `formatPlayerName` guards `PLAYER_LOADING`, `BYE` and `Winner of …`. A naive title-caser renders **`Bye`** and **`Winner Of Qf1`** in the bracket. The surviving helper must keep those guards.

**Build.** `formatPersonName` title-cases, keeps the fallback, and keeps the sentinel guards. `toTitleCase` and `formatPlayerName` are deleted and every call site moves.

## 12 · Delete the duplicate helpers

Two more helpers already exist and are still duplicated. **Do not extract anything — point the call sites at what is there.**

| Helper      | Exists at            | Duplicated in                                   | Cleared by  |
| ----------- | -------------------- | ----------------------------------------------- | ----------- |
| `pgWinPct`  | `useStandings.ts:13` | `Profile.tsx:168` recomputes inline             | ruling 13   |
| `initialOf` | `PersonRow.tsx:5`    | `ProfileInfo.tsx:313` · `PlayerProfile.tsx:196` | ruling 13   |
| `initialOf` | —                    | `ServicesElements.tsx:595`                      | its own row |

Three of the four disappear with the profile-card consolidation. Only `ServicesElements.tsx:595` needs separate work.

## 13 · One profile card

**Ruling: one profile card. Only one.**

[CS-7](../archive/planning-2026-08-23/ACTION-REPORT.md#CS-7) says "two 700-line components". There are **three, totalling 2,021 lines**:

| File                                              | Lines | Role             |
| ------------------------------------------------- | ----- | ---------------- |
| `src/pages/Profile.tsx`                           | 651   | own-profile page |
| `src/features/profile/components/ProfileInfo.tsx` | 983   | own-profile card |
| `src/pages/PlayerProfile.tsx`                     | 387   | public profile   |

The duplications land on **different pairs** — the streak is `Profile` vs `PlayerProfile`; the `Phone` (`ProfileInfo:393`) versus `Contact` (`PlayerProfile:256`) label drift is the other pair. Consolidating only the two CS-7 names moves the duplication rather than ending it. **All three collapse into one card with `mode: 'own' | 'public'`.**

The streak, P/G won % and initial duplications all end here, for free.

## 14 · No browser dialogs, no native dropdowns

**Every browser `confirm()` becomes a modal form with yes and no.** There are **five**, not the four [MF-10](../archive/planning-2026-08-23/ACTION-REPORT.md#MF-10) records:

`MarketplaceElements.tsx:114` · `ServicesElements.tsx:792` · `MatchCard.tsx:100` · `RRGroupCard.tsx:213` · `Tournament.tsx:535`

> **Sequence after the withdrawal work.** `Tournament.tsx:535` is the withdrawal confirm, which the L12 work rewrites. Doing MF-10 first means writing that dialog twice.

**Every dropdown becomes a modal form.** 14 native `<select>` elements across 9 files: `RRGroupCard` (3) · `TournamentElements` (2) · `CourtMapElements` (2) · `EventsElements` (2) · `MatchCard` · `AddPlayerPanel` · `ServicesElements` · `MarketplaceElements` · `ClaimModal`.

This also closes [AX-13](../archive/planning-2026-08-23/ACTION-REPORT.md#AX-13) — nine unlabelled selects — since a modal carries its own heading.

## 15 · Withdrawal payout

**Ruling: a withdrawing player is paid for every unplayed match, and none of it counts toward matches played.**

| Stage           | The withdrawing player gets                                 |
| --------------- | ----------------------------------------------------------- |
| **Knockout**    | **the round's points** — R32 1 · R16 2 · QF 3 · SF 5 · F 10 |
| **Round Robin** | **1 point** per unplayed match                              |

This is what the app already does (`functions/withdrawalWorkflow.js:72`), so the payout itself does not change. The opponent side is unchanged too: in a Round Robin they take their 1 point, in a knockout they advance.

**The scoring table is still needed**, so [D6 C5](sprints/SPRINT-D6.md) stands as written — the withdrawal path stops keeping its own private copy and imports the shared one, which already returns the round award for a knockout and 1 for a Round Robin.

**Not counted as matches played.** This already holds: the withdrawal writes match documents directly rather than going through the result callable, so it never touches `matchesPlayed` or `wins`. **It needs a test to stay true** — if this is ever routed through the result path, withdrawals would silently start inflating everyone's match count.
