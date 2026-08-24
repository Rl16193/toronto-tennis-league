# Sprint D4 — Thursday 27 August 2026

> **Data remodel P2a, zones, withdrawal, placement, and the organizer-controlled knockout.**
> The heaviest data day. Everything here writes to production shape.

| | |
| --- | --- |
| **Branch base** | Sprint D3 merge |
| **Blocking** | A2 lands every field **before 11:00**; A1's whitelists follow; A3 and A4 build on both |
| **Data safety** | **PD8 is deferred with no commitment.** Monday's export is the only rollback point. Every migration `--dry-run` first, diff in the report, then apply |
| **Ship** | Functions → rules → hosting |

---

## Board

| Lane | Tasks | Rows |
| --- | --: | --- |
| **A2 Data** | 9 | L1, L5, L6, L7, L12, L15, L16, L17, L18 |
| **A1 Rules + Functions** | 6 | whitelists, D5 placer, withdrawal walkovers, `onZoneChanged`, unmapped-court notice, P3 scheduling removal |
| **A3 Client / Dev** | 9 | F7, F8, F9, F10, F11, LB-17, LB-18, KO-1, KO-2, R-4 draw controls |
| **A4 UI/UX** | 6 | Enter A Zone, Withdraw, Reset + orange **!**, partner pool, Away pill, unplaced list |
| **A5 Verify** | 4 | dry-run diffs, rules matrix, journeys 1/4/5, gate |

---

## The three rules that govern this whole day

1. **A zone change never unseats anyone.** Existing matches are untouched — the player keeps playing every one of them. The new zone only decides draws not yet generated, and the player is *added* to the new zone's draw, so a player may sit in two or more groups.
2. **Nobody is ever seated automatically except by the one server placer.** Two auto-placers used to fight over this and were deleted: an in-browser effect that topped up any group under 5 ignoring band and zone, and only ran while an organizer happened to have that draw open; and a nightly Admin script applying a *different* rule. Whichever fired first won, so a player's group depended on whether a browser tab was open. **Do not reintroduce either.**
3. **Removal is gone; withdrawal replaces it.** A withdrawn player stays registered, stays in Unplaced, and is never auto-seated.

---

## A2 · Data — `dev-data`

Land these first. Everything else today waits on them.

### ⬛ L15 — Per-event zone on the participant row

An organizer-set `zone` on `event_participants`, **marked manual**. The profile zone is untouched.

**`req_zone_change` / `new_zone` are kept** (owner ruling). Behaviour:

| When | What happens |
| --- | --- |
| Before matches are generated | The player moves freely. `preferred_zone` alone routes them |
| After matches are generated | The organizer is notified. The player sits in **both** zone draws until the organizer resolves it — **displace**, **add to both draws** (*default*), or **cancel** |

`zone_change_requested` / `zone_change_requested_at` are legacy and **no longer written** — read-only, for rows raised before the rename. Writing both was masking a real defect: the rules' player-write whitelist listed only the legacy pair, so `hasOnly()` rejected the whole update and **a player could not request a zone change at all.**

### ⬛ L5 — `preferred_zone_manual`

A hand-picked zone sets this flag, which stops a later court edit silently recomputing `preferred_zone` and moving the player between draws.

### ⬛ L12 — Withdrawal

One `status` field replaces the removal flag, the RR withdrawn list, and the functions' active checks.

```jsonc
// event_participants/{id}
{ "status": "active" | "withdrawn",
  "withdrawn_reason": "injury" | "unavailable" | "cannot_contact" | "other",
  "withdrawn_note": "…",
  "withdrawn_at": "…",
  "withdrawn_by": "self" | "<organizer_uid>" }
```

**S3 applies:** the participant check reads `status`, and **no withdrawn data exists**, so this is code only — no backfill.

Re-add after a mistaken withdrawal is allowed. Applied walkovers are **not** auto-reversed; the organizer corrects each affected match with a normal rescore.

### ⬛ L18 — Doubles partner shape and the partner pool

| Case | Shape |
| --- | --- |
| Partner is on the app | `partner_uid`. The server creates the partner's own participant row. Partner uids sit on the match doc, so a partner can read the opponents' contacts and submit scores |
| Partner is not on the app | `partner_name` only, no uid |
| **No partner yet** | The player joins the event's **partner pool** |

Pool rules: pool members are the dropdown other players pick from — **not** every player on the app. A pool member is **notified when someone new joins**. Selecting a partner **removes both** from the pool. One `setDoublesPartner` writes either shape.

