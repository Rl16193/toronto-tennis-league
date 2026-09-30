# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server on port 3000
npm run build        # rebuild programs-tennis.csv, then production build → dist/
npm run build:programs   # regenerate public/programs-tennis.csv on its own
npm run lint         # TypeScript type-check only (no eslint)
npm run hosting:deploy   # build + firebase deploy --only hosting
npm run hosting:preview  # build + deploy to a preview channel

# Export Firestore collections to CSV (requires serviceAccount.json in project root)
# Lives in the gitignored, local-only analysis/ folder (data dumps contain user PII)
node analysis/export-firestore.js --key serviceAccount.json

# Deploy Firestore rules (separate from hosting)
firebase deploy --only firestore:rules
```

### Court programs data (`data/` vs `public/`)
`data/Registered Programs.csv` is the City of Toronto's full programs export (~9 MB, every activity
in the city) and is **deliberately not in `public/`** — everything in `public/` is copied verbatim
into `dist/` and shipped. `scripts/build-programs-csv.mjs` filters it to the ~435 tennis rows
(~0.15 MB) as `public/programs-tennis.csv`, which is what the app fetches. Rows are copied verbatim
and headers are untouched, so `parsePrograms` needs no knowledge of this step. The build runs it
automatically; re-run it by hand after updating the source CSV.

There are no automated tests. `npm run lint` (`tsc --noEmit`) is the only static check. Do not start a dev server or use the browser preview tool to visually verify changes — `tsc --noEmit` is the verification step; the user checks UI changes themselves.

## Stack

React 19 + TypeScript + Vite 6. Tailwind CSS v4 (via `@tailwindcss/vite` plugin — no `tailwind.config.js`). Firebase (Auth, Firestore, Storage, Hosting). `motion/react` for animations. React Router v7.

## Architecture

### Feature folders vs. pages
`src/features/` contains self-contained modules (`events/`, `profile/`, `auth/`) each with `components/`, `hooks/`, `services/`, and `types.ts`. `src/pages/` holds top-level route components that wire features together. The tournament system is large enough to live entirely under `src/pages/tournament/`.

### `*Elements.tsx` — one presentational module per page
An earlier pass split the codebase into many tiny single-consumer files; editing one page meant
opening six. Each page's **small presentational parts** now live in one `Elements` file:

| File | Holds |
|---|---|
| `src/components/FooterElements.tsx` | Every site-wide link + contact constant, and the `InstagramLink` / `WhatsAppLink` / `ContactLink` components |
| `src/pages/tournament/TournamentElements.tsx` | Error boundary, request panels, zone modals, draw selector, Manage Draw sheet |
| `src/pages/courtmap/CourtMapElements.tsx` | Filter controls, badges, map popup, both result lists |
| `src/pages/marketplace/MarketplaceElements.tsx` | Listing board + post/edit form |
| `src/pages/services/ServicesElements.tsx` | Services tab + offer form |
| `src/features/events/EventsElements.tsx` | Event card, creator form, join sheet, schedule formatters |
| `src/pages/profile/PlayerDashElements.tsx` | The Player Dash on `/profile`: switch, sections, preference sheets |
| `src/pages/profile/ProviderDashElements.tsx` | The Provider Dash on `/profile`: job queue, stats, service rail |
| `src/pages/profile/OrganizerDashElements.tsx` | The Organizer Dash on `/profile`: the organizer's queues and their events |

Rules for these files:
- **Presentation only.** Props in, callbacks out. Firestore access stays in the page's hook or
  service (`useTournament.ts`, `useCourtData.ts`, `listingService.ts`, `eventService.ts`, …).
- **Large views stay separate.** `MatchCard`, `BracketView`, `BracketAccordion`, `OpponentPanels`,
  `RRGroupCard`, `RoundRobinView` are not folded in.
- **`types.ts` stays out of them.** `features/events/types.ts` and `features/services/types.ts` are
  imported by hooks and API modules too — moving them into a component file would point a service
  at a component. Only `features/marketplace/types.ts` was folded in (into `listingService.ts`,
  its sole consumer).
- **`ContactOpponentButton` is in `src/components/`**, not `pages/tournament/` — it has six
  consumers outside the tournament.

### Comment style
Comments say **what the code does and what not to change**, in as few lines as possible. They are
not the place for the full history of a defect — that belongs in this file, under the relevant
section. Prefer one to four lines; if a rationale needs a paragraph, write the paragraph here and
leave a one-line pointer in the code.

### Tournament draw engine (`src/pages/tournament/`)
The core is `useTournament.ts` (~2000 lines), a single hook consumed only by `Tournament.tsx`. It manages:
- Live Firestore subscriptions (`onSnapshot`) for `event_participants` and `matches`
- Preview draw (client-side, in `displayMatches`) vs. generated draw (Firestore docs)
- Draw size auto-calculation: `getDrawSize(count)` in `utils.ts` — Singles and Doubles both scale 8/16/32 with participant count
- Score submission (`handleSubmitScore`), dispute Approve/Reject, Reset Score, Cancel Matches and the Group Bonus all call the one `scoreMatch` function. Every points rule and the only points writer are in `functions/lib/scoring.js` — see "Scoring is one module". Results recorded before it (including old no-shows, 1 point each) keep what they paid and are undone with the rules they were paid under.
- Winner advancement resolves the next match from loaded state (`matches` array) using normalized bracket comparison (`m.bracket ?? null`), with reconstructed doc ID as fallback.
- Participant draw visibility (`userDraw`): a participant sees the draw they are **actually placed in** — `userDraw` looks for the participant's `user_id` in a generated match and returns that match's draw. **Do not** route `userDraw` by skill: a creator can move a player across skill groups (e.g. Challengers → Masters) without changing their `event_participants` skill, and skill-derived routing would hide the draw they're really in. There is deliberately **no** pre-generation fallback — before any draw is generated there is no placement, so `userDraw` is `undefined` and `visibleDraws` shows the participant every draw. That is intended (nothing to hide pre-generation), so don't "fix" the undefined by guessing a draw from `skill_level`.

Draw document IDs follow the pattern: `{eventId}_{drawKey}_{matchId}` where `drawKey = getDrawKey(tournamentChoice, division, skillGroup)`. (The `{eventId}_reserves_{drawKey}_` LL/Lucky-Loser draw variant was a client feature with no UI consumer and was removed as dead code — nothing generates or reads `bracket: 'reserves'` docs anymore.)

### Draw pictures (`bracketImage.ts`)
Every export is one portrait 1080x1350 frame drawn by `frame()`: brand badge, tournament, division
headline, clay stage chip, zone, deadline, signed footer. `buildDrawSlides()` returns the whole set
for the **selected draw**: group cards (RR), the bracket, then the still-to-play matches. Bodies are
fixed-height `Block`s flowed by `paginate()`, so anything overrunning the body area starts another
frame rather than being squeezed, which is what turns a 32 draw into two pictures.

The bracket shows a **rolling window** of the round just finished, the round being played and the
round coming next, and only rounds whose matches exist. A played match shows its score with the
winner in clay and no contacts; an unplayed one shows contacts. The to-play frames list only
matches with a real person on **both** sides, so a `PLAYER_LOADING` slot or a BYE is skipped.

**The pictures are reached by "View Complete Draw" under the draw selector, by everyone.** Download
Draw is gone from the Manage Draw sheet. That makes the contact rule load-bearing: the slideshow
reads contacts through `useContacts` (per-uid `getDoc`, each with its own `.catch()`), **never**
through `userMap`. `userMap` batches ten ids into one `documentId() in` query and Firestore denies
the whole query if the caller may not read even one of its docs, so a player connected to two people
in a batch of ten got none of them, which is why only organizers ever saw numbers. Per-uid reads
return exactly what that viewer is allowed to see, so "contacts for the people you are playing"
falls out of the rules with no filtering and no rules change.

The badge (`public/Draw Logo.png`) is loaded and recoloured at runtime by `loadBrandMark()`: the
white surround is flood-filled from the corners to transparent (keying out all white would erase
the lettering and the ball too) and the remaining green is dropped to the page colour so the disc
blends into the frame. It must end up a `data:` URI inside the SVG. The rasteriser draws through a
canvas, which will not fetch external files, so a `/Draw Logo.png` reference comes out blank. It is
fetched rather than base64'd into source because the file is 70KB and would otherwise ship to every
visitor whether or not they open a picture.

### Round Robin (`rrGeneration.ts`)
Events with `tournament_format === 'rr'` use group-stage + knockout instead of a single bracket.

**Group formation (`buildZoneTierGroups`)** is **skill-band × zone, auto-sized**. Players are bucketed by skill band (`skillBand` in `utils.ts`: Beginners 2–2.5, Challengers 3–3.5, Masters 4–5) and then by preferred-court zone; each bucket is split by `splitEvenly(n)` — `g = ceil(n/5)` balanced groups of 3–5 (5→[5], 6→[3,3], 7→[4,3], 8→[4,4], 9→[5,4], 10→[5,5], 11→[4,4,3], 12→[4,4,4]). A draw with **≤5 total players is one group** (zone/band ignored). A lone player in a distinct zone becomes their own placeholder group **only when the draw already has >3 zone-clustered groups**; otherwise the band's players are pooled (ordered by zone) and split, folding the singleton in. Labels are `Group X · Band · Zone`, dropping the zone segment when unassigned/mixed. Group letters are positional at render (`rrGroupLabels`); a creator-renamed label (`rr_label_custom`) is shown verbatim. The preview (`previewRRGroups`) uses the same function so it matches the generated draw. NOTE: the skill-band sub-split is intentional (it supersedes the old "no `getTier`" rule); the **size algorithm is authoritative** and is never overridden by band boundaries, so the old 3+2 bug can't recur.

**Merge** — Masters + Challengers can be merged into one RR draw via the same "Merge Draws" toggle used for brackets (a merged draw has `skillGroup: 'All'`, which collects all skill levels).

**Participant visibility** — a participant sees **both skill draws in their own division** (Challengers + Masters for their gender; doubles → their own division), read-only. Creators see all draws. (`visibleDraws` in `useTournament.ts`.)

**Editing groups (creator)** — `handleSaveGroupEdit(rrGroup, newPlayers)` rewrites one group's roster; a cross-group move (including across two groups **within the same draw**) is expressed by including the moved player in the target group's `newPlayers` and omitting them from the source — the function reconciles both groups' Firestore docs atomically. There is no separate cross-*skill-draw* move action (Challengers ↔ Masters), and nothing removes a player found in two skill draws automatically: the old background dedupe could unseat a player with nobody acting and was deleted. A duplicate is fixed by hand. `handleRenameGroup` sets a custom label; `handleCreateRRGroup` spins up a new group from unplaced players ("Add Group"). Emptying a group dissolves it; a group left with one player keeps a placeholder match so the lone player stays visible and movable (never silently dropped). Moves into/out of a group with a played match are refused.

**Knockout** — the creator picks the bracket size (R4/R8/R16) via `handleGenerateRRKnockout`. Every group winner is auto-seeded (`selectGroupWinners`, ordered points → gamesWon so the top seed lands in slot 1); the remaining slots are left as `PLAYER_LOADING` for the creator to fill by hand in the draw editor (`buildRRKnockoutDocs` with `manualFill: true`, which also skips first-round bye auto-advancement). Re-selecting a size rebuilds the knockout, and is refused once any knockout match has been played. There is **no** automatic runner-up fill — that behaviour was removed along with `selectAdvancingPlayers`.

**Placement is manual. There is no "late joiner" concept.** RR still accepts registration after the draw is generated (`slotStatus` in `useJoin.ts` is bypassed for RR), but nobody is ever seated automatically. (Knockout draws are different: the join sheet records the open spot it found as `requested_match_id`/`requested_slot`, and `onParticipantSeat` in `functions/participantWorkflow.js` re-checks and seats the player in a transaction. It never seats an RR match. The same trigger registers a member doubles partner named at join, and a doubles player with no partner joins the partner pool, `partner_pool/{eventId}/members|contacts`. **That collection is being retired** (`DATA_DICTIONARY_v3.csv`): the pool becomes the event's doubles registrations with no partner (`partner_uid: ''`), which is what the partner-pool UI lists, and a rules clause lets two such players in the same event read each other's `contacts`. The feature and its `partner_pool_joined` alert stay.) Generation auto-forms the initial groups by the established hierarchy — **zone → skill → court preference** — and everyone else waits in the **unplaced list** until the organizer places them.

Two auto-placers used to fight over this and were deleted: an in-browser effect that topped up any group under 5 **ignoring band and zone**, and only ran while an organizer happened to have that draw open; and a nightly Admin script (`scripts/regroup-rr.js`, `npm run regroup:rr`) applying a *different* rule (≤3 only, matching band required). Whichever fired first won, so a player's group depended on whether a browser tab was open. Don't reintroduce either.

**Groups are capped at 5** (`RR_GROUP_MAX`). `splitEvenly` already never exceeds it when auto-forming; `overGroupCap` guards the manual paths — `handleSeatParticipant`, `handleSaveGroupEdit`, `handleCreateRRGroup` — which are now the only way anyone is seated.

**Two unplaced lists, deliberately.** `rrUnplacedPlayers` is **draw-scoped** and feeds the Add Group picker — it must stay scoped or the picker would offer another event's players. `unplacedParticipants` spans **every tournament the organizer runs** and is for awareness: each row names the event joined, so a registrant in one tournament can't be placed into another by mistake. It shows each player's zone, and **"Unassigned" when they have no Toronto zone** (no courts, or courts outside Toronto) — `effectiveZone`'s Downtown default exists for placement only, and showing it would report a choice the player never made. **It lists live *draws*, never live events.** One event runs Men's/Women's × band × zone side by side, so an event-level "has matches / final played" test both keeps registrants whose own draw was never generated (Zephyr Open's women and beginners, listed under a tournament whose men's draws were running) and hides registrants of a still-live draw the moment a *sibling* draw's final is played (Season Opener's women, after the men finished). A draw is live once it has generated matches and its own final isn't complete, and a `division`/`skill_group` of `All` matches any (merged draws). **Zone is deliberately NOT part of the draw-match test, and seating is tested in two branches.** Never placed → listed if any live draw matching their choice/division/band exists, *whatever its zone* (the organizer can seat them anywhere). Already seated → normally not listed; the one thing that brings them back is a **zone change**, i.e. every seat they hold is in another zone AND the zone they moved to already has a draw they'd belong to. Folding zone into the base match instead listed players the creator had moved across skill groups (a 3.5 seated in Masters looked "missing" from Challengers) — three real players in the Summer Gauntlet. Doubles has no zone dimension, so a placed doubles player never resurfaces.

### Recurring meetups (half-built — read before finishing it)

The event form shows a **Recurring** checkbox when Type is `Meetup`, and **nothing is stored yet**:
`recurring` lives in `EventFormState` but is deliberately absent from the `createEvent` /
`updateEvent` payloads, which list every field by hand. So the box has no effect today, and an edit
always opens it unticked. That is intentional — the sub-category field it drives is still being
built on the database side.

The intended behaviour, for whoever finishes it:

- **Recurring on** — the card shows the **next occurrence**, not the stored start date: once the
  meetup's evening passes, it reads as next week's. The weekday comes from `start_date`'s own
  weekday and needs no extra field — the two live meetups already match ("Weekly Meetups -
  Saturdays" starts Sat 2026-09-12, the Wednesdays one starts Wed 2026-09-16). **Display only:**
  `start_date` is never rewritten, so no scheduled job and no history is rewritten.
- **Recurring off** — the meetup is a **special event**. `Special Event` was removed from
  `EVENT_TYPE_OPTIONS` for exactly this reason: a one-off meetup is now how you express it. Only one
  event ever carried that type and its stored value was `Special`, not `Special Event`, so removing
  the option orphaned nothing. `League Event` was dropped at the same time and no event ever used
  it, but `isLeagueEvent` in `src/utils/eventTypes.ts` still matches the string — old or
  hand-written docs carrying it keep working, and nothing new can be created with it.
- **`isEventCurrent` needs no change.** A recurring meetup is bounded by its own `end_date` (both
  live ones run to early November), so it retires on its own and the rolling display never outlives
  the event.

### Leagues, Rallies & Matches (`src/pages/Matches.tsx`)
League Ladder standings and challenges no longer live on the Tournament page — they moved to `/matches` (`Matches.tsx`), which has a Rallies/Challenges segmented control. The **Challenges** tab uses `src/features/leagues/` (`ladderService.ts`, `useLadder.ts`, `useStandings.ts`); who may challenge whom is decided only in `useChallengeRules` (Matches and the Leaderboard both use it).
**A tournament fixture blocks a ladder challenge only while it is UNPLAYED** — that is the whole
of the double-farming risk (one physical match reported twice, once per surface). Once it has a
result, score or walkover, the pair fall back to the ordinary 3-day rematch cooldown, counted from
that match. Blocking played opponents too was leaving players with nothing to do: a tournament that
ends without its Final ever being recorded never marks itself complete, so the block never lifted. The **Rallies** tab is `src/features/rallies/` (`rallyService.ts`), the same request/accept loop for a casual match (+2/+1, no organizer step). Both live in `matches` (`category: challenge | rally`). **Never say "friendly"** (Racquets-And-Strings' rule): it is a rally, in code and on screen. `?mode=friendlies` and `/friendlies` still open the Rallies tab for old links. `src/pages/Leagues.tsx` is now pure standings/leaderboard (tournament + community boards) — it no longer renders any challenge UI, or a personal Progress panel (that moved to the Player Dash).

### Player Dash (`/profile`)
A member's own tennis in one place. A "Player Dash" switch on Profile, above Record Activity and Submit a Report, swaps
the profile card for the dash and hides Record Activity and Submit a Report. **It always starts off.** There is no route
and no header icon. Data is `src/pages/profile/usePlayerDash.ts`; presentation is
`PlayerDashElements.tsx`.

- **The layout is the Claude Design "Player Overview" mockup**: 1a below `xl`, 1c from `xl`. Take
  structure and colour from it, but sizes from the site: row buttons are `Button size="sm"` (the
  size of Record Activity and Submit a Report) and nothing is under `text-xs`. Needs you rows put Accept and Decline
  inline with the name, the way Matches to play rows carry Score, rather than 1a's full-width
  Accept. Task groups show the two closest to done; Playing preferences are chips until Edit. The
  desktop grid's `minmax(0, …)` tracks stop a long row widening its column past the page.

- **The count** beside the switch is Needs you plus Matches to play, so `usePlayerDash` is mounted
  whether the switch is on or off.
- **Needs you** is one live query, `useNeedsYou` in `usePlayerDash.ts` (`player_2_uid == me`, `status == 'open'`), plus
  `useScheduleAsks`: tournament matches whose opponent tapped Schedule (`schedule_requested`, asked
  by the other player). Those rows carry the asker's contacts and a Done button that clears the
  flag. The organizer's "Being arranged" queue was removed; organizers no longer see these.
  Bookings show here too: a still-New one with Cancel (two taps; redeemed points go to organizer
  review), and one the provider marked ready or done asks the member to confirm (see "Bookings
  and the Provider Dash"). A
  request moves into **Matches to play** once accepted (live, from `useRallies`/`useLadder`) and
  leaves it the moment either player records a score. Tournament fixtures come from
  `useUserMatches` and leave as soon as either player records a score, which counts at once.
- **Cancel** is a delete: the sender while open, **either player once accepted**, until a score is
  in. Nothing is paid before a result. The rules' `matches` delete branch carries both cases.
- **Score edits** (Head to head) are **games only, winner fixed, within 7 days**
  (`SCORE_EDIT_WINDOW_MS`), for every match type, and go through `scoreMatch` like any score: the
  player who entered the result may fix it in that window; anyone else's entry replaces it only if
  closer. Points don't move, since the winner can't change here.
- **Scoring is shared.** `features/matches/useRequestScoring.ts` owns the score sheet for Matches and
  the dash. `ScoreModal` takes a `note` (challenges and rallies count at once, so "the organizer
  will confirm it" is wrong for them) and a `lockedWinnerUid` for edits.
- **Preferences reuse the profile card's editors** — `CourtsEditor`, `SkillEditor`/`LeagueEditor`,
  `ZonePickerSheet`, `AvailabilityModal`. Don't copy their logic into the dash.
- **Moved here and removed elsewhere:** Profile's Stats panel, Upcoming list and Leaderboard button;
  the Leaderboard's Progress panel; and every challenge/rally request, accept, decline and cancel
  notification. The server no longer writes those (`onLadderChallengeDeleted` and `onRallyDeleted`
  are gone), `useNotifications` hides and marks read any left over, and the emails still send.
- **Events deep link:** `/events?event=ID` switches to that event's tab and scrolls its card
  (`id="event-<id>"`) into view. Never strip the param: changing the URL re-runs `ScrollToTop` and
  undoes the scroll.

### Organizer Dash (`/profile?dash=organizer`)

A third switch on Profile, beside Player Dash and Provider Dash and mutually exclusive with them
(`openDash` is one nullable union, not three booleans). Shown only when
`preferences.event_creator === true`. Data is `src/pages/profile/useOrganizerDash.ts`; presentation
is `OrganizerDashElements.tsx`. There is **no Claude Design mockup** for this one — it follows the
Provider Dash's idiom exactly.

It exists because an organizer's work was scattered across three pages and some of it was
unreachable. **Everything below moved here and was removed from where it used to live**, the same
"moved here and removed elsewhere" rule the Player Dash set:

| Moved here | Taken out of |
|---|---|
| Coupon refunds + task claims (`ReviewQueue`, reused as-is) | Tasks page |
| Disputed results | Matches page **and** the Tournament page |
| Recently recorded results, with Undo | (was nowhere) |
| New signups, with their activity | (was nowhere) |
| Court issue reports | (was nowhere — nothing read the collection) |
| Each of your events at a glance | (was nowhere) |

**Unplaced players is the exception: it is on BOTH.** The dash lists them for awareness and links
through; it cannot seat anyone, because seating needs `openDrawSlots` from the draw currently open
on the Tournament page. Removing the Tournament panel would leave nowhere to place anyone at all.

- **The count is only what awaits an action** — disputes + unplaced + court reports. Recently
  recorded, signups and event stats are awareness; counting them would leave the badge always lit.
- **Every read bails on `isOrganizer` before touching Firestore.** Profile mounts the hook for
  everyone because the switch shows a count, so without that guard every member pays for reads they
  can't use.
- **Recently recorded queries ASCENDING and reverses in the browser.** The deployed index
  (`matches: category + completed_at`) serves ascending only — `orderBy(..., 'desc')`, or
  `category in [...]` with a range, both fail with `FAILED_PRECONDITION`. The 7-day window caps it
  at a couple of dozen rows. Don't "tidy" this into a descending query without deploying an index.
- **Removing an unplaced player is a real withdrawal**, not a dismissal: the same soft delete the
  Tournament page uses (`removal: true`), plus `removal_reason` from three pills (Wrong zone /
  Unavailable / Other), and their name comes out of any unplayed match in that event. The confirm
  names the person and says they come off the event.
- **Undo on a recorded result** calls the one `scoreMatch` `reset` action. Two taps, never
  `window.confirm` — that is the dash idiom.
- `unplacedParticipants` was lifted out of `useTournament` into
  `src/pages/tournament/useUnplacedParticipants.ts` so both surfaces share one copy. It is a pure
  move; its `refreshKey` reproduces the original effect's `[matches, participants]` trigger and must
  not be simplified to a length or count, or the list stops refreshing after someone is seated.
- **Organizer notifications now link here** (`/profile?dash=organizer`) rather than
  `/tasks?review=…` or a per-event tournament link — `rewards.js`, `bookings.js`, `taskPoints.js`
  and `notifications.js`. Ship that functions deploy with the hosting deploy or the alerts lead
  nowhere.

`onCourtImprovementReported` (`functions/courtCounts.js`) mirrors a homepage court report into
`courts` as a `condition` entry, so it shows against the court with nobody approving it. It writes
`uid: 'no_account'`, which `onPhotoReportAwardPoints` returns early on — a stranger's report pays
nobody, deliberately. Needs `firebase deploy --only functions:onCourtImprovementReported`.

### Bookings and the Provider Dash
A member opens a job with a stringer or coach by **Book** (regular price, `bookService`) or
**Redeem** (points, `redeemReward`, which also issues the coupon). Both write a `bookings` doc; every
later step is a callable in `functions/bookings.js`, and what each step allows is
`functions/lib/bookingState.js`. Clients can only read bookings.

- **Stringing:** New (`lead`) → Racquet received (`in_progress`) → Mark ready (stamps
  `completion_requested_at`) → the member answers "Your racquet is ready for pickup. Did you collect it?" on their Player Dash. Yes
  completes it; No clears the stamp and alerts the provider and organizers. There is no
  reminder button: the member is alerted once when it is marked, and the provider can contact
  them directly (`remindBooking` was removed).
- **Coaching:** New → Confirm lesson → Mark done (stamps `completion_requested_at`) → the member
  answers "Did your lesson happen?". Yes / No work as for stringing.
- **Cancel and decline only while New:** the member cancels (Services → Your bookings, or Needs
  you on the Player Dash), the provider declines. Nothing after
  drop-off, and nothing auto-completes.
- **Points never come back on their own.** Cancelling a redeemed booking moves its coupon to
  `cancel_requested` and the booking to `refund: 'pending'`. An organizer approves (points back) or
  declines (coupon `refund_declined`, points stay spent) in the review queue, which now lives on the
  Organizer Dash (`/profile?dash=organizer`). Starting the job marks the coupon used, and `markCouponUsed`,
  `flagCoupon` and `requestCancellation` refuse any coupon with a `booking_id`.
- **A live job shows on the member's Player Dash, at every step from the provider's confirmation
  on** (Needs you). Only the confirm question carries buttons; the others are status. Every row
  carries the provider's contacts, read from `provider_uids` stamped on the booking at creation.
- **Services shows one offer per provider**, with "Show N more offers" — a stringer with five price
  tiers used to push every other provider off the screen.
- **Contacts are shared on booking**, both ways: `linkPlayers(member, provider account, 'booking')`,
  the same connection an accepted challenge creates. A provider's phone and email are read live
  from `contacts/{uid}` (`useContacts`), **never** from the offer doc: `tasks` offers are
  world-readable, so a number stored there was fetchable before booking no matter what the page
  chose to render. `contact_phone`/`contact_email` are legacy, still on four old docs, read by
  nothing. The offer form no longer collects them. A provider's button passes **no `preferred`**,
  so every channel they have filled in (phone, WhatsApp, email) is offered: they are selling a
  service, and `preferred_mode_of_contact` is about how they want to be reached for a game.
- **The provider's accounts** are the preferences docs with `stringer`/`coach` true and a matching
  `stringer_id`/`coach_id` (`providerMemberUids`). An offer with no such account can't be booked,
  and Services hides Book and Redeem when the offer has no `uid`. **Every provider is a member**:
  the offer form's Provider field is a member search, and saving flags that account, so there is no
  way to add a provider nobody can book and no separate "link an account" step. A separate
  **Business name** field carries a trading name that differs from the member's own (TIVORYX is
  Karan Tiwari); blank means they trade under their own name.
- **An offer with 0 discount and 0 points is a regular-price service** — it shows a clay pill
  reading "Regular price", or **"Free"** when the price is 0 too, and Book alone, since there is
  nothing to redeem. It is the only clay pill on the card: brands, capacity and duration stay in
  the secondary tier, because the price pill is the one that changes what the card offers. Points
  are no longer required to be positive; `MIN_REWARD_COST` is about the progress bar, not a floor
  on what may be listed.
- **Group lessons** (a coaching offer with `group_lesson: true`) are booked like any offer, with no
  size limit; `capacity` is a guide to how many fit in a group, never enforced. Members never see
  who else booked. On the Provider Dash the offer's New bookings collapse into one leads row, "N
  Players Joined", and the coach ticks players into **Group 1, 2, …** (`lesson_group` on the
  booking, status `in_progress`). The one callable is `lessonGroup` (`create`/`add`/`remove`/`done`/
  `cancel`); `startBooking` is not used for them. Removing sends a booking back to New. Mark done
  asks each member "Did your lesson happen?". The member may cancel until then, and the coach takes
  payment and refunds outside the site. **One redeemed booking at a time:** `redeem_booking_id` on
  the offer blocks Redeem for everyone else until that booking completes or is cancelled
  (`releaseRedeem`), and the coupon is only marked used when the member answers Yes, so a
  cancelled class still sends the points to the organizer's review.
- **Provider Dash:** a second switch on Profile, only for providers, never on together with the
  Player Dash. Data is `src/pages/profile/useProviderDash.ts`; presentation is
  `ProviderDashElements.tsx`, from the Claude Design "Provider Dashboard" mockup (1a below `xl`, 1b
  from `xl`) with the site's sizes. It replaced "Your shop" on Services.
- **`/profile?dash=player|provider`** opens that dash; booking notifications link there.

### Scoring is one module (read before changing)
**`functions/lib/scoring.js` holds every points rule and the only code that writes points.**
`POINTS` is the only copy of the points table; a match's type picks its row. `commitPoints` is the
single writer to `stats`. **`scoreMatch` (`functions/scoring.js`) is the only way in**, one callable
with an `action`: `record` (any match type, player or organizer; `newMatch` = an organizer records
a challenge or rally two others played), `settle` (approve or reject a disputed score),
`reset`, `cancel`, `bonus` (organizer). `src/features/matches/scoring.ts` is the client side.
**`reset` works on a tournament fixture, a challenge AND a rally**, organizer-only for all three. A
played rally/challenge is `confirmed` rather than `complete`, and resetting one puts it back to
`accepted` and clears its timestamps. Players keep the score edit (games only, 7 days) and the
dispute path; only an organizer can take a result away, from the Organizer Dash.

**No client writes a result**, not even an organizer: `firestore.rules` refuses every field in
`resultFields()` on `matches`, and all `stats` scoring fields. The server also checks the score
(sets, margins, the winner took more sets); the client and the rules no longer repeat that check.
A result also writes advancement, event completion (a played final stamps `events.completed_at`)
and a `tournament_result_audit` row in the same transaction. Alerts and task progress react to the
recorded match in their own triggers; the scoring call doesn't send them.

- **A score counts the moment it is recorded.** No organizer confirmation. Later entries:
  a *different* winner opens a dispute (`score_disputed`, `dispute_uid`, the entry kept in
  `result_submissions`) and moves nothing; the organizer is alerted (`onResultDisputed`) and
  **approves** (that score applies, points follow) or **rejects** (the recorded one stands) from the
  Disputed results panel on the Tournament and Matches pages. The *same* winner: the player who
  entered it may fix it within 7 days; anyone else's replaces it only if closer. Organizers may
  rescore anytime, except changing the winner once the next round has been played.
- **Points** (Racquets-And-Strings rules): group win 3 / loss 1; knockout loser by round (R32 1,
  R16 2, QF 3, SF 5, F 10), knockout winner 0 except the final (20). A **walkover** is
  organizer-only, tournament-only, and pays points only: group winner 1, knockout winner 0, loser
  the round's losing points, with no match played. **Challenges** +3 / −3 (never below 0);
  **rallies** +2 / +1. **No-show no longer exists** for new results.
- **Points already paid never move.** Every payment stores exactly what it paid on the match
  (`applied_deltas`; a group bonus stores `rr_group_bonus_uids`), and undoing negates exactly
  that. A payment made before this module existed is undone with the rules it was paid under
  (`legacyDeltas`: the old tournament client counted a walkover as played and paid a no-show 1
  each; old challenges stored `applied_loser_delta`). The Group Bonus is taken back only from the
  players it was paid to.
- **Display:** `computeGroupStandings` shows the points each match stored (`points_winner` /
  `points_loser`). Group matches from before this module were stamped once by
  `scripts/stamp-group-points.mjs`, which reads the same table.
- Tests: `npm run test:functions` and `npm run test:rules`, both against the emulator only
  (`demo-ttl`), via `scripts/run-emulator-tests.mjs`.

### Stats data flow (read before changing)
Points and results reach `stats/{userId}` only through `commitPoints` in `functions/lib/scoring.js`
(above). Owners edit their profile fields (`skill_level`, `league`, …); `rankSnapshot.js` writes
rank fields; nothing else writes `stats`. `tournamentsPlayed` is counted once per player per
event, at registration (`countTournamentEntry`, called by `onParticipantSeat`), not by results.

**Task progress** (`functions/taskPoints.js`, one `onMatchCompletedAwardPoints` listener) counts every
played match (`isPlayedResult` in `lib/scoring.js`): tournament matches and rallies feed "Play N
matches", challenges feed the challenge tiers, including ones an organizer records. The Tasks page
counts the same way client-side (`useTasks`).

All fields are camelCase (`matchesPlayed`, `leaguePoints26`, etc.). Snake_case and `_xlsx` fields are dead.

The rules and the group table used to be two implementations that **did drift** (the table kept
adding a +5 completion bonus long after the payout became the organizer's switch). That is why the
table now reads the points each match stored, and the rules live only in `lib/scoring.js`.

- **The RR +5 group bonus is awarded manually by the organizer, never automatically.** The "Group
  Bonus" switch in each group card calls `setGroupBonus`; completing a group's last match awards
  nothing. On pays every player in the group, off takes it back from those it was paid to.
  `rr_group_bonus_v2` on every match in the group is the switch's state, and a group may be
  awarded with unplayed matches (the organizer gets a confirm warning).
- **Doubles partners** get the captain's credit in the same payment (`partnersFor`), and undoing
  negates the stored per-player changes, partners included. `scripts/backfill-doubles-partners.mjs`
  stamped older matches with `doubles_partner_pts_v2: true`.

`functions/courtCounts.js` (`aggregateCourtCounts`, every 6h) maintains `site_stats/court_counts` — the per-court player counts shown on the public `/courts` page. It stores counts keyed by the **raw** `preferred_courts` string rather than a resolved court name, so `matchCourtName` (which needs the courts CSV) stays client-side only. `useCourtData.ts` reads that one doc and falls back to the original three full-collection reads if it's missing, so the page works before the function is deployed. Needs `firebase deploy --only functions:aggregateCourtCounts`.

The same doc also carries `activity` — `{ d7, d30 }`, each `{ byKey, byName }` — feeding the court map's **Activity** view (its own button in the map bar, cycling off / 7D / 30D, beside the two-way Members Only / All Courts toggle). It counts **events, not people**: one member who checks in, plays a match and files a report contributes 3, which is the intended reading of "how busy has this court been". Two key spaces because the sources key differently: `courts` docs already carry a slugified `court_key` (mirror of `src/utils/courtKey.ts`), while a match carries the free-text court name the scorer typed, resolved client-side by `matchCourtName` for the same reason the preference counts are. This half has **no client fallback** and cannot have a useful one: `/courts` is public and both `courts` and `matches` are `allow read: if isAuthenticated()`, so a signed-out visitor can't compute it at all. Until the function is deployed the Activity view is simply empty. The number reads **only in the map bubble**: it is deliberately absent from the court pop-up and the results list, which stay about who plays there rather than how busy it has been.

Separately, `functions/taskPoints.js` awards **per-player** Community Task tiers/points server-side (`tasks/{uid}`), and `functions/groupAwards.js` is a complementary **collective/group** bonus engine (Matchday, Hourly Coverage, Court Pioneer, Board Freshness, Full Zone Sweep) that reads across many players' documents and pays into `tasks.bonusPoints` — the two files award different things and don't overlap.

### Firestore collections
Collections were consolidated: several legacy collections were merged into `courts`, `matches`,
`tasks`, and `offers`, discriminated by a `type`/`category` field rather than by collection name,
and every owner reference was standardised to `uid`. The legacy names
(`tournament_matches`, `court_visits`, `court_attendance`, `court_reports`, `court_suggestions`,
`rallies`, `ladder_challenges`, `score_submissions`, `task_progress`, `redeemable`, `rewards`,
`group_awards`, `zone_sweeps`) are **gone** — don't reintroduce them. Pre-deletion snapshots live in
`_archive_database_consolidation/{source}/docs/{id}` (Admin SDK only).

| Collection | Written by | Notes |
|---|---|---|
| `users`, `stats`, `preferences` | Signup / profile / `profileBootstrap.ts` | doc id **is** the uid |
| `contacts` | Signup / profile | PII split out of `users` |
| `events` | Creator via event form | |
| `event_participants` | Player self-join (`useJoin.ts`) or creator (`handleAddPlayer`) | |
| `matches` | `useTournament.ts` (draws), `ladderService.ts` and `rallyService.ts` (requests); results only by `scoreMatch` | `category`: `singles` \| `doubles` \| `rally` \| `challenge` |
| `courts` | `checkinService.ts`, `photoReportService.ts` | `type`: `check-in` \| `attendance` \| `condition` \| `waiting_board` \| `queue` |
| `tasks` | `useTasks.ts`, `functions/taskPoints.js`, `functions/groupAwards.js` | progress doc per uid; `type: 'offer'` rows are the Services catalog (seeded by `scripts/seed-rewards.mjs`, **bare** doc ids — `redemptions.reward_id` and `functions/rewards.js` resolve `tasks/{rewardId}` directly, so never prefix them) |
| `offers`, `redemptions` | `functions/rewards.js` (server-only) | |
| `bookings` | `functions/bookings.js`, `functions/rewards.js` (server-only) | One job with a stringer or coach — see "Bookings and the Provider Dash" |
| `listings` | `listingService.ts` | Marketplace |
| `connections`, `public_contacts` | `functions/connections.js` (server-only) | Who may read whose `contacts` — see below |
| `task_claims` | `claimService.ts` (player), organizer review | `type`: `volunteer` \| `ambassador` \| `host`; created as `status: 'pending'`, only a creator may update |
| `notifications` | `functions/notifications.js` (server-only) | Recipient may read/mark-read/delete; clients can never create. No challenge/rally request alerts — see "Player Dash" |
| `ranking_history/{uid}/entries` | `functions/rankSnapshot.js` (weekly) | Subcollection. Public read, no client writes |
| `mailing_list` | Homepage Subscribe button and the court report form (`src/lib/newsletter.ts`) | The one mailing list; `source` is `newsletter` or `court report submission`. Two row shapes — see below. Create is open to **unauthenticated** callers; read/manage is creator-only |
| `volunteer_signups` | Homepage Volunteer form (`src/lib/volunteer.ts`) | Auto-id, one row per submission. Create is open to **unauthenticated** callers; read/manage is creator-only |
| `court_improvements` | Homepage "Report a court issue" floating button (`src/lib/courtImprovements.ts`) | Auto-id. Create is open to **unauthenticated** callers; read/manage is creator-only. Deliberately NOT a `courts` doc — `courts` is members-only and pays points |
| `site_stats` | `functions/courtCounts.js` | Named singleton docs (`court_counts`) |
| `events/{eventId}/rr_drafts/{drawKey}` | `useTournament.ts` (creator, pre-generation) | **Subcollection** — see the rules-path rule below |

### Mailing list: two row shapes, one collection

`mailing_list` is the one mailing list. The homepage Subscribe button writes `source: 'newsletter'`
and the court report form writes `source: 'court report submission'`. A row looks different
depending on who made it. The split is enforced by `firestore.rules`, not by the client, so `src/lib/newsletter.ts`
and that rule change together:

- **A signed-in member** owns exactly one row, and **the doc id is their uid**. It carries
  `uid`, `email`, `user_name`, `source`, `created_at`. Because the id is the uid, tapping
  Subscribe again overwrites that row instead of listing them twice, and the rule requires
  `subscriberId == request.auth.uid`, so nobody can write a row in another member's name.
- **A signed-out visitor** gets an anonymous auto-id row carrying only `email`, `source`,
  `created_at`. The rule's `hasOnly()` whitelist has **no `uid`** on this path, which is the whole
  reason a stranger can't forge a member row. Visitors can subscribe twice; dedupe on export.

The member path is why the button behaves differently when signed in: an account already carries
the email and name, so there is nothing to ask for and the click just subscribes. The confirmation
is a notification (`onNewsletterSubscribed`), not a toast, and the floating Subscribe button (Home,
and Profile outside the dashes) disappears once the member's own row exists — the rules let a
member `get` their own row only. Only visitors, and members whose account carries no email, see
the modal.

`newsletter_subscribers` was folded into it and removed. Don't add a second list.

**Rules are deployed by hand.** The member row path on `mailing_list` does not exist for the client until
`firebase deploy --only firestore:rules` runs — until then every subscribe fails with a permission
error, which the UI reports as "Could not sign you up just now."

### One dropdown, site-wide

`SelectField` (`src/components/SelectField.tsx`) is the app's dropdown: a field-shaped trigger that
opens a `Sheet` of options. It is **not** a native `<select>`, deliberately — a native popup ignores
the theme on several platforms, its rows sit far under the 44px tap target, and it cannot carry a
hint line under an option.

It wears the same `field` recipe as `Input`, exported from `src/components/Input.tsx` so the string
lives in one place. A dropdown therefore lines up with the inputs beside it automatically; change
`field` and both move together.

No native `<select>` remains in `src/`; every dropdown is a `SelectField`. Don't add a native one
back, and don't hand-roll another dropdown.

### Contact details are opponent-only
The app deliberately carries **no in-app messaging** — it shares phone/email/WhatsApp instead. So
`contacts/{uid}` has to be readable by someone, but only by the person you're actually arranging a
game with. `contacts` read is allowed for: the owner, an organizer, someone holding a
**connection**, and someone with a `public_contacts` marker.

`connections/{uidA__uidB}` is written **only** server-side: by the `onMatchConnection` trigger, on an
accepted rally/challenge or a tournament fixture, and by the booking callables when a member books a
provider. An *open* request earns nothing — otherwise anyone could
harvest a number by firing off a challenge nobody answers. The doc id is the two uids sorted and
joined with `__`; `pairId()` exists in both `functions/connections.js` and `firestore.rules` and
**the two must stay identical** or every contact read starts failing.

`public_contacts/{uid}` is the marketplace carve-out: posting a listing *is* an invitation to be
contacted by a stranger, and rules can't ask "does this user have a listing". `onListingContact`
maintains the marker and deletes it when their last listing goes.

Consequence for any new code: **a denied `contacts` read is normal, not an error.** Always
`.catch()` each read individually — never wrap a batch in one `Promise.all().then()`, because the
connection doc lands a moment *after* a request is accepted, and one denial would otherwise reject
every contact on the page.

`users` must never carry `email`/`phone`/`whatsapp_contact` again — it is `allow read: if true`,
so anything there is public to the entire internet, signed in or not.

**Which channels are offered is decided in exactly one place: `contactChannels()` in
`ContactOpponentButton.tsx`.** It reads `contacts.preferred_mode_of_contact`, a **string array** of
`'email' | 'text' | 'whatsapp'` set by the three always-visible "Contact Method" switches on the
profile card. Empty or absent means *no preference* and every channel the member has filled in is
offered — **not** "email only". The preference only ever *narrows*; a channel with no detail behind
it is never offered, so a preference alone can't make someone contactable, and a preference naming
only channels they've since removed falls back to showing everything rather than nobody.

The field keeps its singular name purely so it stays inside `ownerContactFields()` and needs no
rules deploy. `TournamentPlayer` deliberately carries **no** contact fields: `contact` and
`preferredContact` were derived from the old single-value form, constructed at four call sites, and
read by nothing.

**Organizers are per event** (Racquets-And-Strings ADR-001). An event is managed by the super admin,
its `creator_id` and its `organizer_ids`: `isCreatorOfEvent` in the rules, `isOrganizer(uid, event)`
in `functions/lib/roles.js`, `isEventManager` in `src/utils/eventTypes.ts` — change all three
together. New events list only their creator; only the super admin may change `creator_id` or
`organizer_ids` (there is no assignment screen yet). Work that belongs to no event (rallies, claims,
coupons, bookings) still goes to any `event_creator` account plus the super admin (`organizerUids`).
`scripts/assign-ladder-organizers.mjs` listed the existing organizers on the League Ladder at the
switch.

Security rules (`firestore.rules`): owners can only update `skill_level / tournament_preference / name / uid / league` in `stats` — scoring fields are organiser-only. `event_creator` in `preferences` can only be set by the super-admin UID (`7PvfzNtDmsOq5GLMieId7QRT7wH3`). Rules require `firebase deploy --only firestore:rules` to take effect — a git push alone does not deploy them.

Storage rules (`storage.rules`) also require a manual deploy — `firebase deploy --only storage`, or paste into Firebase Console → Storage → Rules → Publish. A git push alone does not deploy them.

### Security rules: hard rules
Because the client talks to Firestore directly, **`firestore.rules` *is* the API layer.** There is no
server in between. Five rules follow from that, all learned from real defects:

**Rules do not cascade into subcollections.** A `match /events/{eventId}` block does *not* cover
`events/{eventId}/rr_drafts/{drawKey}`; that path needs its own nested `match`, or every read and
write is denied by default. This bit for months: the rules declared a *top-level* `/rr_drafts/{id}`
that could never match the subcollection the client writes, and because the `onSnapshot` error path
sets the draft to `null` it failed **silently** — not one draft saved in that entire period, and the
only surviving draft state was four stale top-level docs from before the move (since migrated to the
nested path). The rule now sits at `events/{eventId}/rr_drafts/{drawKey}`. When you add a
subcollection, add its rule at the full nested path and **verify a write actually lands**.

**Whitelist writable fields with `hasOnly()`, never blacklist with `!hasAny()`.** A blacklist permits
every field you didn't think of — including writing PII into a world-readable doc. `contacts` and
`tasks` do this correctly (`ownerContactFields()`, `ownerTaskFields()`); copy that pattern.

**A UI role toggle grants nothing.** Admin / creator / provider views are switched by a flag on
`preferences` in the same session — no separate login. That flag decides what is *rendered*. Every
privileged action behind those views must **also** be enforced in `firestore.rules` or inside a
callable Cloud Function, or a user flips the flag in devtools and writes to Firestore directly,
bypassing the UI entirely. Treat the toggle as cosmetic and the rules file as the boundary.

**Server-only collections stay server-only.** `connections`, `public_contacts`, `notifications`,
`offers`, `redemptions`, `bookings`, `site_stats` and `ranking_history` are all `allow write:
if false` for clients and written by Cloud Functions. A client that could write `connections` could
grant itself anyone's phone number. Don't "temporarily" open one to ship a feature — add a callable.

**Provider role fields are the super admin's.** `stringer`, `stringer_id`, `coach` and `coach_id` on
`preferences` make an account a provider: it reads that provider's bookings and gets connected to
every member who books. Owners can't set or change them (`providerRoleFields()`). The check uses
`keys()`/`affectedKeys()`, not equality, because most preferences docs don't carry these fields and
comparing a missing field errors, which would block every profile edit. `isProviderFor` also needs
the matching flag and a non-empty id: an empty id used to match every member without one.

**The deployed rules may not be the repo rules.** Deployment is manual, so before trusting anything
in `firestore.rules`, diff it against Firebase Console → Firestore → Rules. Same for `storage.rules`,
whose own header warns that deploying **replaces** the console copy.

### Never ship a secret to the client
`vite.config.ts` `define:` performs a literal text substitution at build time — anything put there is
compiled into the JavaScript every visitor downloads. `VITE_FIREBASE_*` values are fine (they are
public identifiers by design; security comes from the rules). Any real credential is not: call it
from a Cloud Function and keep the key server-side. `vite.config.ts` now carries **no `define:`
block at all** — `GEMINI_API_KEY` used to be inlined there with no consumer anywhere in `src/`.
Don't reintroduce one.

### Production is the only environment (almost)
There is no staging project and no emulator config, so `npm run dev` and every Admin SDK script in
`scripts/` read and write **production data**. There are also no backups — no scheduled Firestore
export and no PITR — so a bad write is permanent. Run admin scripts with `--dry-run` first, and
treat any destructive one-off as unrecoverable until backups exist.

The one exception is a **local** emulator run: `VITE_USE_EMULATORS=true npx vite --port 3010` points the
client at the auth/firestore/functions/storage emulators (`src/lib/firebase.ts`, off by default, so
`npm run dev` and production are untouched). It exists for flows that need two accounts signed in at
once — the booking lifecycle needs a member and a provider — and it exposes `window.__emulatorAuth`
so a seeded uid can be signed in with a custom token. Start the emulators with
`FUNCTIONS_DISCOVERY_TIMEOUT=120`, or loading `functions/index.js` times out at the default 10s and
no callable is served. Use `localhost` (not `127.0.0.1`) for the emulator hosts or every callable
fails CORS against a `localhost` page origin.

### Auth flow
`AuthContext.tsx` calls `ensureUserProfileDocuments` (`profileBootstrap.ts`) on every login to guarantee `users/stats/preferences` docs exist. The `profile` object (`UserProfile` type) bundles all three docs and is consumed throughout the app via `useAuth()`.

**OAuth sign-in lives in one place.** `useOAuthSignIn.ts` holds the whole flow (popup → redirect fallback on `popup-blocked`, the `getRedirectResult` mount effect, profile bootstrap, and the `account-exists-with-different-credential` linking hand-off). `useGoogleSignIn.ts` and `useAppleSignIn.ts` are thin wrappers that only bind a provider, a `providerId`, and a `credentialFromError`; they keep their original return names (`handleGoogleSignIn` / `handleAppleSignIn`) so `Signup.tsx` is unchanged. `getOAuthSignInErrorMessage` in `authMessages.ts` is the same story for the error copy. Both hooks mount their own `getRedirectResult` effect and filter on `providerId`, so each ignores the other's result — don't "simplify" that filter away. Add a new provider by adding a wrapper, never by copying the hook.

### Text colour: two tiers, never grey
Every piece of text uses the `--color-fg` token, which is **#143D34 dark green in light theme and
#ffffff white in dark theme**. There are exactly **two** tiers and no others:

| Tier | Class | Use for |
|---|---|---|
| Content | `text-fg` | Names, values, headings, body copy — anything the user is actually reading |
| Secondary | `text-fg/70` | Small uppercase tile labels, captions, helper lines, muted icons |

**Never introduce a dimmer tier** (`text-fg/50`, `/40`, `/30`, …). Dark green at 40% on a white
card is a pale grey that members reported as unreadable — the whole app was swept to these two
tiers for exactly that reason, so a new `text-fg/40` silently reopens the bug.

**Never hardcode a colour that ignores the theme** — no `text-white`/`text-gray-*`/`bg-gray-*` for
foreground or surfaces. White text is invisible on a light card. Use `text-fg` and `bg-fg/5`.
(`text-white` is fine *only* on a filled clay/coloured button, where the background is fixed.)

**Disabled is a state, not a colour tier.** Keep `text-fg/70` and add `opacity-50` to the control.
Fading text toward the card background is what made disabled controls vanish in light theme.

**Placeholders are text too.** They take the secondary tier, `placeholder-fg/70`: never
`placeholder-gray-*`, which ignores the theme, and never a dimmer step like `placeholder-fg/30`.
Tailwind's own default is 50% of the text colour, so `index.css` resets bare inputs to 70%.

**Status colours use the badge tokens, never raw palette classes.** `--color-badge-win`,
`--color-badge-loss` and `--color-badge` (`src/index.css`) flip between themes; `text-green-300`,
`text-red-400`, `text-amber-300` and friends do not, and wash out to near-invisible on the light
theme's near-white surfaces. That is what made success banners unreadable — `AlertMessage` carries
every banner in the app and had hardcoded exactly those three. Use `text-badge-win` (success/win),
`text-badge-loss` (error/loss/destructive), `text-badge` (warning), and `text-clay` for the brand
accent (required asterisks, actionable hints). Tinted **backgrounds and borders** at 10–20% are fine
either way; it is the **text** that fails.

**Lime (`--color-lime`, `--color-lime-press`) is the support-CTA accent and nothing else.**
It exists for Donate, Subscribe to Newsletter and Volunteer with Us, so those read as a different
tier from the clay Join/primary actions. Its label is always `text-ink` (fixed dark green), never
`text-fg`: the fill is light in **both** themes, so `text-fg` would be white-on-lime in dark.
Ink on lime measures ~9.5:1 dark and ~5.5:1 light. Don't reach for lime for anything else, and
don't use clay for a support CTA.

Check every change in **both** themes.

### The homepage is the design-system reference

`/` (`src/pages/Home.tsx` + `src/pages/home/HomeElements.tsx`) was rebuilt to the design spec the
rest of the app has **not** been swept to yet. When you touch another page, match the homepage —
don't match its neighbours, and don't copy an old pattern from a page that hasn't been swept.

| Rule | On the homepage | Elsewhere today |
|---|---|---|
| Control height | 44px (`h-11` on buttons, `min-h-11` on tappable rows) | mostly 30–40px |
| Control radius | `rounded-2xl` only | 10 different radii |
| Focus | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay` on everything focusable | no focus styles at all |
| Smallest text | `text-xs` (12px) | ~160 sites below 12px |
| Type sizes | section `text-2xl`, sub `text-lg`, body `text-sm` — plus **one** display exception, the hero `text-3xl` | five heading sizes |
| Cards | fill only (`bg-fg/5`), no border | borders and 28 opacity steps |
| Banners | `AlertMessage` | 13 hand-rolled copies |

