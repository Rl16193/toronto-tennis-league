# What the five sprints actually delivered

**A plain-English review for the product owner.**

| | |
| --- | --- |
| **Date** | 2026-08-25 |
| **What was reviewed** | 24 commits on the `dev-anuj` branch, covering all five sprints |
| **Size of the work** | 133 files changed — about 3,200 lines added and 2,600 removed |
| **How it was checked** | Every claim below was read in the code and the logic traced through — not just checked for the right words being present. Where a change looks right but does not work, that is said plainly |
| **Not checked** | Whether the automated tests pass right now, and whether any of this is live. See §5 |

Technical references for Anuj are in the appendix, not in the body.

---

## 1 · The bottom line

**The hardest and riskiest part — how scores are recorded and points paid — was done, and done well.** That was the sprint that could have quietly corrupted members' points, and it didn't. The logic is careful, the money-handling is correct, and several long-standing defects are genuinely closed.

**The visual foundation is real too.** The colour problem that made every card invisible against the page is properly fixed, and the app now has keyboard focus and reduced-motion support it never had.

**Three things need your attention:**

1. **One fix does not work**, despite looking correct — the Round Robin knockout is still permanently blocked in exactly the situation it was meant to unblock.
2. **One change broke something that was working** — the "points won" figure on every player card is now frozen and will never update again. You have already decided to reverse this.
3. **One planned feature was not built** — the doubles partner pool. The join screen already tells members it exists.

> **Correction, 2026-08-25:** an earlier draft of this review said the knockout size safeguard was missing. It is not — it was built correctly. My search was truncated and missed it. The only gap is the confirmation step described in §3.4.

---

## 2 · What changed, in plain English

### Recording a score

| What used to happen | What happens now |
| --- | --- |
| Only an organizer could record a result. A player could type a score, but it sat there waiting for approval | **Either player can record the result and it counts immediately.** No waiting, no approval step |
| Opening the score screen pre-selected player 1 as the winner. Pressing submit without touching anything recorded a fake win and paid out real points | **Nobody is pre-selected.** You cannot submit without choosing a winner |
| Nobody was told their result had been recorded | **Both players get a notification.** The winner sees *"Win recorded — 7-2, 7-4 v. Rahul"*; the loser sees *"Score recorded"*, with the score from their own side |
| If two players reported different scores there was no rule — an organizer picked one by hand | **The more conservative score wins automatically.** If one claims 7-0, 7-0 and the other says 7-2, 7-4, the 7-2, 7-4 is recorded. You cannot inflate your own win |
| If two players disagreed about *who won*, there was no handling at all | **The match is flagged and the organizer told once.** The first result stays showing until they resolve it. Nothing is silently overwritten |
| A wrong score could never be corrected. The error told organizers to "reset it first" — and the reset button did not exist | **An organizer can correct a result as often as needed.** The old points are taken back and the new ones paid, in one step |
| Correcting a match reset its completion date, corrupting streaks and "months active" | **The original completion date is kept** |
| Scores above 10 could be nonsense — 12-2 or 90-40 were accepted | **Above 10 the margin must be exactly 2**, enforced in three places so they cannot disagree |
| A player could record a "walkover" just by submitting an empty score | **Only an organizer can record a walkover**, and it must be chosen deliberately |
| A walkover in a group paid a full win — 3 points | **A walkover pays 1 point to each player**, because nobody played. A real played match still pays 3 and 1 |
| Walkovers counted toward matches played and win totals, inflating records | **They no longer do** |
| The group table worked out points from its own copy of the rules, which had drifted from what was actually paid | **It now uses the same rule as the payment**, so the table cannot disagree with the points |

### Joining an event

| What used to happen | What happens now |
| --- | --- |
| Joining could be **refused** if the draw looked full | **Joining always works.** Seating is handled afterwards |
| If your skill group was full you were quietly put in the other one — **and your recorded skill level was changed** to match | That path is gone |
| Two parts of the system competed to seat players, and which won depended on whether an organizer had a browser tab open | **One place does the seating**, on the server |
| A member with no courts chosen was silently assigned to Downtown-Midtown | **They are stopped and asked to choose a zone before joining** |
| Profile completeness was defined in three places, with a nag and a blocking pop-up | **One screen at signup**, for every sign-in method. The pop-up and nag are deleted |

