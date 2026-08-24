# Decisions brief — walkovers, zones, bookings, access, withdrawal

| | |
| --- | --- |
| **Date** | 2026-08-21 |
| **Scope** | All product decisions: the six behaviour changes of this round (sections 1–6) and the standing product decisions PD1–PD10. Remodel corrections live in `HARMONIZATION_REPORT.md`; branch code conflicts in `DEV_ANUJ_CONFLICTS.md`. |
| **Code links** | Permalinks to `dev-anuj` `3f40773`. |

> **Amendment — 2026-08-23 · results auto-apply on submission.** Owner ruling, affecting every
> section below that assumes an organizer approval step. A submitted result **applies immediately**;
> both players are notified (winner *"Win recorded — {score}"*, loser *"Score recorded — {score}"*).
> Two submissions with the **same winner but different scores** resolve to the one with the
> **smaller aggregate winning margin** — `7-0, 7-0` (14) against `7-2, 7-4` (8) records `7-2, 7-4`;
> tie → first submission stands. Only **different winners** flag for review, and the first submitted
> result stays applied and displayed until the organizer resolves it. Applies to tournaments,
> ladder challenges and friendlies alike. **Walkovers remain organizer-only.** Supersedes
> `HARMONIZATION_REPORT.md` D4. Authoritative text: `docs/PROJECT-PLAN.md` §2.

## 1. Walkovers only — no-show removed

- The no-show concept is removed. The only non-played result is a **walkover**: scores `0-0, 0-0, 0-0` with a winner.
- Walkovers exist in **tournaments only**. Ladder and friendly results must be real scores; the validators reject all-zero results there.
- Payout: in a **Round Robin group a walkover pays 1 point to each player** (it is not a played result). In a **knockout** the winner advances and the eliminated player collects that round's award.
- **A no-show is not a walkover.** If one player fails to appear for a scheduled match, the organizer records a real **6-0** score for the player who showed up, paid as a normal result. The walkover covers a match neither player played.
- Model: `no_show` is removed from matches. `is_walkover` is not stored — it is derivable (all-zero scores + winner).
- Removed with it: the organizer's "Count As No Show" control, the no-show branch of the points logic, and the `is_walkover` cross-check in the result callable (the defect logged against it is moot).

## 2. Zone at join

- A member with **no court preferences** who clicks Join gets a court dropdown modal titled **"Enter A Zone"**. The join completes only after courts are chosen; the chosen courts set `preferred_zone`; the server placer then seats them within their zone's draws.
- **Custom court entries** (a court that resolves to no zone): notify the super-admin and the event organizer. A manual check verifies where the court is, its details are added to the courts map, and the zone resolves from there. Assumption: map additions ship as data updates to the courts dataset; a runtime-editable map is future work.
- Outcome: nobody is defaulted to Downtown-Midtown silently. Today the code defaults a zone-less member there at placement, and the organizer only sees "No zone" in the Unplaced list.

## 3. Bookings lifecycle (stringing)

- Statuses: **`lead → in_progress → completed`**, plus **`cancelled`** (reachable from `lead` only).
- A lead is created when the player books the service. Under the same stringer in Services the player gets **"Racquet dropped"** → `in_progress`.
- The stringer sees **"Completed"** on in-progress jobs. Clicking it notifies the player — *"Got your racquet back?"* — with a yes/no form. **Yes** → `completed`. **No** → stays `in_progress`, the stringer sees "Completed" again, and the super-admin is notified *"Name (Player) cancelled job completion"*. No fourth status: while waiting, the booking carries a `completion_requested_at` stamp.
- **Cancel before drop-off:** the player cancels a lead → `cancelled`, points refunded.
- The old `flagged` / `cancel_requested` review states are removed.

## 4. Contact and profile access

- Contact details are readable in-app by exactly two parties: **the event organizer, for members signed up to their event** (participant-join connections), and **opponents through connections**. Nobody else — the super-admin's in-app access to other members' profiles and contacts is removed. The owner's full-data access is the database export.
- Admin functions (review queues, notifications) are unchanged; only profile viewing is removed.
- Members can open the profiles of people in their tournament or group from the Profiles page; a link from the tournament display is future work.

## 5. Withdrawal

- **Member:** a joined event shows a **Withdraw** button. Before draws exist, withdrawing leaves the roster. After draws exist: warning *"You lose all matches — opponents get walkovers"* → confirm → every unplayed match becomes a walkover (Round Robin: 1 point each; knockout: opponent advances). Played matches stay as played. Permanent from the member's side. The organizer is notified *"Name withdraws from [tournament] [division]"*.
- **Organizer:** a **Reset** control replaces the delete bin; an **orange !** button next to it opens the withdrawal form (reason: injury, unavailable, cannot contact, other) and writes `status: withdrawn` + the note. Withdrawn players stay in Unplaced and are never auto-seated.
- **Re-add** after a mistaken withdrawal is allowed. Applied walkovers are not auto-reversed — the organizer corrects each affected match with a normal rescore.