Two things are deliberately **not** done yet, and both are one-pass changes when the wider sweep
lands: homepage cards use `bg-fg/5` rather than `bg-tennis-surface` (page and card are the same
`#143D34` today, so a `tennis-surface` card is invisible — splitting those tokens changes every
surface in the app), and the CTA fill strings in `HomeElements.tsx` mirror `Button`'s `lime`/`clay`
variants because Donate and Volunteer are links and an `<a>` can't be a `<button>`.

### One name per thing
Several features carried two names for the same idea, with the old one kept alive "for now". Each
became a bug. The surviving pairs are listed here; **don't add another.**

- **Zone requests are `req_zone_change` + `new_zone`.** The old `zone_change_requested` /
  `zone_change_requested_at` names are gone from the rules' player-write whitelist; nothing writes
  or reads them. **There are now two zone paths and they are deliberately different.** The
  tournament page's "Request Zone Change" is per-event and *notify-only* — the organizer moves the
  player by hand. The profile card's Zone section (`updatePreferredZone`) writes
  `preferences.preferred_zone` directly and is not event-scoped, so a member can change it with no
  organizer in the loop. **A zone change keeps every match with a real opponent** — the player
  keeps playing all of those. The one thing it gives up is an old-zone draw where **none** of
  their matches has a real opponent (alone in a group, or opposite Player Loading/BYE) and none is
  played: `onZoneChanged` blanks those slots to Player Loading, the same blanking a removal does,
  re-checked in a transaction. Both paths write `preferred_zone`, and `onZoneChanged`
  (`functions/zoneMoves.js`) sends the organizers of every live singles tournament the player is
  in **one alert per change** (there used to be a second, duplicate alert from the request flag),
  saying what it gave up and what to do: if the new zone already has a generated draw they'd
  belong to, they appear in Unplaced Players for that zone, to be placed by hand; otherwise
  nothing is needed — `preferred_zone` routes them in when that draw is generated.
  There is deliberately **no** auto-seating in any case. This is why
  `unplacedParticipants` tests seating **per draw**, not per event: a zone-changer is seated in
  their old draw and unseated in the new one, and only the second fact matters. A hand-picked zone
  also sets `preferred_zone_manual`, which stops a later court edit silently recomputing
  `preferred_zone` and moving them between draws.
  Needs `firebase deploy --only functions:onZoneChanged`.
