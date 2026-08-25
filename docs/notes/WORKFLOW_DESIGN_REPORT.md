# Workflow Design Report

Senior developer → product owner. Every user workflow discussed on 2026-08-21/22, in its decided
form, with the fixes that land now, the items deferred to a planned update, and the future work.
Companion documents: `DECISIONS_BRIEF.md` (product rulings), `HARMONIZATION_REPORT.md` (remodel
corrections), `DEV_ANUJ_CONFLICTS.md` (branch conflicts). Code links are permalinks to `dev-anuj`
`3f40773`; "live" means the owner's repository on the `toronto-tennis-league` project.

| Tag | Meaning |
| --- | --- |
| **NOW** | Fix before the next release (live hotfix, or `dev-anuj` before merge) |
| **P*n*** | Deferred to remodel phase *n* of the Remodel Review |
| **FUTURE** | Agreed direction, not scheduled |

## 1. Scoring and results (tournaments)

> **Amendment — 2026-08-23 · results auto-apply on submission.** Owner ruling; replaces the
> "Player reports never apply" passage below and `HARMONIZATION_REPORT.md` D4. A submitted result
> **applies immediately** and both players are notified — winner *"Win recorded — {score}"*, loser
> *"Score recorded — {score}"*. If the opponent submits a **different score with the same winner**,
> the submission with the **smaller aggregate winning margin** records (`7-0, 7-0` margin 14 vs
> `7-2, 7-4` margin 8 → `7-2, 7-4`); tie → first submission stands. Only **different winners** flag
> for organizer review, and the **first submitted result stays applied and displayed** until
> resolved. Scope is tournaments, challenges **and** friendlies. Walkovers remain organizer-only.
> Authoritative text: `docs/PROJECT-PLAN.md` §2.
>
> **Also corrected here:** the walkover payout below reads "no-show result in Round Robin 1/1" —
> that is right, and it is a **change from the shipped code**, which pays a group walkover the full
> 3/1. A **played** RR match still pays 3/1. Knockout loser awards: R32 **1** · R16 **2** · QF **3**
> · SF **5** · F **10**; the final's winner takes **20** and is the only knockout match that pays
> its winner.

**Designed behaviour.** One server callable is the only scoring authority. Set scores are integers
0–99; when the higher score exceeds 10 the margin is exactly 2; the winner takes the set majority.
The only non-played result is a **walkover**: all-zero scores plus a winner, tournaments only, paid
as a no-show result in Round Robin 1/1; knockout advances the winner, the eliminated player collects 
the points for that round — the no-show concept is removed and `is_walkover` is not stored. **A player who fails to appear for a scheduled match is not a walkover:** the organizer records a real score (6-0) for the player who showed up, which pays as a normal result. The walkover is for a match neither player played. The 
organizer records and re-edits a result any number of times (reverse old + apply new in one transaction,
`result_at` stamped, `completed_at` pinned at first scoring, every edit in the `tournament` change log,
exported to CSV). Player reports never apply: they sit as a pending block on the match, both players
see "Score / Winner change requested", the organizer approves or denies; an approval reserves the score, winner if a not a knockout match, for a knockout match if the next match_id is completed/submitted result, then the error message, otherwise a change is approved, and a new winner makes it to next match id player slot. The +5 group bonus is an organizer toggle with the `rr_groupbonus` receipt stamp.
Task counters (matches played, streaks) are recomputed by the callable on every apply and reverse.

| Item | Status |
| --- | --- |
| Rescore refusal → reverse + apply; score validator at callable, rules and form; `setGroupBonus` callable | **NOW** (`dev-anuj`) |
| Score modal: no preselected winner, explicit Walkover switch, no-show control removed | **P4b** |
| Pending block replaces submission docs; notifications on request and on deny | **P4b** |
| Task counters recomputed on apply/reverse | **P4b / P6b** |

## 2. Ladder and friendlies