## 6. Scheduling

- Confirmed: no dates or times are stored. The date-bearing scheduled-match indexes retire with the scheduling fields.

## Where it lands

| Item | Code touched |
| --- | --- |
| 1 Walkovers only | [`functions/lib/tournamentResult.js`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/functions/lib/tournamentResult.js) (drop the no-show branch and the `is_walkover` input; all-zero + winner = walkover) · [`functions/tournamentResults.js`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/functions/tournamentResults.js) (remove the `is_walkover` check in `submissionMatchesResult`) · [`src/pages/tournament/ScoreModal.tsx`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/src/pages/tournament/ScoreModal.tsx) (remove the no-show checkbox) · [`src/features/tournament/domain/scoring.ts`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/src/features/tournament/domain/scoring.ts) (no-show award path) |
| 2 Zone at join | [`src/features/events/hooks/useJoin.ts`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/src/features/events/hooks/useJoin.ts) (gate on missing courts → modal) · [`src/features/events/EventsElements.tsx`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/src/features/events/EventsElements.tsx) (join sheet) · new placer function on participant-create · new unmapped-court notification in `functions/notifications.js` |
| 3 Bookings | [`functions/rewards.js`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/functions/rewards.js) (callables: book, racquet-dropped, request-completion, confirm yes/no, cancel-lead) · [`functions/lib/redemptionState.js`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/functions/lib/redemptionState.js) (transition table → new lifecycle) · [`src/pages/services/ServicesElements.tsx`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/src/pages/services/ServicesElements.tsx) (buttons, provider view) |
| 4 Access | [`firestore.rules#L183`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/firestore.rules#L183) (contacts read: owner, connection — super-admin removed) · [`functions/connections.js`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/functions/connections.js) (participant-join organizer trigger) · [`src/pages/PlayerProfile.tsx`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/src/pages/PlayerProfile.tsx) |
| 5 Withdrawal | [`src/features/events/hooks/useJoin.ts`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/src/features/events/hooks/useJoin.ts) (member withdraw) · [`src/pages/tournament/useTournament.ts`](https://github.com/tbtctennis/Racquets-And-Strings/blob/3f40773/src/pages/tournament/useTournament.ts) (Reset / withdrawal form; removal no longer purges) · server withdrawal operation applying walkovers through the result path · `functions/notifications.js` (organizer notification) |

## Product decisions (standing)

| # | Decision |
| - | --- |
| PD1 | **Public-field contract.** Every collection is publicly readable except `contacts` and `mailing_list`. `preferences` is public (role and provider fields move to `providers`). `tasks/{uid}` stays public — no UI exposes another member's task list; task points must be readable by all. `site_stats` is public. Only `points_spent` is stored; totals and balances are derived at read. |
| PD2 | **Group lessons** are an add-on block on an upcoming or ongoing social event; the `group_lessons` collection and its join/leave callables retire. |
| PD3 | **Profiles.** Members can view the profiles of people in their tournament or group from the Profiles page; a link from the tournament display is future work. |
| PD4 | **Organizer-assignment UI** is built once the organizer view / `providers` collection exists. |
| PD5 | **Admin bootstrap/recovery.** The admin `providers` row is issued and re-issued only by an Admin-SDK script run with the service account; no in-app path. |
| PD6 | **`event_creator`** global privilege is removed at the `providers` cutover and moves to the organizer/admin roles. |
| PD7 | **Staging tier** — deferred; to be decided later. |
| PD8 | **Backup and restore policy** — required before the first destructive data pass; details to be agreed later. |
| PD9 | **Mobile.** A mobile app is preferred; a PWA if the effort is too high — decided after an estimate. Notifications (in-app / push) are the primary update channel, to reduce email. Offline: none — every action is online-only. |
| PD10 | **Group-award storage** is kept: one `awards` document per award with the winners' receipt. |

## Future works (UI)

- "Enter A Zone" join modal; unmapped-court notification and verification flow; runtime-editable courts map.
- Services: "Racquet dropped" and "Completed" buttons, the "Got your racquet back?" yes/no form, lead cancellation.
- Withdraw button (member); Reset control and the orange ! withdrawal-form button (organizer); withdrawal notification.
- Tournament-display link to co-member profiles; organizer overview contact button; bracket-image contact column.
- Organizer-assignment UI (after the providers collection).
- Mobile app vs PWA decision; push notifications as the primary update channel.
- Staging tier and the backup/restore policy details (PD7, PD8 — deferred by the owner).