- **Results are `winner_uid` + absolute `set_N_player_1/2`,** for tournament matches, challenges and
  rallies alike. `claimed_winner_*` and `score_line` are legacy and no longer written; the Cloud
  Functions read new-name-first with a legacy fallback so deploy order can't stop points being paid.
  Strip the old fields only after functions **and** hosting are deployed.
- **Genuinely irreducible duplicates** — these cross a language boundary and cannot share code, so
  they stay hand-synced: `functions/lib/points.js` ↔ `taskCatalog.ts` (what the server pays vs what
  the client promises), and `pairId()` in `functions/connections.js` ↔ `firestore.rules` (writes the
  connection doc vs reads it to permit a `contacts` read — if these ever disagree, every contact
  read in the app starts failing).

### Defect notes (detail compressed out of code comments)
Each of these was a real bug. The code carries a one-to-four line warning; the reasoning is here.

**Zones**
- **`effectiveZone` maps a missing `zone` onto the default zone.** Zones went live mid-event, so
  groups generated before that carry no `zone`. They were briefly kept as a separate zone-less
  draw — which put the running groups outside the zone list and matched every participant to two
  draws, doubling every "N signed up" count. They are Downtown-Midtown draws, not a fourth category.
  That default is for **matches only**. Players have none: `zoneBucketFor` sends a player whose
  courts give no Toronto zone (a non-Toronto court) to the always-on **Unassigned** draw, and courts
  are required to join a zoned tournament. A zone-less player who already holds a seat takes that
  seat's zone (`zoneMap` in `useTournament`), so the change moved nobody already in a draw.