**Designed behaviour.** The year-round ladder is one permanent event (`events/ladder`); challenges
keep `event_id`; the ladder's organizer confirms reported results through `challengeResults`
(+3 / −3 floored at 0, same score rule). Friendlies stay +2/+1, confirmed by the opponent, counted
as a played match. A rejected request or challenge disappears from the rejecting player's tab and
stays gone. Cancel after acceptance succeeds, with a notice to the other player. The "also count as
a Challenge" conversion is removed — one physical match counts once. A member whose **available to
play** toggle is off shows an **Away** pill on challenge and rally cards.

| Item | Status |
| --- | --- |
| `challengeResults` callable; rules confirm branch restored to the event manager | **NOW** (`dev-anuj`) |
| Conversion checkbox and `proposeConversion` removed | **P4b** |
| Reject/cancel semantics above; challenge notification parity with rallies (declined, confirmed, denied) | **FUTURE** — with challenge and rally reporting through the result callable |
| Challenge action in one place (Challenges tab) with the block reason shown | **FUTURE** |
| `available_to_play` toggle on preferences; Away pill | **NOW** (small, both refs) |

## 3. Scheduling

**Designed behaviour.** No dates or times are stored. A player taps Schedule; the client writes
`requested_by`; the **opponent** is nudged with the requester's contact channels; the organizer has
a read-only requests panel beside per-round deadlines. Deadlines are keyed by draw and round,
do not include the Round Robin stage, they last for the entire seaason/year, no deadlines, round robin knockouts will have deadlines, they are carried in the one weekly reminder.(maybe not, check resend) Pending requests under the old flag expire at cutover; players re-request.

| Item | Status |
| --- | --- |
| `requested_by`, opponent nudge, date fields and organizer scheduling removed | **P3** |
| Deadlines per draw and round; RR group stage has none, RR knockout does | **P3** |

## 4. Zones and placement

**Designed behaviour.** A member's zone is their profile zone, and it changes only when the member
uses the change-zone workflow. A member with no courts who joins gets the **"Enter A Zone"** court
modal; a custom court that resolves to no zone notifies the super-admin and the organizer for
manual mapping. One `resolveZone` serves signup and profile; every explicit pick sets the manual
flag. Request Zone Change stays. if matches are not generated, the players can move. if matches are generated, event organizers get notified. and player appear in both zone draws until event organizer approves displacement. notification links to 3 options displace, add to both draws, cancel with add to both draws selected on default. 
The organizer may set a player's zone
**per event** — a manual zone on that participant row, the profile untouched. **A zone change never
unseats anyone:** existing matches stay, and the player is also added to the new zone's draw or
group, so a player may sit in two or more groups/draws. The organizer may create additional groups
or knockout draws for other zones. One server-side placer seats joiners on participant-create
(generated: open LOADING slot or group within their zone; otherwise zone-assigned at join); removed
players stay in Unplaced and are never re-seated. Skill merges persist on `zone_draw_config`. Each
draw and level is generated separately (as today). The knockout size bar is visible to organizers
only, event_organizer selects size before generation. size can only increase after match generation, 4-8, 8-16, never backward. matches generated should be retained when the the draw size increase, user thengo to manage draw and save it for the size increase to be confirmed. reset or cancel matches should not cancel all the matches in the tournament, just the current knockout (rr, division, league), or rr matches, the scores recorded cannot be deleted.

| Item | Status |
| --- | --- |
| Silent Downtown-Midtown default removed; "Enter A Zone"; unmapped-court notice | **NOW** (`dev-anuj`) then **P2a** |
| Single `resolveZone`; manual flag on every explicit pick | **NOW** |
| Request Zone Change kept, reworked (both-draws default); organizer approve no longer vacates seats | **P2a** |
| Participant-row zone field (organizer-set, manual) | **P2a** (Ledger amendment) |
| Server placer; multi-draw membership; late-join client placer deleted | **P4b** |
| Merges persisted; knockout size organizer-only, expand-only, confirmed via Manage Draw; reset scoped to one draw | **P4b** |
| Generate every populated draw in one click | **FUTURE** |

## 5. Withdrawal and removal