### ⬛ L1 · LB-44 — The ladder is a permanent event

Fixed id `events/ladder`. Challenges keep `event_id` (**D2**). `league` still derives from `stats.league`.

### ⬛ L6 — Drop `profile_details_visible`

It hid only the League pill, which is public on both leaderboards. Delete the field and both consumers.

### ⬛ L16 — `available_to_play`

Member toggle on `preferences`. Off shows an **Away** pill on challenge and rally cards.

### ⬛ L7 — `zone_draw_config` persisted

`{ enabled, buckets: [{ id, label, zones[] }], includeUnassigned, merges }` on `events`. Both `zones` (coverage) and `zone_draw_config` (draw bucketing) stay; **every bucket zone must appear in `zones`**. Skill merges persist here rather than being re-inferred each render.

### ⬛ L17 — Round deadlines

Keyed by **draw and round**. They **exclude the Round Robin group stage** — it runs the season. RR **knockout** rounds carry deadlines. Retire the date-bearing scheduled-match indexes in `firestore.indexes.json`.

### ⬛ L14 follow-through

`pointswon` / `totalPointsPlayed` were stripped Monday. Confirm nothing reintroduced them.

**A2 verification** · every migration `--dry-run` with the diff in the report · `npm test` · `R6` still holds: all 204 `stats` docs satisfy `loses = matchesPlayed − wins`

---

## A1 · Rules + Functions — `rules-functions`

### ⬛ Whitelists for every field above

`hasOnly()`, never `!hasAny()`. **Union whitelists during the deploy** — old names and new both permitted — so the middle of a deploy is never a denied write. Strip legacy names only after functions **and** hosting are out.

`S4`: `isCreatorOfEvent()` is stale. `creator_id` is read by `isManagerOfEvent`, `isOwnerOfEvent`, the events rules pins, `isEventOrganizer` and `onScheduleRequested` — rename the fan-out, do not leave two names.

### ⬛ D5 — One server-side placer, on participant-create

| State of the draw | Placement |
| --- | --- |
| Generated | Seat into an open `PLAYER_LOADING` slot or an RR group **within their zone** |
| Not generated | Zone-assigned at join; `preferred_zone` routes them when it is generated |
| Organizer-removed / withdrawn | **Never re-seated.** They stay in Unplaced |

**Groups are capped at 5** (`RR_GROUP_MAX`). The placer respects the cap; `overGroupCap` guards the manual paths.

**Delete the late-join client placer.** A3 owns that half; coordinate so both land together.

### ⬛ Withdrawal walkovers, through the result path

The server withdrawal operation applies walkovers by calling the **same result path** as a normal score. Do not write match documents directly — that is how the writer and the display drifted before.

| Stage | Unplayed match becomes | Payout |
| --- | --- | --- |
| RR group | walkover | **1 to each player** |
| Knockout | walkover | opponent advances; the withdrawing player collects that round's award (R32 **1** · R16 **2** · QF **3** · SF **5** · F **10**) |

**Played matches stay as played.** Notices go to the organizer, the member, and every affected opponent.

### ⬛ `onZoneChanged` — the both-draws default

Three cases; the trigger exists for the first only:

1. **Seated, and the new zone already has a generated draw they would belong to** → nothing automatic. Notify the organizer; the player appears in Unplaced for the new zone **and sits in both draws** until the organizer picks displace / add-to-both (default) / cancel.
2. **New zone has no draw yet** → silent. `preferred_zone` routes them when it is generated, alongside the draw they are already playing.
3. **Not in a tournament, or nothing generated** → silent.

**No auto-seating and no removal in any case.**

Needs `firebase deploy --only functions:onZoneChanged`.

### ⬛ Unmapped-court notification

A custom court entry that resolves to no zone notifies the **super-admin and the event organizer**. A human verifies where it is and adds it to the courts dataset; the zone resolves from there. A runtime-editable map is future work.

### ⬛ P3 — Scheduling

No dates or times are stored. A player taps Schedule; the client writes `requested_by`; the **opponent** is nudged with the requester's contact channels; the organizer gets a read-only requests panel. **S5: no `requested_by` backfill** — the old boolean never recorded who asked, so pending requests expire and players re-request.

**A1 verification** · `npm run test:rules` · `npm run test:storage` · `cd functions && npm test` · `npm run test:functions:integration`

---

## A3 · Client / Dev — `dev-client`