- **`currentMatches` MUST filter on `zone`.** Every destructive path (reset, cancel, regenerate)
  iterates it. Without the zone term, two zone draws in the same division/skill are
  indistinguishable, and resetting one zone deleted the other zone's matches and reversed those
  players' league points.
- **Winner advancement must normalize `zone` too.** Template match ids (M1, M5, …) are identical
  across zone draws, so without it `matches.find` can write the winner over a real player's slot
  in the *other* zone — silently, and reported as success.
- **There is no cross-draw dedupe.** It was the one path that could unseat a player with nobody
  acting; if the slot was then refilled they lost their place with no record why, so it was
  deleted. The duplicate it guarded against is real — fix the cause, don't silently delete a
  player mid-event.
- **`zones.ts` geometry:** the DVP and Hwy 404 are spliced into one polyline (as two, they left a
  wedge that North York and its neighbours both claimed — the visible overlap). The east-edge road
  chain is re-binned at ~300m to drop intersection loops. Hwy 407 isn't in the Centreline dataset,
  so Steeles Ave stands in.

**Removing a player**
- The trash icon in Edit Draw records a **walkover for the opponent** in each of the player's
  unplayed, generated matches in that draw (a real opponent only; Player Loading and BYE slots are
  just blanked), then marks their registrations `removal: true`. Matches already played are
  untouched. Walkovers go through `scoreMatch` first, because the server refuses a result once a
  side is blank.