**Designed behaviour.** Members withdraw themselves (Withdraw button). Before draws exist they
leave the roster; after draws exist, every unplayed match becomes a walkover (RR opponent 1 /
withdrawing player 1; knockout opponent advances), played matches stay, and the organizer is
notified. The organizer sees Reset in place of delete and an orange **!** button opening the
withdrawal form (reason → `status: withdrawn` + note). One status field replaces the removal flag,
the RR withdrawn list and the functions' active checks. Re-add is allowed; applied walkovers are
corrected by rescore. Opponents of forfeited matches are notified.

| Item | Status |
| --- | --- |
| Withdraw/Reset/! UI and the server withdrawal operation | **P2a** (data) · **P4b** (walkovers through the result path) |
| Notices to organizer, member and opponents | **P2a** |

## 6. Joining and events

**Designed behaviour.** One definition of a complete profile — name, skill, league, one court — on
the signup preferences screen for every provider (email, Google, Apple); the Matches gate modal and
the Profile nag are deleted. Doubles: one `setDoublesPartner` writes `partner_uid` for a member or
`partner_name` for a guest; the server creates the member partner's own participant row; partner
uids sit on the match doc, so a partner on the app can read the opponents' contacts and submit
scores. partner not-on the app, no uid, just name. for doubles, if user enters name without partner name, they enter a player pool, others joining will be this player pool in dropdown instead of all the players on the app. Player allowed to enter without partner name, it is inferred they are looking for partners and should get a notification when some new joins the list. the link opens the list of player in the dobules tournament without a partner and sees the contact buttons for each player on the list. Once a partner is decided, one use can select app partner or edit team, add the other player dropdown talent pool, this removes the other player from the draw. `event_participants.skill` is a join-time snapshot only the organizer changes. Format and
Singles/Doubles lock after the first registration. Joining always registers (no "draw is full"
refusal, no fallback-draw prompt); the placer seats. `dateselected` and the hide-draw flags go
with the Ledger. "Joined" links to the draw.

| Item | Status |
| --- | --- |
| Profile completeness set; modal and nag deleted; OAuth routed through the same screen | **NOW** |
| Profile skill edit no longer rewrites participant skill | **NOW** |
| Doubles partner shape, partner row, partner access, partner pool | **P2a** · **P4b** |
| Late-join client placer removed; lock format after registration; `events/ladder` fixed id | **P2a** |
| Event types and creation modal simplified | **FUTURE** — needs a detail pass with the owner |

## 7. Profiles, access and roles

**Designed behaviour.** Every collection is publicly readable except `contacts` and
`mailing_list`. Contact details are visible in-app only to the event organizer for their own
sign-ups (participant-join connections) and to opponents through connections; the super-admin's
in-app profile viewing is removed (the owner uses the export). Members open the profiles of people
in their tournament or group. `profile_details_visible` is dropped. Event-scoped organizers
(`creator` + `organizer_ids`) are honoured by the client everywhere `isCreator` is used today; the
assignment UI follows the `providers` collection; the `event_creator` global privilege ends at the
providers cutover; the admin row is issued by a service-account script. Login returns to the page
the member started from or the profile page is the page he started from was the landing page.

| Item | Status |
| --- | --- |
| `preferences` public on `dev-anuj`; super-admin contacts read removed; marketplace contact via the projection | **NOW** (`dev-anuj`) |
| Participant-join organizer connections trigger | **NOW** (`dev-anuj`) |
| `isEventManager` helper in the client | **NOW** |
| `profile_details_visible` dropped | **P2a** |
| Organizer-assignment UI; admin recovery script; `event_creator` fallback end | **P5** |
| `next=` return path; change-email for OAuth-only accounts; availability editor on the Profile card | **FUTURE** (backlog) |

## 8. Bookings and services

**Designed behaviour.** `lead → in_progress → completed`, with `cancelled` from `lead` (points
refunded). Player: "Racquet dropped"; stringer: "Completed"; player: "Got your racquet back?" yes
→ completed, no → back to in-progress and the super-admin notified. `completion_requested_at`
marks the wait. The catalog lives in `services` and is edited through an owner-gated callable;
`redemption_locks` and the flagged/cancel-requested states go. Past bookings are listed under the
open ones, no bookings yet, only one, testing and it is cancelled. Group lessons become an add-on on a social event.