### Withdrawing from an event

| What used to happen | What happens now |
| --- | --- |
| A member could not withdraw themselves | **There is a Withdraw button** |
| Removing a player wiped them out of the whole event | **They stay registered, marked withdrawn**, and can be added back |
| No handling of the matches they were due to play | **Unplayed matches become walkovers** — the opponent advances in a knockout, or both get 1 point in a group. **Matches already played are left alone** |

### Contact details

| What used to happen | What happens now |
| --- | --- |
| An organizer could not see phone numbers for people in their own event, so the printed draw came out blank | **Organizers can now reach their own participants** |
| The super-admin could read everyone's contact details in the app | **That access is removed.** Full data comes from the database export instead |

### Services and stringing

| What used to happen | What happens now |
| --- | --- |
| A booking moved between four confusing states, with a review queue | **Three simple steps: booked → racquet dropped off → completed** |
| No clean way to cancel | **Cancel before drop-off, and the points are refunded** |
| No way to tell "the stringer says it's done" from "still being worked on" | The stringer marks it done and **the player confirms they got the racquet back**. If they say no it returns to in-progress and you are notified |

### How the app looks

| What used to happen | What happens now |
| --- | --- |
| The page background and the card background were **exactly the same colour**, so cards were invisible and every shadow in the app did nothing | **Three distinct shades**, in both light and dark mode |
| Two different orange accents, one hard-coded in eight places the theme could not reach | **One accent colour**, and all eight hard-coded copies are gone |
| Keyboard users could not see what they had selected, anywhere in the app | **Focus is now visible** |
| Animations ignored the phone's "reduce motion" setting | **Now respected** |
| Buttons came in three sizes, most too small to tap reliably | **One size, tall enough to tap** |
| Pressing Escape on a pop-up closed the menu behind it as well | **Only the top one closes** |
| Mistyped web addresses silently redirected to the home page | **A proper "not found" page** |

---

## 3 · Problems found

### 3.1 One fix does not work

**The Round Robin knockout is still permanently blocked.**

The situation it was meant to fix: when a group ends up with only one player — because others were moved out, or the group was created with one person — the system keeps an invisible "empty" match so that player does not disappear off the screen. That empty match can never be played, because there is nobody to play against.

The knockout stage only unlocks when every group match is finished. The empty match never finishes. So the knockout button never appears, there is no error message, and the organizer cannot even see what is blocking them — the system deliberately hides empty rows.

The fix was supposed to make the system **ignore** those empty matches. What was written makes the check **stricter** instead. The empty match still fails, so the knockout is still locked. It reads as correct on the page — the right words are on the right line — but it does not change the outcome.

**This needs a one-line correction and a test.** No test covers this situation, which is why it passed review.

### 3.2 One change created a new problem

**Every player's "points won" figure is now frozen and will never update again.**

The plan was to stop storing two figures — points won and total points played — and work them out on demand instead. Half was done: the system **stopped recording them**. The other half — working them out — **was never built**. Every screen that displays them is still there.

The result:

- Every existing player's percentage is stuck where it was, drifting further from the truth with every match.
- **Every new member will show a dash forever**, because their figure starts at zero and can never rise.
- The Leagues board shows a "P/G Played" count that will never move again.

**You have decided to reverse this**, which is right, and §4 explains why it costs nothing.

On the related worry you raised: **"matches played" is not affected.** That is still recorded normally, so player cards are fine. Only the points-won pair is orphaned.

### 3.3 One thing was not built

**The doubles partner pool.** The plan: a player signs up for doubles alone, joins a pool of others looking for a partner, is notified when someone new joins, and picks from that pool. None of it exists. A doubles player still has to name a partner to register.

**That is the only one.** The knockout size safeguard was built and works — see the correction in §1.