- Removal purges them from the **whole event**, not just one group: any match doc still listing
  them keeps reconstructing their name on the group card, and lets the late-joiner effect re-seat
  them the moment they look "unplaced but registered".
- It also **deregisters them from `event_participants`** — that doc is what routes a player into a
  draw by skill, so while it exists they can be auto-placed into a *different* draw.
- The withdrawn-list update goes in the **same batch** as the match-doc changes. Written
  separately, the matches change reaches `onSnapshot` before the withdrawal's round trip finishes,
  and the just-removed player is re-seated — persisting across a reload.

**Scoring**
- **`completed_at` is pinned to first scoring.** Re-editing a complete match used to overwrite it
  with "now", corrupting anything sorted by it (streaks, months active, best finish). Edits stamp
  `score_edited_at` instead.
- **The RR +5 bonus checks its own stamp before paying and before reversing.** It used to pay
  automatically on the last match completing, keyed off `status !== 'complete'` — which only means
  *this* match was unscored, so a corrected match re-confirmed paid a second +5 while a later reset
  removed only 5, leaving a permanent surplus. It is now an organizer button, but the stamp is
  still the only thing standing between a double payout and a phantom deduction.
- **A blank `winner_uid` must be rejected.** It completes the match displaying player 2 as winner,
  credits player 1 with a loss, awards nobody a win, and writes an empty uid into the next round.