| Item | Status |
| --- | --- |
| Lifecycle, callables, provider view, booking notices | **P6c** |
| Catalog callable; `redemption_locks` removed | **P6c** |
| Past-bookings section | **FUTURE** (backlog) |

## 9. Tasks, claims and courts

**Designed behaviour.** Volunteer and host claims are approved by the event's organizer;
ambassador claims are approved automatically. Claims use a deterministic id so a repeat is a
no-op. Reports need no location proof; check-ins keep the ≤400 m rule. Court reports stay a data
feed for the owner — collected and paid, not displayed. Group awards skip the anonymous uid. The
task checklist writes only the flag (the `category` field goes with Phase 6b).

| Item | Status |
| --- | --- |
| **Court check-in fails on every return visit** — client writes attendance only; server stamps the passport | **NOW** (live hotfix) |
| Claim review by event organizer; ambassador auto-approve; claim dedupe | **P6b** |
| Checklist create rejected for new members | **P6b** |
| `no_account` excluded from group awards | **NOW** (one line) |

## 10. Notifications and comms

**Designed behaviour.** One "draw is out" notice per player per draw (no per-match fan-out, no
bye notices); players are notified when their next-round opponent is ready and when their Round Robin group is out; joins reach the organizer as **one "N joined today" digest**, not one notice per join; the weekly reminder counts only real pending matches
and carries the deadline; the false "ladder reset" notice goes; the server 30-day prune is the
only purge, mark-read happens on tap. Every organizer notice goes to `creator_id` and
`organizer_ids`. The welcome email fires when the member's name is first set and passes through
the delivery gate. Scheduling nudges the opponent; withdrawal notifies organizer, member and
opponents; bookings notify the provider on booking and the member on each step; unmapped courts
notify the super-admin and organizer. Notifications (in-app, later push) are the primary channel;
email is secondary.

| Item | Status |
| --- | --- |
| Welcome email bypasses the non-production gate on `dev-anuj` | **NOW** (`dev-anuj`) |
| Noise and purge changes; join digest; `eventOrganizerUids` | **P3** (with the scheduling triggers) |
| Weekly reminder carries the nearest deadline | **P3** |
| Welcome email on first name set | **P1** |
| Push notifications | **FUTURE** (with the mobile decision) |

## 11. Rankings and stats

**Designed behaviour.** The rank trend is updated **daily** (the snapshot function moves from
weekly to daily). `pointswon` / `totalPointsPlayed` are not stored; "P/G Won %" is derived
client-side from the member's matches, the same list the Progress chart uses. `loses` is derived.

| Item | Status |
| --- | --- |
| Daily rank snapshot | **NOW** (schedule change) |
| Derive P/G Won %; strip the two fields | **P4b** (Ledger amendment) |

## Fix now — consolidated