### 3.4 Things left half-finished

- **The knockout size safeguard works, with one step missing.** An organizer can only ever make a draw bigger — 4 to 8, 8 to 16, never smaller — and matches already generated are kept. The plan also said the increase should be confirmed by opening Manage Draw and saving; today it applies the moment the size is chosen.
- **The zone question at joining works, but differently than planned.** A member without a zone is now stopped and asked to pick one — good. But they pick a **zone** directly rather than picking their **courts** and having the zone worked out from them. The consequence: if someone plays at a court the system does not recognise, **nobody is notified to add it**. That part is missing.
- **Two figures that should have been deleted are still recorded.** "Tournaments played" is counted wrongly: it goes up every time a player *loses*, so five losses reads as five tournaments. "Losses" is recorded but, now verified, **shown on no screen at all** — it reaches the leaderboard row object and an opponent-panel type, and neither renders it. The Round Robin group table does show a loss column, but that counts the group's own matches and never touches the stored figure.
- **Two retired features are still in the code** — the old booking lock, and group lessons. Group lessons matters slightly more, because it remains one of the ways someone can read another member's contact details.
- **Dead code left behind** in two places: the old "draw is full" refusal with its skill-rewriting path, and the old automatic knockout seeding. Unreachable today; a trap for whoever edits those files next.
- **13 of the 22 planned shared components** were not built, so collapsing 83 card designs into one set is mostly still ahead.

### 3.5 One thing to watch

**The withdrawal feature keeps its own private copy of the points table.**

When someone withdraws, their unplayed matches become walkovers and points are paid. That code has **its own list of what each round is worth**, separate from the two that already existed. All three agree today — I checked the numbers.

The concern is not today, it is the next change. This project has a documented incident where two copies of a payment rule drifted apart and players were shown points nobody had given them. Same setup, three copies instead of two. §4 covers the fix.

---

## 4 · Decisions for you

### Decision 1 — Restore "points won" and "total points played" *(already decided)*

**It costs nothing.** Both figures go back into a record the system is **already writing** at that moment. No new background job, no extra work per submission. Databases of this kind charge per record written, not per field — adding two numbers to a record already being saved is free.

**The alternative is genuinely expensive.** Working the percentage out instead means fetching every player's full match history for every row of the leaderboard. That screen currently loads in a single request, and it is the one people look at most.

**And the original reason for removing them no longer applies.** They were removed because a stored total can drift from reality. That risk was real when the app itself could write these numbers and corrections could not be undone. Both changed in this work: the server is now the only writer, and correcting a result takes the old points back precisely before paying the new ones.

**Check first:** whether this has gone live. If not, nothing has drifted and it is a pure code fix. If it has, every match scored since needs a catch-up pass.

### Decision 2 — One scoring file

You asked for a single place where scoring lives. What is achievable:

- **Immediately:** the withdrawal feature's private copy can use the main one instead. They sit in the same part of the codebase. **Three copies become two**, and the risky one is the one that goes.
- **The remaining two cannot share a file** — one runs on the server, one in the browser, built by different tools.
- **But you can still reach one**, by removing the need for the browser copy. The browser only works out points so it can draw the group table. If the server **records the points it actually paid** onto the match when it saves the result, the browser just displays them. One rule, one place — and the table would then show what was genuinely paid rather than what it believes should have been paid, which is precisely the failure that happened before.

**Recommendation: do the first now, schedule the second.**

### Decision 3 — Rename the booking timestamp

You asked for `completion_requested_at` to become `marked_completed_at`. **Your name is more accurate** — nothing is being requested; the stringer is stating the job is done. It is 7 references across 5 files, with no live data yet (one test booking, cancelled). Worth doing before real bookings exist.

### Decision 4 — Both were missed *(answered)*

Missed, not deferred, so they go into a follow-up sprint rather than the future-work list. One correction to this: **the knockout size safeguard was in fact built** and works, as noted in §1. The partner pool is the only genuinely missing feature.

### Decision 5 — Keep the extra safety rule?