### ⬛ F7 — One definition of a complete profile

Name, skill, league, one court — collected on the **signup preferences screen for every provider** (email, Google, Apple).

**Then delete `CompleteProfileModal.tsx`, the Matches gate, and the Profile Tasks nag block.** This is the largest block of thrown-away harmonization work the audit found — 18 restyled elements deleted by one signup screen. **A4 must not have restyled any of it.**

### ⬛ F8 — One `resolveZone`

One function serving signup and profile. **Every explicit pick sets `preferred_zone_manual`.**

Delete the silent Downtown-Midtown default at the placement site. `effectiveZone`'s Downtown default exists for *placement* only — a member with no courts is now stopped at join by the "Enter A Zone" modal instead, so nobody is silently defaulted.

> Keep the mapping of a **missing** `zone` onto the default zone for pre-zone groups. Zones went live mid-event; groups generated before that carry no `zone`. They were briefly kept as a separate zone-less draw — which put the running groups outside the zone list and matched every participant to two draws, **doubling every "N signed up" count**. They are Downtown-Midtown draws, not a fourth category.

### ⬛ F9 · LB-17 — Skill edit stops rewriting participant skill

`ProfileInfo.tsx` `updateSkills` currently rewrites `event_participants.skill`, so a profile edit **silently moves the member between tournament draws mid-event**. `skill` becomes a join-time snapshot only the organizer changes.

### ⬛ LB-18 — `CompleteProfileModal`'s hidden writes

`updateLeagueAndAgeCategory` flips `profile_details_visible` to true (dropped by L6 today), and `updatePreferredCourts` rewrites `preferred_zone` with its **old** value even when the new courts cross a zone. **Recompute `preferred_zone` unless `preferred_zone_manual`.**

### ⬛ F10 — `isEventManager` helper

Replaces every `creator_id` check in the client. Event-scoped organizers (`creator_id` + `organizer_ids`) are honoured everywhere `isCreator` is used today.

### ⬛ F11 — `available_to_play` and the Away pill

Toggle on the profile; pill on challenge and rally cards.

### ⬛ KO-1 · KO-2 · R-4 — The knockout is fully organizer-controlled

**This reverses the current auto-seeding.**

| Row | Now | After |
| --- | --- | --- |
| **KO-1** | `selectGroupWinners` auto-seeds every group winner, ordered points → gamesWon so the top seed lands in slot 1 | **Generate all slots as `PLAYER_LOADING`.** Drop the points → gamesWon ordering. Keep `manualFill: true` and the first-round bye skip |
| **KO-2** | The top seed is engine-placed and reads as authoritative | **Every occupied slot is reassignable from the unplaced list.** No slot is read-only, including a group's first-ranked player |
| **KO-3** | `CLAUDE.md` documents the auto-seeding | A5 rewrites that paragraph in Sprint D3 step 16 — confirm it landed |

There is **no** automatic runner-up fill; that behaviour was already removed with `selectAdvancingPlayers`.

### ⬛ The knockout size bar

| Rule | Detail |
| --- | --- |
| Visibility | **Organizer only** |
| Timing | Size chosen **before** generation |
| After generation | **Expand only** — 4→8, 8→16. **Never backward** |
| On expand | **Existing matches are retained.** The organizer goes to Manage Draw and saves for the increase to take effect |
| Confirm | Add one anyway as cheap insurance (Q-24) |

### ⬛ Reset and cancel, scoped

**Reset or cancel must not delete every match in the tournament** — only the current draw: this knockout, this RR, this division, this league. **Recorded scores are never deleted.**

`currentMatches` **must filter on `zone`.** Every destructive path iterates it; without the zone term two zone draws in the same division and skill are indistinguishable, and resetting one zone **deleted the other zone's matches and reversed those players' league points.**

Winner advancement must normalize `zone` too — template match ids (M1, M5, …) are identical across zone draws, so `matches.find` can write a winner over a real player's slot in the **other** zone, silently, and report success.

### ⬛ Merges persisted, late-join placer deleted

Read merges from `zone_draw_config` (L7) instead of re-inferring. Delete the in-browser late-join placer — A1's server placer replaces it.

> The merge-inference effect must key on `[matches, statsMap]`. Inside the matches snapshot callback `statsMap` is a stale `{}` closure, so every band lookup returns 0 and the inference silently falls back to Challengers+Masters.

**A3 verification** · `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e`

---

## A4 · UI/UX — `ui-ux`