| # | Fix | Where |
| - | --- | --- |
| <a id="F1"></a>F1 | Court check-in on return visits (live) | `src/features/tasks/checkinService.ts`, `functions/taskPoints.js` |
| <a id="F2"></a>F2 | OAuth newcomers stuck: bootstrap writes `pointswon`/`totalPointsPlayed` the stats whitelist rejects | `src/lib/profileBootstrap.ts` |
| <a id="F3"></a>F3 | Marketplace seller contact reads `contacts`, not the projection | `src/pages/Marketplace.tsx` → `useContacts` |
| <a id="F4"></a>F4 | Welcome email bypasses the delivery gate; test project can email members | `functions/index.js` → `sendEmail` |
| <a id="F5"></a>F5 | Rescore, validator, group bonus, ladder callable, organizer connections (conflicts doc items 1–5) | `functions/`, `firestore.rules` |
| <a id="F6"></a>F6 | `preferences` public; super-admin contacts read removed | `firestore.rules#L183`, `#L226` |
| <a id="F7"></a>F7 | Profile completeness set; delete `CompleteProfileModal` and the Profile nag | `src/pages/Signup.tsx`, `src/pages/Matches.tsx`, `src/pages/Profile.tsx` |
| <a id="F8"></a>F8 | Single `resolveZone`; manual flag on explicit picks | `src/pages/Signup.tsx`, `src/features/profile/*` |
| <a id="F9"></a>F9 | Skill edit stops rewriting `event_participants.skill` | `src/features/profile/services/profileService.ts` |
| <a id="F10"></a>F10 | `isEventManager` helper replaces `creator_id` checks | `src/pages/tournament/useTournament.ts`, `src/pages/Events.tsx` |
| <a id="F11"></a>F11 | `available_to_play` toggle and Away pill | `src/features/profile/*`, `src/pages/Matches.tsx` |
| <a id="F12"></a>F12 | Daily rank snapshot | `functions/rankSnapshot.js` |
| <a id="F13"></a>F13 | Group awards skip `no_account` | `functions/groupAwards.js` |

## Deferred — by phase

| Phase | Items |
| --- | --- |
| <a id="P1"></a>P1 | Welcome email on first name set; rename fan-out stays as is until the name-sync trigger |
| <a id="P2a"></a>P2a | Per-event zone field; zone-request flow reworked; withdrawal data + notices; doubles partner shape; format lock; `events/ladder`; `profile_details_visible` dropped; late-join placer removed |
| <a id="P3"></a>P3 | `requested_by` scheduling; deadlines per draw and round (no RR group stage); notification noise/purge changes; `eventOrganizerUids` |
| <a id="P4b"></a>P4b | Pending block; score modal rework; task counters on apply/reverse; conversion removed; server placer; multi-draw membership; merges persisted; knockout bar; withdrawal walkovers; partner access; P/G derived |
| <a id="P5"></a>P5 | Organizer-assignment UI; admin recovery; `event_creator` fallback end |
| <a id="P6b"></a>P6b | Claim review by organizer; ambassador auto-approve; claim dedupe; checklist `category` |
| <a id="P6c"></a>P6c | Bookings lifecycle; catalog callable; `redemption_locks` removed |

## Future work

- Generate every populated draw in one click.
- Event types and the creation modal simplified (detail pass with the owner).
- Challenge and rally reporting through the result callable; reject/cancel semantics; challenge notification parity; one Challenge entry point.
- `next=` return path; change-email for OAuth-only accounts; availability editor on the Profile card; "Joined" links to the draw; Player-Loading placeholder participants removed; past-bookings section.
- Push notifications (with the mobile app vs PWA decision); staging tier; backup and restore policy.
- Runtime-editable courts map.

## Assumptions recorded

- `mailing_list` is the second private collection (it holds strangers' emails).
- The welcome email fires when `users.name` is first set, replacing the Review's doc-creation trigger.
- The Unplaced list is scoped to the event on screen; a player may be seated in more than one of that event's draws or groups.
- A rejected request or challenge stays gone from the rejecting player's tab — reappearing after refresh is a defect, fixed with the rally/challenge callable work.
- Court reports remain a collected, paid, undisplayed data feed.

## Weekly reminder — what it can carry

The reminder is an Admin SDK scheduled job, so security rules do not restrict it and it can read anything. Names are absent today by an earlier optimisation, not a limitation.

- **Deadlines: yes, cheaply.** One read per *event* with pending matches (a handful), not per match. After the remodel the round lives on the `tournament` structure row, which shares the match doc id, so it is one batched `getAll` if the round is needed.
- **Opponent names: yes.** One `users/{uid}` read per distinct opponent, batched with `getAll` — a few hundred reads a week, negligible.
- **Decided body:** the aggregate line plus the nearest deadline — *"You have 3 matches to play — earliest deadline 14 Sept"*. Round Robin group matches have no deadline (L17), so when a player has no dated match the line falls back to *"Arrange a time with your opponent."* Itemising every match by name and date is possible at the same cost and is left as future work.
