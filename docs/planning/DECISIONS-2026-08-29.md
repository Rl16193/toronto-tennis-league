# Decisions — 2026-08-29

> **Owner rulings on app behaviour, taken to remove confusion across the key journeys.**
> These override anything they contradict. Where a decision reverses an earlier one, the earlier ruling is named.

|                |                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**       | 2026-08-29                                                                                                                                                                                    |
| **Supersedes** | [DECISIONS_BRIEF.md](../archive/planning-2026-08-23/notes/DECISIONS_BRIEF.md) and [HARMONIZATION_REPORT.md](../archive/planning-2026-08-23/notes/HARMONIZATION_REPORT.md) where they conflict |
| **Scheduled**  | [D6](sprints/SPRINT-D6.md) · [D7](sprints/SPRINT-D7.md) · [D8](sprints/SPRINT-D8.md)                                                                                                          |
| **Evidence**   | Usage figures from the live snapshot `2026-08-17`, 3,243 documents                                                                                                                            |

---

## 1 · One result model for all three ways to play

**The problem measured.** Rally: 43 opened, **0 ever reached a result**. Challenge: 31 opened, 5 completed (16%). Both ran a five-state handshake — `open → accepted → reported → confirmed` — with different words for identical states.

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

> That derivation already exists **twice**, identically: `src/pages/Profile.tsx:152-162` and `src/pages/PlayerProfile.tsx:42-51`. The leaderboard would be a third copy. **Extract it to one helper and have all three read it** — this is the same class of defect as the three award tables. `tasks.currentStreak` is a bare count with no W/L direction and cannot serve this.

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