Wednesday's primitives make today assembly, not invention. Use `Sheet`, `Button`, `Input`, `AlertMessage`, `SegmentedControl`.

### ⬛ "Enter A Zone" join modal

A member with **no court preferences** who clicks Join gets a court dropdown modal titled **"Enter A Zone"**. The join **completes only after courts are chosen**; the chosen courts set `preferred_zone`; the server placer then seats them within their zone's draws.

A custom court entry that resolves to no zone shows a confirmation that it has been sent for verification — A1 fires the notice.

### ⬛ Withdraw — member

A joined event shows a **Withdraw** button.

| State | Behaviour |
| --- | --- |
| Before draws exist | Withdrawing leaves the roster |
| After draws exist | Warning: *"You lose all matches — opponents get walkovers"* → confirm → every unplayed match becomes a walkover. Played matches stay as played. **Permanent from the member's side** |

The organizer is notified: *"{Name} withdraws from {tournament} {division}"*.

### ⬛ Reset and the orange **!** — organizer

A **Reset** control replaces the delete bin. An **orange !** button next to it opens the withdrawal form: reason (injury · unavailable · cannot contact · other) → writes `status: withdrawn` + the note.

Withdrawn players **stay in Unplaced** and are never auto-seated. Re-add is allowed.

> Use `text-badge` for the orange, never `text-amber-300` — raw palette does not flip and washes out to near-invisible on the light theme's near-white surfaces.

### ⬛ Partner pool

A doubles player registering alone enters the pool. The notification links to **the list of players in this doubles tournament without a partner**, with contact buttons on each row. Once a partner is decided: "select app partner" or "edit team" picks from the pool dropdown, which removes the other player from the pool.

### ⬛ Away pill · Unplaced list

Away pill on challenge and rally cards when `available_to_play` is off.

The **Unplaced Players** list shows each player's zone, and **"No zone" when they have selected no courts** — `effectiveZone`'s Downtown default exists for placement only, and showing it would report a choice the player never made.

### ⬛ Delete, do not restyle

The Profile day-toggle grid (23 day buttons + 7 weekday headers — retires BT-18) and the organizer date / AM-PM / Set scheduling controls with their two toasts. No dates are stored after today.

**Keep and restyle:** the round-deadline inputs and the RR knockout size bar. Both are explicitly **not** frozen.

**A4 verification** · `npm run typecheck` · `.design-sync` diff, both cells · `grep -rn 'CompleteProfileModal\|profile_details_visible' src/` → 0

---

## A5 · Verify — `dev-verify`

### ⬛ Migration dry-run diffs

Every L-row. **You read the diff before anything is applied.** Doc counts, fields touched, fields not touched.

### ⬛ Journeys

| # | Journey | Assert |
| --- | --- | --- |
| **1** | Sign up → join with no courts → "Enter A Zone" → seated | The join does not complete until courts are chosen; the member lands in the right zone's draw; nobody is defaulted to Downtown-Midtown |
| **4** | Walkover payouts | RR group **1 to each**; knockout advances the winner and pays R32 1 / R16 2 / QF 3 / SF 5 / F 10 |
| **5** | Withdrawal after draws | Unplayed matches become walkovers with the payouts above; **played matches untouched**; organizer, member and every affected opponent notified; the player stays in Unplaced and is never re-seated |
| new | Zone change after generation | Player sits in **both** draws; organizer sees three options with add-to-both selected; **no seat is vacated** |
| new | Reset scoping | Resetting one zone's draw leaves the other zone's matches and points **completely untouched** |
| new | Knockout | Every slot generates as `PLAYER_LOADING`; every occupied slot is reassignable; the size bar expands and never contracts; existing matches survive an expand |

### ⬛ Rules matrix

New cases for `status: withdrawn`, the per-event `zone`, `partner_uid` / `partner_name`, `available_to_play`, `zone_draw_config`, `organizer_ids`.

### ⬛ Exit gate

Every migration diff read and approved · no member silently defaulted to a zone anywhere · **a zone change unseats nobody** · a reset touches exactly one draw · `R6` holds on 204 docs · the seven-journey suite green.

---

## Handoffs into Sprint D5

| From | To | What |
| --- | --- | --- |
| A2 | A1 | The `providers` shape — roles move off `preferences` tomorrow |
| A3 | A4 | `CompleteProfileModal` is deleted; anything still importing it breaks `tsc` |
| A1 | A5 | The placer's seating rules, for the release regression |