- **A result is paid inside the same server transaction that reads the match.** Two submissions
  fired close together (a mobile double-tap) used to each read a pre-confirm world and both apply
  ±3 — winner +6, loser −6, and those phantom points are spendable on Services. `recordScore`
  reads the match, compares it with what it already paid, and pays in one transaction.

**Effects and writes**
- **The merge-inference effect must key on `[matches, statsMap]`.** Inside the matches snapshot
  callback, `statsMap` is a stale `{}` closure, so every band lookup returns 0 and the inference
  silently falls back to Challengers+Masters.
- **Late-joiner placement re-reads the authoritative placement immediately before writing.**
  Deciding "who is unplaced" from a stale in-memory derivation duplicated already-placed players.
- **`useTasks` never retries a failed task write.** Clearing `written` in `.catch()` turned a
  rules-rejected write into an endless render→write→reject spin — the Profile page flicker.
- **`groupAwards` Matchday query is bounded to a ±36h ISO window.** It used to read every completed
  match in the league on every completion — quadratic, and the first query here to time out.
- **Board Freshness is `onDocumentCreated`, not `onDocumentUpdated`.** Reports auto-approve and
  `firestore.rules` forbids updates, so the old trigger waited for a transition that can never
  happen; those bonuses were never once paid.

**Matches page**
- The three exclusive filters allocate in order of how constrained each pool is, **not** display
  order: Nearby has the smallest candidate set, so it picks first or ends up empty while its people
  sit in Most matches. Each filter claims a block wider than the 10 it shows, so the weekly refresh
  and the dice have spares to draw from and the visible sets still can't overlap.

### Change discipline
Fix exactly what is asked. Do not bundle adjacent cleanup, refactors, or new files into a stated request. If you notice something else broken, mention it in one sentence at the end and wait to be asked.