Anuj added a rule nobody asked for: a match cannot be saved with no scores at all unless it is explicitly marked a walkover. **I would keep it** — it is what stops an organizer repeating the empty-score bug. To answer your specific question: an organizer submitting an empty score **and** ticking walkover **is** accepted; submitting an empty score **without** ticking it is refused.

---


---

## 4b · Where these decisions landed

All five decisions above were taken on 2026-08-25, along with several more. They are scheduled in two follow-up sprints:

| Sprint | Covers |
| --- | --- |
| [Sprint D6](../sprints/SPRINT-D6.md) | Every correction in §3, plus the doubles partner pool and the courts-not-zones change. Points won restored, losses and tournaments-played deleted, one award table, the booking rename, dead code and retired features removed |
| [Sprint D7](../sprints/SPRINT-D7.md) | The 13 remaining shared components and the card consolidation, plus the plain-language copy sweep, the 5.8-inch row rule, and the rebuilt leaderboard chart |

Two rulings from that session reversed decisions in this review: **losses is deleted** rather than kept, because it turned out to be displayed nowhere; and **knockout draw size moves in both directions** in edit mode rather than expanding only, with 4 as the floor.

---

## 5 · What I could not check

- **Whether the automated tests pass.** The project runs a full check on every push. Three commits show a failed check, and the most recent show no result at all. I could not query that from here. **Confirm before anything is deployed.**
- **Whether any of this is live.** It decides whether Decision 1 needs a catch-up pass.
- **The visual sweeps.** I confirmed the colour system, the shared components, and that no old colour codes remain. I did not walk all 272 individual visual items.

---

## Appendix — technical references

For Anuj. Line numbers are on `dev-anuj` at `4dde946`.

| Item | Where |
| --- | --- |
| Knockout gate — **broken fix** | `useTournament.ts:1304`. Needs `rrGroupMatches.filter((m) => m.player_1_uid && m.player_2_uid).every((m) => m.status === 'complete')`, with the `length > 0` guard on `:1303` moved onto the filtered set |
| Points-won regression | Writer removed from `statDeltasForResult` (`lib/tournamentResult.js:131-150`); readers still live at `useStandings.ts:58-59`, `Profile.tsx:167-168`, `Leagues.tsx:269`, `RRGroupCard.tsx:36`, `firestoreNormalization.ts:264-265`, `types.ts:61-62` |
| Third award table | `withdrawalWorkflow.js:10`. Replace with `tournamentAward()` from `./lib/tournamentResult` — already exported, same package. `tournamentAward({round, format}).loserPoints` returns 1 for RR, so the special case goes too |
| Booking timestamp rename | `bookings.js:86,108` · `lib/bookingState.js:21` · `services/types.ts:100` · `test/bookingState.test.js:5,8` · `tests/integration/functions.emulator.test.mjs:209` |
| Still written, should be deleted | `loses` and `tournamentsPlayed` in `lib/tournamentResult.js:137,146,148` |
| Retired features still present | `redemption_locks` — `firestore.rules:641`, `rewards.js:36`. `group_lessons` — `firestore.rules:707`, `rewards.js:98,150`, plus `isCurrentGroupLessonCoachFor` in the contacts read rule |
| No-show leftovers | `firestore.rules:529` still whitelists the field; `lib/adminMetricsCompute.js:112` still branches on it |
| Dead code | `useJoin.ts:158,162` (unreachable `full` / `fallback`) · `rrGeneration.ts:348` (`selectGroupWinners`, no caller) |
| Unmapped-court notification | Not implemented anywhere |
| Zone gate | `useJoin.ts:132-133` — gates on zone, not courts; UI at `EventsElements.tsx:612-627` |
| **Verified correct by logic trace** | Reconcile and dispute `tournamentResults.js:210-300` · walkover payouts `lib/tournamentResult.js:118-128` · withdrawal scope and advancement `withdrawalWorkflow.js:38-80` · group standings `rrGeneration.ts:288-320` · organizer-only walkover `tournamentResults.js:204-205` |
