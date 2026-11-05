# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server on port 3000
npm run build        # rebuild programs-tennis.csv, production build → dist/, then the SEO pages
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

### SEO pages at build (`scripts/build-seo-pages.mjs`)
The app renders in the browser, so before this step every URL served the same `index.html`: one
title, and a canonical pointing at `/` that told Google every page was a copy of the homepage. After
`vite build`, the script copies `dist/index.html` once per public route (`courts.html`,
`newsletter/1/unspoken-rules.html`, …) with that page's title, description, canonical and Open Graph
tags, and puts the page's text in `<main id="static-content">` inside `#root`. React's `createRoot`
replaces it on mount. It also writes `sitemap.xml`. Hosting serves them through `cleanUrls`.

- **Text comes from the app's own data**, never a second copy: the homepage `FAQ` and `ABOUT_TABS`
  are read out of their `.tsx` files by name (`literalFrom`), so they must stay plain literals that
  reference no other identifier. `newsletter/issues.ts` is imported whole, and the court counts come
  from `functions/courts.json`. A new public page needs an entry in `pages` and its URL left out of
  the `firebase.json` rewrites.
- **Each static title must equal that page's `document.title`**, or Google sees two titles.
- **Signed-in routes** are listed in the `firebase.json` rewrite regex and get `app.html`
  (`noindex`, no canonical). **Every other URL gets `404.html`** with a real 404 status. Nothing else
  falls back to the app, so add any new route to the regex or it will 404. `/rules` and
  `/how-it-works` are 301s.
- **No page per court or area** (owner, 2026-10-30: the site is not a court database). `/courts`
  lists location counts per zone and city only.
- **Structured data:** `FAQPage` on `/` and `Article` on each Served Up article (author from the
  issue's "Words" credit, dated the 1st of its month), alongside the site-wide Organization block in
  `index.html`. `Event` is added in the browser by `Events.tsx` for current public events (no
  private events, no ladder; a weekly meetup as its next date), located as the city of Toronto,
  since events name no court. **`/llms.txt`** is generated from the same data; its wording was
  approved by the owner, so change it only on request.
- `/login` and `/signup` are deliberately **not** in `robots.txt`: Google had indexed `/login`, and
  it can only drop it once it may crawl the page and see `noindex`.

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
| `src/pages/newsletter/NewsletterElements.tsx` | Served Up (`/newsletter`): masthead, front-page boxes, item pages, the crossword. An issue is an entry at the top of `newsletter/issues.ts` plus its images in `public/newsletter/img/`. An article with `event` (an events id) opens `/events?event=ID` from the front page instead of its article. The super admin gets arrows on every cropped photo to move its focus, saved in `newsletter/{issue}.focus` (keyed by file name) and read by everyone; the meme is never cropped |

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
- Live Firestore subscriptions (`onSnapshot`) for `event_participants`, `matches` and the event's applied `submissions` (`useEventResults`)
- Preview draw (client-side, in `displayMatches`) vs. generated draw (Firestore docs)
- Draw size auto-calculation: `getDrawSize(count)` in `drawGenerator.ts` — Singles and Doubles both scale 8/16/32 with participant count
- Score submission (`handleSubmitScore`), Reset Score, Cancel Matches and the Group Bonus all call the one `scoreMatch` function. Every points rule and the only points writer are in `functions/lib/scoring.js` — see "Scoring is one module". A match doc carries only `status` and `winner_uid`; its sets, walkover, points and who entered it are its applied `submissions` entry, read only through `src/features/matches/results.ts`.
- Winner advancement is server-side, inside the scoring transaction (`nextTarget` in `functions/lib/scoring.js`): the next match is found among the event's matches in the **same draw** (`sameDraw`: `sub_category`, `division`, `skill_group`, `zone`) by `next_match_id`, and the side by `next_slot`, else by sibling order (the number in `match_id`; matches carry no `position`).
- Participant draw visibility (`userDraw`): a participant sees the draw they are **actually placed in** — `userDraw` looks for the participant's `uid` in a generated match and returns that match's draw. **Do not** route `userDraw` by skill: a creator can move a player across skill groups (e.g. Challengers → Masters) without changing their `event_participants` skill, and skill-derived routing would hide the draw they're really in. There is deliberately **no** pre-generation fallback — before any draw is generated there is no placement, so `userDraw` is `undefined` and `visibleDraws` shows the participant every draw. That is intended (nothing to hide pre-generation), so don't "fix" the undefined by guessing a draw from `skill_level`.

**Organizers can open a player's profile from the draw:** `Tournament.tsx` provides
`PlayerLinkContext` (in `MatchCard.tsx`) only when `isCreator`; `PlayerName` renders a name as a
link to `/players/:uid` then, and plain text otherwise. Guests, BYE and Player Loading never link.

**Player View:** a page-level switch above the Matches cards, shown to a manager (organizer or
super admin) who plays in a live tournament. On, the cards keep only the tournaments they play in,
and `useTournament(eventId, playerView)` sets `isCreator` false for those, so every control and draw
filter that gates on `isCreator` shows the participant's view. Display only; rules and callables
still treat them as an organizer.

**One draw at a time, on a wheel** (`DrawTabs`, organizers and players alike): there is no tree. The
draw's name without its zone ("Men's Masters") sits between previous / next arrows that loop round
every level (a level is a draw across its zones: Men's Masters → Men's Challengers → Women's … →
back). Changing level swings the name out along an arc and the next one in from the other side
(`motion/react`, a plain fade under reduced motion); only the selected name is visible and nothing
turns on its own. "N signed up" sits under the name. Only **live draws** are on the wheel (`liveDraws` in
`useTournament`): someone registered (`drawCounts` > 0) or matches generated. The selected draw is
one `drawKey` (`selectedDrawKey`) that carries over between tournaments, so it can name an empty
draw (Men's Beginners in a zone nobody plays in, after the merged Invitational swallowed the real
one); `currentDraw` then resolves to the first live draw. `DrawTabs` takes `draws`, `selected`
and `onSelect`. In a **private** tournament a draw merging all three bands
has no skill level, so it is named "Men's Invitational" / "Women's Invitational" (`effectiveDraws`)
instead of after its top band; the draw key is unchanged. For an organizer, a level that runs in more than
one zone gets zone pills above the name, each with its count. A player (`playerMode`, i.e.
`!isCreator`) steps only through their own league in `playerZones` (their zone plus any zone they
hold a match in; doubles always stays) and never sees zone pills; a player in two draws (Masters and
Challengers) has both on the wheel, each marked "My Draw". View Draw (clay, the Submit a Report
button) and the Groups / Knockout switch sit centred under it. Their match card sits under those buttons: no header,
`bg-fg/5` while to play, `bg-fg/10` once played, a lime tint for a walkover. The knockout draw is the
round-by-round `BracketAccordion` on every screen size, the RR knockout included; `BracketView`'s grid
is no longer rendered.

Draw document IDs follow the pattern: `{eventId}_{drawKey}_{matchId}` where `drawKey = getDrawKey(tournamentChoice, division, skillGroup, zone)` (no zone segment for the default zone; `tournamentChoice` comes from the match's `sub_category` via `choiceOfMatch`). Don't change the pattern: the RR group bonus award id is rebuilt from it (`drawKeyOf` in `lib/scoring.js`, `groupBonusAwardId` in `utils.ts`). Every match is `category: 'tournament' | 'challenge' | 'rally'` with `sub_category: 'singles' | 'doubles'`; a fixture is created `accepted` and becomes `complete` when scored. (The Lucky-Loser `reserves` variant was removed; matches have no `bracket` field.)

### Seeding (`placeSeededDraw`, `groupSeeds` in `drawGenerator.ts`)
**Ranking.** `seedCompare` / `playerSeedCompare` order players by `leaguePoints`, then `matchesPlayed`, then name, for every draw. Merged draws are no exception: the old "strongest band first" and "Women's and Mixed before Men's" orders are gone. A doubles team ranks by its higher-ranked partner (`leadUid`). A guest has no stats, so the registering player counts.

**Knockout lines.** Template slots are draw lines, and the first round pairs them 1v2, 3v4, …. Where players go is `placeSeededDraw`'s job, not the template's. The old 32 template paired 1v32, 2v31 in order, which put seeds 1 and 2 together in R16.

| Draw | Seeds | Lines |
|---|---|---|
| 2/4/8 | 2 | seed 1 → line 1, seed 2 → the last line |
| 16 | 4 | + seeds 3/4 by lot on lines 5 and 12 |
| 32 | 8 | + seeds 3/4 by lot on lines 9 and 24; seeds 5–8 by lot on lines 8, 16, 17 and 25 |

- **Byes** go opposite seed 1, then seed 2, and so on. Byes left over after the seeds go to unseeded players at random.
- **First-round opponents:**
  - **Every opponent, seed or not:** same zone (`preferred_zone`) first.
  - **No same-zone player left:** the player whose preferred court is nearest (smallest distance between any two of their `preferred_courts`).
  - **No court resolves:** anyone.
  - **Doubles** uses the higher-ranked partner's zone and courts.
- **The lot is a seeded random**, keyed on event + draw + entrant uids (`seededRng`). Every viewer sees the same preview, and Generate writes exactly that arrangement. It reshuffles only when entrants change.
- The organizer still moves anyone: through the preview slot edit before generation, and Edit Draw after.

**Round robin.** Group formation is unchanged (zone × band). Each group's top two by the same ranking are seeded (its top one in a group of 2–3). Every seeded player in the draw is then numbered 1, 2, 3… by league rank, so seed 1 is the draw's top-ranked player: four groups give seeds 1–8. Once generated, a number belongs to the player. Moving them to another group never changes it, and neither a group edit nor a new group re-seeds anyone.

**Frozen seeds.** Generate writes `events.seeds[drawKey]` (uid → seed); the RR knockout goes under `${drawKey}__knockout`. A late joiner is unseeded. Cancel Matches clears both keys. Draws generated before seeding have none.

The seeds live on the event, not on the match docs. Server advancement (`nextTarget`) would otherwise have to copy the seed into every later round. `PlayerName` reads them through `SeedContext` and shows "(1) Name". The group cards and the draw pictures show the same.

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

**The pictures are reached by "View Draw" under the draw selector, by everyone.** Download
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

### Round Robin (`drawGenerator.ts`)
Events with `sub_category === 'rr'` use group-stage + knockout instead of a single bracket (their matches carry `format: 'rr'`; group matches are `round: 'RR'`).

**Group formation (`buildZoneTierGroups`)** is **skill-band × zone, auto-sized**. Players are bucketed by skill band (`skillBand` in `utils.ts`: Beginners 2–2.5, Challengers 3–3.5, Masters 4–5) and then by preferred-court zone; each bucket is split by `splitEvenly(n)` — `g = ceil(n/5)` balanced groups of 3–5 (5→[5], 6→[3,3], 7→[4,3], 8→[4,4], 9→[5,4], 10→[5,5], 11→[4,4,3], 12→[4,4,4]). A draw with **≤5 total players is one group** (zone/band ignored). A lone player in a distinct zone becomes their own placeholder group **only when the draw already has >3 zone-clustered groups**; otherwise the band's players are pooled (ordered by zone) and split, folding the singleton in. Labels are `Group X · Band · Zone`, dropping the zone segment when unassigned/mixed. **`group_label` is the group's identity** and is always filled (`'knockout'` on knockout matches, `'challenge'`/`'rally'` elsewhere): it is stored verbatim at generation, groups are ordered by the index in their `match_id` (`rr_g{n}_m{pos}`), and nothing re-letters them at render. The preview (`previewRRGroups`) uses the same function so it matches the generated draw. NOTE: the skill-band sub-split is intentional (it supersedes the old "no `getTier`" rule); the **size algorithm is authoritative** and is never overridden by band boundaries, so the old 3+2 bug can't recur.

**Merge** — Masters + Challengers can be merged into one RR draw via the same "Merge Draws" toggle used for brackets (a merged draw has `skillGroup: 'All'`, which collects all skill levels). Generate saves which bands a merged draw holds in `events.skill_merges[drawKey]` (knockout and RR alike), and the page reads the merge **only** from there. It is never guessed from the players' bands: the guess let one misplaced player flip the merge (October Slam 2026's merged draw held a Beginner and a Masters player, read as all three bands, and hid the real Masters draw). Draws generated before the field existed were saved once by `scripts/backfill-skill-merges.mjs`. Cancel Matches clears the key.

**Participant visibility** — a participant sees **both skill draws in their own division** (Challengers + Masters for their gender; doubles → their own division), read-only. Creators see all draws. (`visibleDraws` in `useTournament.ts`.)

**Editing groups (creator)** — `handleSaveGroupEdit(rrGroup, newPlayers)` rewrites one group's roster; a cross-group move (including across two groups **within the same draw**) is expressed by including the moved player in the target group's `newPlayers` and omitting them from the source — the function reconciles both groups' Firestore docs atomically. There is no separate cross-*skill-draw* move action (Challengers ↔ Masters), and nothing removes a player found in two skill draws automatically: the old background dedupe could unseat a player with nobody acting and was deleted. A duplicate is fixed by hand. `handleRenameGroup` overwrites `group_label` on the group's matches (or the draft's `labels` before generation), and is refused while the group's bonus is on, because the award id is built from the label; `handleCreateRRGroup` spins up a new group from unplaced players ("Add Group"). Emptying a group dissolves it; a group left with one player keeps a placeholder match so the lone player stays visible and movable (never silently dropped). Moves into/out of a group with a played match are refused.

**Knockout** — the creator picks the bracket size (R4/R8/R16) via `handleGenerateRRKnockout`. Every group winner is placed automatically: `selectGroupWinners` picks them, they are ranked by league rank (`playerSeedCompare`), and they go on the seed lines (see "Seeding", no zone pairing); the remaining slots are left as `PLAYER_LOADING` for the creator to fill by hand in the draw editor (`buildRRKnockoutDocs` with `manualFill: true`, which also skips first-round bye auto-advancement). Re-selecting a size rebuilds the knockout, and is refused once any knockout match has been played. There is **no** automatic runner-up fill — that behaviour was removed along with `selectAdvancingPlayers`.

**A one-group round robin names its winner.** With one group and no knockout there is no final, so
the group card offers the organizer **Select Group Leader as Winner** once every match is recorded.
The leader is the table's own order (points, then games won); teams level on both are the
organizer's pick from a dropdown. `scoreMatch` `champion` (`groupChampion` in `lib/scoring.js`)
writes `events.champions[drawKey]` (`uids` with doubles partners, `name`, `awarded_at`, `awarded_by`).
It is a **title only, no points**. A named winner counts as that draw's final for event completion,
results in the group are locked until it is taken back, and Take back deletes the key and clears
`completed_at`. The Player Dash shows it as Champion.

**Placement is manual. There is no "late joiner" concept.** RR still accepts registration after the draw is generated (`slotStatus` in `useJoin.ts` is bypassed for RR), but nobody is ever seated automatically. **Knockout is the same now.** A player who joins after a knockout draw is generated waits in Unplaced Players. The old server seating (`seatJoiner`) was removed after October Slam: it filled bye slots whose player had already advanced, and it treated a merged draw (`skill_group: 'All'`) as accepting any band. It seated a Masters joiner in a Beginners+Challengers draw, which made the page re-guess that merge as all three bands and hide the Masters draw. (`onParticipantSeat` in `functions/participantWorkflow.js` recounts the member's entries, registers a member doubles partner named at join (the partner gets their own row pointing back), and handles the **partner pool**, which is not a collection: it is the event's active doubles registrations with `partner_uid: ''`. A new one is connected (`reason: 'partner_pool'`) to everyone already looking in that division, so they can read each other's `contacts`, and those players get `partner_pool_joined`.) Generation auto-forms the initial groups by the established hierarchy — **zone → skill → court preference** — and everyone else waits in the **unplaced list** until the organizer places them.

**A registration is never deleted by a member** (`src/features/events/registrations.ts`). It is
withdrawn (`status: 'withdrawn'`) and set active again on the same row when they rejoin, by Join or
an organizer's Add Player; the rules let an owner make exactly those two changes, and only managers
delete. **A member withdraws themselves** (organizers and the super admin too) with the trash on their
Player Dash event row (before or after generation), their own group row, or under Your Match, picking
a reason from the same pills as the Organizer Dash. `withdrawFromEvent` (`eventService.ts`) first
concedes each unplayed match with a real opponent as a walkover (`scoreMatch` lets a player record a
walkover **for their opponent** in an unplayed match), then withdraws every registration they hold
in the event. A slot with no real opponent can't be blanked by a client, so it stays for the
organizer, who is alerted (`organizer_player_withdrew`, from `onParticipantSeat`).

Two auto-placers used to fight over this and were deleted: an in-browser effect that topped up any group under 5 **ignoring band and zone**, and only ran while an organizer happened to have that draw open; and a nightly Admin script (`scripts/regroup-rr.js`, `npm run regroup:rr`) applying a *different* rule (≤3 only, matching band required). Whichever fired first won, so a player's group depended on whether a browser tab was open. Don't reintroduce either.

**Groups are capped at 5** (`RR_GROUP_MAX`). `splitEvenly` already never exceeds it when auto-forming; `overGroupCap` guards the manual paths — `handleSeatParticipant`, `handleSaveGroupEdit`, `handleCreateRRGroup` — which are now the only way anyone is seated.

**Two unplaced lists, deliberately.** `rrUnplacedPlayers` is **draw-scoped** and feeds the Add Group picker — it must stay scoped or the picker would offer another event's players. `unplacedParticipants` spans **every tournament the organizer runs** and is for awareness: each row names the event joined, so a registrant in one tournament can't be placed into another by mistake. It shows each player's zone, and **"Unassigned" when they have no Toronto zone** (no courts, or courts outside Toronto) — `effectiveZone`'s Downtown default exists for placement only, and showing it would report a choice the player never made. **It lists live *draws*, never live events.** One event runs Men's/Women's × band × zone side by side, so an event-level "has matches / final played" test both keeps registrants whose own draw was never generated (Zephyr Open's women and beginners, listed under a tournament whose men's draws were running) and hides registrants of a still-live draw the moment a *sibling* draw's final is played (Season Opener's women, after the men finished). A draw is live once it has generated matches and its own final isn't complete, and a `division`/`skill_group` of `All` matches any (merged draws). **Zone is deliberately NOT part of the draw-match test, and seating is tested in two branches.** Never placed → listed if any live draw matching their choice/division/band exists, *whatever its zone* (the organizer can seat them anywhere). Already seated → normally not listed; the one thing that brings them back is a **zone change**, i.e. every seat they hold is in another zone AND the zone they moved to already has a draw they'd belong to. Folding zone into the base match instead listed players the creator had moved across skill groups (a 3.5 seated in Masters looked "missing" from Challengers) — three real players in the Summer Gauntlet. Doubles has no zone dimension, so a placed doubles player never resurfaces.

### Event kinds and recurring meetups

An event is `category` + `sub_category`: `singles_tournament` / `doubles_tournament` (`rr` |
`knockout`), `ladder` (`challenge`), `social` (`meetup` | `special`), `coaching_clinic`
(`one_off`). The form's Type (`EVENT_TYPE_OPTIONS`: Tournament, League Ladder, Meetup, Coaching
Clinic) plus format, Singles/Doubles and Recurring map onto them in `categoryOf`
(`eventService.ts`). A tournament is singles **or** doubles, never both. Dates are Timestamps: a
date input saves `start_date` at 00:00 and `end_date` / `join_last_date` at 23:59:59 local.
Managers are `organizer_ids` only.

The **Recurring** checkbox (Type `Meetup`) is stored as the sub-category:

- **Recurring on** → `sub_category: 'meetup'`, a weekly meetup (`isRecurringWeekly`). The card and
  the homepage show the **next occurrence** (`nextOccurrence` in `EventsElements.tsx`): today's
  counts until the day is over, then it reads as next week's. The weekday is `start_date`'s own
  weekday, so no extra field. **Display only:** `start_date` is never rewritten, so no scheduled
  job and no history is rewritten.
- **Recurring off** → `sub_category: 'special'`, a one-off. That is how a special event is made;
  there is no separate Type for it.
- **Private Event** (a checkbox, every type) is the boolean `private`, **not** a `sub_category`
  value: `sub_category` already carries the tournament format and the meetup's recurrence. The
  card shows an "Invitation Only" pill instead of Join, and `firestore.rules` lets only the event's
  managers create its registrations (Add Player). Absent on older events = not private.
- **`isCurrentEvent` needs no meetup case.** A weekly meetup is bounded by its own `end_date`, so
  it retires on its own and the rolling display never outlives the event.

### Leagues, Rallies & Matches (`src/pages/Matches.tsx`)
League Ladder standings and challenges no longer live on the Tournament page — they moved to `/matches` (`Matches.tsx`), which has a Rallies/Challenges segmented control. The **Challenges** tab uses `src/features/leagues/` (`ladderService.ts`, `useLadder.ts`, `useStandings.ts`); who may challenge whom is decided only in `useChallengeRules` (Matches and the Leaderboard both use it).
**A tournament fixture blocks a ladder challenge only while it is UNPLAYED** — that is the whole
of the double-farming risk (one physical match reported twice, once per surface). Once it has a
result, score or walkover, the pair fall back to the ordinary 3-day rematch cooldown, counted from
that match. Blocking played opponents too was leaving players with nothing to do: a tournament that
ends without its Final ever being recorded never marks itself complete, so the block never lifted. The **Rallies** tab is `src/features/rallies/` (`rallyService.ts`), the same request/accept loop for a casual match (+2/+1, no organizer step). Both live in `matches` (`category: challenge | rally`, `sub_category: 'singles'`): `open` → `accepted` or `declined` (the recipient) → `complete` once scored; the result is a `submissions` entry like any other. A request carries `division` (both players' league normalised to Men's/Women's when they agree, else `Mixed`) and `skill_group` (the lower band), written by the client services and the server's `newMatch` alike (`pairDivision`/`pairSkillGroup` in `src/utils/skillLevels.ts` ↔ `pairDraw` in `lib/scoring.js` — change together). **Stale requests close themselves:** a rally open, or accepted and unscored, for 30 days becomes `played` (no score, no points, left out of match history), and a challenge open for 40 days becomes `declined`, counted from `created_at` — `closeStaleRequests` (`lib/scoring.js`), run at the start of the Tuesday `weeklyReminders`. There is no "propose a played tournament match as a challenge" conversion. **Never say "friendly"** (Racquets-And-Strings' rule): it is a rally, in code and on screen. `?mode=friendlies` and `/friendlies` still open the Rallies tab for old links. **Away members** are hard-coded in `AWAY_UIDS` (`Matches.tsx`), with no field and no label: Wan Eizzul since
2026-10-23. They are left out of the Challenges and Rallies lists only (filtered at the `mixFor` input, never in
`divisionRanked`, which is also the rank lookup); leaderboards, history and points are untouched. Their
unplayed requests were closed by hand (rallies `played`, challenges `cancelled`). Bringing someone back is
removing their uid. `src/pages/Leagues.tsx` is now pure standings/leaderboard (tournament + community boards) — it no longer renders any challenge UI, or a personal Progress panel (that moved to the Player Dash).

**Matches is switched by cards, not tabs:** a 3-per-row grid that wraps (never a sideways scroll), one card per live tournament you're in, then Challenges (the league ladder's own image, read from `imagePath` since `fetchEvents` moves a gs:// path there) and Rallies (`public/matches/Rallies.webp`, cropped from the top so its printed title doesn't show). `Tournament` draws the row (it owns the event list) and takes Matches' two cards as `extraCards`; with `showDraw` false it renders only the row, so the tournament bundle now loads on every tab. A tournament card carries a clay "Tournament" pill, the event's photo (`events.image`, a trophy without one) and "Title · N Matches": for a player, every match they're in there with two real sides; for a manager outside Player View, "N Matches Left", every match still to play before the event is done (not complete, not cancelled, not a bye; later rounds waiting on a winner count). Both come from the status query it already runs. A completed tournament opened from History has no card but still renders. Tapping a tournament card scrolls to Your Match, ringed in clay. Challenges and Rallies read "New Players Available" until that tab is opened, after the Thursday pool refresh or when a request arrives (`matches_opened_{mode}_{uid}` in localStorage, this device only).

### Player Dash (`/profile`)
A member's own tennis in one place. A "Player Dash" switch on Profile, above Record Activity and Submit a Report, swaps
the profile card for the dash and hides Record Activity and Submit a Report. There is no route
and no header icon. **Which dash opens:** `?dash=` wins; otherwise Profile opens the dash (Player, Provider,
Organizer) with the most action items, a tie going to Player, and the card when every count is 0. The counts
arrive from several live reads, so the pick re-runs for the first 5 seconds and stops then, or on any switch
tap, so acting inside a dash never swaps it away. Data is `src/pages/profile/usePlayerDash.ts`; presentation is
`PlayerDashElements.tsx`.

- **The layout is the Claude Design "Player Overview" mockup**: 1a below `xl`, 1c from `xl`. Take
  structure and colour from it, but sizes from the site: row buttons are `Button size="sm"` (the
  size of Record Activity and Submit a Report) and nothing is under `text-xs`. Needs you rows put Accept and Decline
  inline with the name, the way Matches to play rows carry Score, rather than 1a's full-width
  Accept. Task groups show the two closest to done; Playing preferences are chips until Edit. The
  desktop grid's `minmax(0, …)` tracks stop a long row widening its column past the page.

- **The count** beside the switch is Needs you plus Matches to play, so `usePlayerDash` is mounted
  whether the switch is on or off.
- **Needs you** is one live query, `useNeedsYou` in `usePlayerDash.ts` (`player_2_uid == me`,
  `status == 'open'`). There is no schedule-ask: the Schedule button and its rows are gone, and
  players arrange a fixture through each other's contacts. Bookings show here too: a still-New one
  with Cancel (two taps; redeemed points go to organizer review), and one the provider marked ready
  or done asks the member to confirm (see "Bookings and the Provider Dash"). A request moves into
  **Matches to play** once accepted (live, from `useRallies`/`useLadder`) and
  leaves it the moment either player records a score (the match turns `complete`). Tournament
  fixtures come from `useUserMatches` and leave as soon as either player records a score, which
  counts at once.
- **Cancel** is a delete: the sender while open, **either player once accepted**, until a score is
  in. Nothing is paid before a result. The rules' `matches` delete branch carries both cases.
- **Score edits** (Head to head) are **games only, winner fixed, within 7 days**
  (`SCORE_EDIT_WINDOW_MS`), for every match type, and go through `scoreMatch` like any score: the
  player who entered the result may fix it in that window; anyone else's entry replaces it only if
  closer. Points don't move, since the winner can't change here.
- **Scoring is shared.** `features/matches/useRequestScoring.ts` owns the score sheet for Matches,
  the dash and the Tournament page (an organizer's `organizer` target enters both players' games from
  player 1's side, may enter a walkover and gets Reset). `ScoreModal` takes a `note` (challenges and rallies count at once, so "the organizer
  will confirm it" is wrong for them) and a `lockedWinnerUid` for edits.
- **Preferences reuse the profile card's editors** — `CourtsEditor`, `SkillEditor`/`LeagueEditor`,
  `ZonePickerSheet`, `AvailabilityModal`. Don't copy their logic into the dash.
- **Moved here and removed elsewhere:** Profile's Stats panel, Upcoming list and Leaderboard button;
  the Leaderboard's Progress panel; and every challenge/rally request, accept, decline and cancel
  notification. The server no longer writes those (`onLadderChallengeDeleted` and `onRallyDeleted`
  are gone), `useNotifications` hides and marks read any left over, and the emails still send.
- **The Community Member Initiation checklist is on `/tasks` only.** It used to sit on the profile
  card, collapsible, shown until seven items were ticked and hidden once `setupComplete` landed;
  removed 2026-10-13 at the owner's request. It is **not** in any dash — the dash's task groups are
  `CATEGORIES` from `taskCatalog.ts`, and `INITIATION` is a separate export — so a new member now
  meets the checklist only by visiting Tasks. The 25 setup points pay exactly as before.
- **Events deep link:** `/events?event=ID` switches to that event's tab and scrolls its card
  (`id="event-<id>"`) into view. Never strip the param: changing the URL re-runs `ScrollToTop` and
  undoes the scroll.

### Organizer Dash (`/profile?dash=organizer`)

A third switch on Profile, beside Player Dash and Provider Dash and mutually exclusive with them
(`openDash` is one nullable union, not three booleans). Shown only to organizers
(`isOrganizerProfile`: the super admin, or `organizer` in `providers/{uid}.roles`). Data is `src/pages/profile/useOrganizerDash.ts`; presentation
is `OrganizerDashElements.tsx`. There is **no Claude Design mockup** for this one — it follows the
Provider Dash's idiom exactly.

It exists because an organizer's work was scattered across three pages and some of it was
unreachable. **Everything below moved here and was removed from where it used to live**, the same
"moved here and removed elsewhere" rule the Player Dash set:

| Moved here | Taken out of |
|---|---|
| Points refunds + task claims (`ReviewQueue`) | Tasks page |
| Disputed results (every `submissions` entry with `status: 'disputed'`) | Matches page **and** the Tournament page |
| Recently recorded results, with Undo | (was nowhere) |
| New signups, with their activity | (was nowhere) |
| Court issue reports (`courts` reports, `sub_category: 'condition'`, last 7 days, signed-out ones included) | (was nowhere) |
| Each of your events at a glance | (was nowhere) |
| Record a completed booking | (was nowhere) |

**Unplaced players is the exception: it is on BOTH.** The dash lists them for awareness and links
through; it cannot seat anyone, because seating needs `openDrawSlots` from the draw currently open
on the Tournament page. Removing the Tournament panel would leave nowhere to place anyone at all.

- **The count is only what awaits an action** — disputes + unplaced + court reports + pending
  claims + pending refunds. Recently recorded, signups and event stats are awareness; counting them
  would leave the badge always lit.
- **Every read bails on `isOrganizer` before touching Firestore.** Profile mounts the hook for
  everyone because the switch shows a count, so without that guard every member pays for reads they
  can't use.
- **Recently recorded is the newest 50 played results, of any age**, 10 shown with "Show N more".
  It orders `submissions` by `completed_at` desc with **no other filter**, so it rides the
  single-field index; adding a `status` filter needs a composite desc index
  (`firestore.indexes.json` has ascending only). Applied, non-walkover entries are picked in the
  browser, reading pages of 100 until it has 50, then joined to their matches. An oldest-first
  query with a limit dropped the newest results once a week passed the limit.
- **Removing an unplaced player is a real withdrawal**, not a dismissal: the same soft delete the
  Tournament page uses (`status: 'withdrawn'`, `withdrawn_at`, `withdrawn_by`), plus
  `withdrawn_reason` from three pills (Wrong zone / Unavailable / Other → `wrong_zone` |
  `unavailable` | `other`). It never touches a match: an unplaced player holds no seat. The
  confirm names the person and says they come off the event.
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

The homepage "Report a court issue" button opens the same report flow as Submit a Report and
writes a `courts` report directly — signed-out reports are allowed and carry `uid: 'not_a_member'`,
`user_name: 'anonymous'`. The task and award triggers never pay that uid (a zone sweep still
counts the court as covered), so a stranger's report pays nobody, deliberately; an email a signed-out reporter leaves joins `mailing_list`
(`source: 'court report submission'`).

### Bookings and the Provider Dash
A member opens a job with a stringer or coach by **Book** (regular price, `bookService`) or
**Redeem** (points, `redeemReward`). Both write a `bookings` doc (`payment: 'price' | 'points'`);
a redeemed one also raises `stats.pointsSpent` and carries its coupon code (`redemption_code`,
`RS-XXXX-XX`) — there is no separate coupon or redemption doc. Every later step is a callable in
`functions/bookings.js`, and what each step allows is `functions/lib/bookingState.js`. Clients can
only read bookings (the member, the provider — `provider_id` is the provider's uid — and organizers).
The catalog is `services` (bare slug ids; `service_id` on the booking).

- **Stringing:** New (`lead`) → Racquet received (`in_progress`) → Mark ready (stamps
  `completion_requested_at`) → the member answers "Your racquet is ready for pickup. Did you collect it?" on their Player Dash. Yes
  completes it; No clears the stamp and alerts the provider and organizers. There is no
  reminder button: the member is alerted once when it is marked, and the provider can contact
  them directly (`remindBooking` was removed).
- **Coaching:** New → Confirm lesson → Mark done (stamps `completion_requested_at`) → the member
  answers "Did your lesson happen?". Yes / No work as for stringing.
- **Record a completed booking** (Organizer Dash → Bookings): a booking that happened, entered by
  an organizer as member, provider, service, how it was paid and the date. `recordBooking`
  (`bookings.js`) writes it straight to `completed` with `created_at`, `started_at` and
  `completed_at` all on that date (local noon), links the two (`linkPlayers`, as a real booking
  does) and adds 1 to `booking_count`. It is a record, not a job: **nobody is notified, and no
  points move** even when marked Redeemed — `payment: 'points'` and `points` say how it was paid,
  but `pointsSpent` is untouched and there is no coupon code. Only active services are offered.
- **Cancel and decline only while New:** the member cancels (Services → Your bookings, or Needs
  you on the Player Dash), the provider declines. Nothing after
  drop-off, and nothing auto-completes.
- **Points never come back on their own.** Cancelling or declining a booking paid by points sets
  `refund: 'pending'`. An organizer approves (`refund: 'approved'`, `pointsSpent` lowered) or
  declines (`refund: 'declined'`, points stay spent) with `reviewRedemption`, from the review queue
  on the Organizer Dash (`/profile?dash=organizer`), which lists bookings `cancelled` with
  `refund: 'pending'`; `reviewed_by` records who decided. Every other booking carries
  `refund: 'none'`.
- **A live job shows on the member's Player Dash, at every step from the provider's confirmation
  on** (Needs you). Only the confirm question carries buttons; the others are status. Every row
  carries the provider's contacts, read from `contacts/{provider_id}`.
- **Services shows one offer per provider**, with "Show other options" — a stringer with five price
  tiers used to push every other provider off the screen. **Which offer leads** (`byCategory` in
  `useServices.ts`): a stringer's **most booked**, cheapest on a tie; a coach's **free** class (price,
  discount and points all 0). The count is `services.booking_count`: every booking ever made, Book
  or Redeem, never taken back on cancel. `bookService` and `redeemReward` add 1 in the transaction
  that creates the booking; it has to live on the service because visitors can't read other people's
  bookings. Providers can't write it (rules), the offer form creates it at 0, and
  `scripts/backfill-service-booking-counts.mjs` seeded it from the bookings that existed. A **free**
  card shows "Free" as its price and no price pill.
- **Contacts are shared on booking**, both ways: `linkPlayers(member, provider account, 'booking')`,
  the same connection an accepted challenge creates. A provider's phone and email are read live
  from `contacts/{uid}` (`useContacts`), **never** from the offer doc: `services` is
  world-readable, so a number stored there would be fetchable before booking no matter what the
  page chose to render. Services carry no contact fields; keep it that way. A provider's button passes **no `preferred`**,
  so every channel they have filled in (phone, WhatsApp, email) is offered: they are selling a
  service, and `preferred_mode_of_contact` is about how they want to be reached for a game.
- **A provider is a member whose `providers/{uid}.roles` holds `stringer` or `coach`**, and their
  provider id is their uid (`providerIdFor` / `providerMemberUids` in `functions/lib/roles.js`).
  A service's `provider_id` without that role can't be booked ("This provider isn't taking bookings
  yet"), and Services hides Book and Redeem on your own offer. **Every provider is a member**: the
  offer form's Provider field is a member search, and saving merges the role into
  `providers/{uid}` (`flagProvider` in `servicesApi.ts`), so there is no way to add a provider
  nobody can book and no separate "link an account" step. Only the super admin may grant roles.
  **A provider adds, edits and removes their own offers** from the same form (FAB and pencil on
  Services): Provider is locked to them, Business name and Area come pre-filled from their
  `providers` doc, and Type offers only their role's category (coach → Coaching, stringer →
  Stringing). Saving writes only `providers/{uid}.name`/`area`, never roles; the rules check
  `provider_id` is theirs, the role matches the category, and leave `redeem_booking_id` alone.
  Price is required; discount and points are optional (blank = 0). Profiles show a Stringer /
  Coach tag among the badges (`providerTags`). A separate
  **Business name** field is stored as `providers/{uid}.name`, a trading name that differs from the
  member's own (TIVORYX is Karan Tiwari); blank means they trade under their own name.
- **An offer with 0 discount and 0 points is a regular-price service** — it shows a clay pill
  reading "Regular price" (none when the price is 0 too: the headline already says "Free"), and
  Book alone, since there is nothing to redeem. It is the only clay pill on the card: brands, capacity and duration stay in
  the secondary tier, because the price pill is the one that changes what the card offers. Points
  are no longer required to be positive; `MIN_REWARD_COST` is about the progress bar, not a floor
  on what may be listed.
- **Group lessons** (a coaching service with `sub_category: 'group'`; one-to-one is `private`) are booked like any offer, with no
  size limit; `capacity` is a guide to how many fit in a group, never enforced. Members never see
  who else booked. On the Provider Dash the offer's New bookings collapse into one leads row, "N
  Players Joined", and the coach ticks players into **Group 1, 2, …** (`lesson_group` on the
  booking, status `in_progress`). The one callable is `lessonGroup` (`create`/`add`/`remove`/`done`/
  `cancel`); `startBooking` is not used for them. Removing sends a booking back to New. Mark done
  asks each member "Did your lesson happen?". The member may cancel until then, and the coach takes
  payment and refunds outside the site. **One redeemed booking at a time:** `redeem_booking_id` on
  the service blocks Redeem for everyone else until that booking's member answers Yes or it is
  cancelled (`releaseRedeem`), and a cancelled class still sends the points to the organizer's
  review.
- **Provider Dash:** a second switch on Profile, only for providers, never on together with the
  Player Dash. Data is `src/pages/profile/useProviderDash.ts`; presentation is
  `ProviderDashElements.tsx`, from the Claude Design "Provider Dashboard" mockup (1a below `xl`, 1b
  from `xl`) with the site's sizes. It replaced "Your shop" on Services.
- **`/profile?dash=player|provider`** opens that dash; booking notifications link there.

### Scoring is one module (read before changing)
**`functions/lib/scoring.js` holds every points rule and the only code that writes points.**
`POINTS` is the only copy of the points table; a match's type picks its row. `commitPoints` is the
single writer of league points to `stats`. **`scoreMatch` (`functions/scoring.js`) is the only way
in**, one callable with an `action`: `record` (any match type, player or organizer; `newMatch` = an
organizer records a challenge or rally two others played), `settle` (approve or reject a disputed
score; takes the `matchId`, the server finds the disputed entry), `reset`, `cancel`, `bonus`
(organizer). `src/features/matches/scoring.ts` is the client side.
**`reset` works on a tournament fixture, a challenge AND a rally**, organizer-only for all three,
and puts the match back to `accepted` with `winner_uid: ''`. Players keep the score edit (games
only, 7 days) and the dispute path; only an organizer can take a result away, from the Organizer
Dash.

**Results live in `submissions`, one doc per scoring action, kept forever.** `sub_category` is the
action (`result` | `correction` | `walkover` | `reset`) and `status` its standing: `applied` (the
current result), `superseded` (replaced or reset), `disputed` (names a different winner, awaiting
an organizer), `rejected` (ruled against). A match's result is its one `applied` entry that is not
a `reset`; it carries `winner_uid`/`winner_name`, the absolute `set_N_player_1/2`, `court`,
`points_winner`/`points_loser` and `completed_at`. The match keeps only `status`
and `winner_uid`. The history of a match is its chain of entries (`replaces_id`); there is no
separate audit collection. A `correction` replaces the applied entry, which turns `superseded`; a
`reset` supersedes it and records the negated points on its own entry.

**No client writes a result**, not even an organizer: `submissions` is `allow write: if false`,
the `matches` rules create every match with `winner_uid: ''` and let a client change `status` only
to accept or decline an open request, and every `stats` points/counter field is server-only. The
server also checks the score (sets, margins, the winner took more sets); the client and the rules
no longer repeat that check. A result also writes
advancement and event completion in the same transaction. **An event is complete when every draw in
it has played its final**: `recordScore` stamps `events.completed_at` only on the last one, and
undoing a final (`resetScore`) clears the stamp. It used to stamp at the *first* final, and
`isCurrentEvent` retires an event the moment the stamp exists, so Zephyr Open dropped off the
list in Oct 2026 with three finals still to play. **Every surface that says an event is finished reads `completed_at`**: the Events Completed tab,
History, the Tournament page's status, the challenge-block check and the Organizer Dash. None may
test "a final was played" itself; that was the first-final rule again. A draw with no final yet (RR groups before the
knockout) keeps the event open; a draw that is abandoned is caught by the 30-day long stop after
`end_date`. That long stop retires an overrunning tournament too, so an event running more than a
month past its `end_date` needs the date moved, not just its finals played. Alerts, task progress and match visits react to the new entry in their own triggers;
the scoring call doesn't send them.

- **A score counts the moment it is recorded.** No organizer confirmation. Later entries:
  a *different* winner is written as a `disputed` entry and moves nothing; the organizer is alerted
  (`onResultDisputed`) and **approves** (that entry is applied, points follow) or **rejects** (it
  turns `rejected`, the recorded one stands) from Disputed results on the Organizer Dash. The *same*
  winner: the player who entered it may fix it within 7 days; anyone else's replaces it only if
  closer, otherwise it is kept as `superseded`. Organizers may rescore anytime, except changing the
  winner once the next round has been played.
- **Points** (Racquets-And-Strings rules): group win 3 / loss 1; knockout loser by round (R32 1,
  R16 2, QF 3, SF 5, F 10), knockout winner 0 except the final (20). A **walkover** is
  tournament-only, entered by an organizer or conceded by a withdrawing player, and pays points only: group winner 1, knockout winner 0, loser
  the round's losing points, with no match played. **Challenges** +3 / −3 (the loss never takes a
  player's `leaguePoints` below 0); **rallies** +2 / +1. There is no no-show.
- **Points already paid never move.** Every applied entry stores what it paid (`points_winner` /
  `points_loser`, the challenge loss as actually applied after the floor), and undoing reverses
  exactly that: `paidBy` rebuilds the payment from those points and the sets (matches, wins,
  games), with doubles partners from the registrations, through the same `paymentOf` that pays. The
  Group Bonus is an `awards` doc whose `awardees` are exactly who it paid; turning it off, or
  cancelling the draw, takes it back only from them.
- **Display:** `computeGroupStandings` shows the points each result entry stored (`points_winner` /
  `points_loser`), never a recomputation.
- Tests: `npm run test:functions` and `npm run test:rules`, both against the emulator only
  (`demo-ttl`), via `scripts/run-emulator-tests.mjs`.
- **TODO: add a test for rally draws** in `functions/test/scoring.test.js`: level sets record with no
  winner, pay +1/+1, count as played without breaking a streak, and a draw overrides a win (and a
  win can't replace a draw from the other player).

### Stats data flow (read before changing)
`stats/{uid}` is one doc per member: the scoring record, the task counters (the old `tasks`
progress docs) and `pointsSpent` (the old `offers`). Who writes what:

| Fields | Writer |
|---|---|
| `leaguePoints`, `matchesPlayed`, `wins`, `pointswon`, `totalPointsPlayed` | `commitPoints` only (results and the RR group bonus) |
| Task counters (`challengesPlayed`, `courtsVisited`, `boardPhotos`, streaks, `active_months`/`monthsActive`, claim counters, …) and `rsPoints` | `functions/taskPoints.js`, `groupAwards.js` |
| `eventsJoined`, `tournamentsPlayed` | `recountEntries` (`lib/scoring.js`, from `onParticipantSeat`): **recounted** from active registrations, never incremented |
| `pointsSpent` | `rewards.js` (redeem, refund approval) |
| `rankPosition`, `rankTrend`, `rankMove`, `rankUpdatedAt` | `rankSnapshot.js` (weekly) |
| `skill_level`, `league`, `name`, and the five self-reported booleans (`profilePhoto`, `profileComplete`, `whatsappGroup`, `followSocial`, `tagPost`) | the owner; an organizer may only take a boolean back |

A new stats doc must start every counter at 0 (`zeroCounters` in the rules). There is no `loses`
(losses = `matchesPlayed − wins`), and a walkover is not a played match, so it moves points only.

- **`leaguePoints` is the current season**: results + the RR group bonus + half of last season
  carried in. `leaguePointsPrev` is last season's final `leaguePoints`; `league_seasons/{uid}_{season}`
  holds each finished season (`league_points`, `carried_in`, `season_points`).
  **Season rollover is not built.** Nothing in `functions/` or `scripts/` writes it yet. When it is,
  for each member it must, in one pass: write `league_seasons/{uid}_{season}` from the closing
  `leaguePoints` (`carried_in` = the half brought in, `season_points` = the rest), set
  `leaguePointsPrev` to the closing `leaguePoints`, and reset `leaguePoints` to half of it (the
  carry-over). The redeemable balance formula below depends on exactly that shape. The only
  `league_seasons` rows today are the 2025 season, loaded from `data/2025League.xlsx` at conversion.
- **`rsPoints`** = task tiers reached + the initiation bonus + every `awards` doc with
  `sub_category: 'task'` naming the member. It is **recomputed, never incremented**:
  `rsPointsPatch` (`lib/points.js`) runs in the same transaction as every counter change, and
  `onSelfReportedTask` reruns it when a self-reported boolean flips. Tiers are not stored: one is
  reached when its counter reaches `need`.
- **Redeemable balance** = Σ `league_seasons.season_points` + `leaguePoints` − `leaguePointsPrev` ×
  0.5 + `rsPoints` − `pointsSpent` (`readBalance` in `rewards.js`, mirrored by
  `useRedeemablePoints`). The carried half counts once. Redeeming never touches the earning
  fields, so leaderboards and match history are unaffected.

**Task progress** (`functions/taskPoints.js`) reacts to a match's first applied `result` entry
(`isPlayedResult` in `lib/scoring.js`; not a correction, not a walkover): streaks and active months
for both players, and challenge counters for a challenge, including ones an organizer records.
`matchesPlayed` ("Play N matches") is paid by `commitPoints` with the result and counts tournament
matches, challenges and rallies alike. The Tasks page reads the same counters and `rsPoints`
(`useTasks`, catalog in `taskCatalog.ts`).

All fields are camelCase (`matchesPlayed`, `leaguePoints`, etc.). `leaguePoints26`, `loses`,
`bonusPoints` and the snake_case and `_xlsx` fields are dead.

**Parked, not built: `counter_drift`.** The v3 design (`DATA_DICTIONARY_v3.csv`) has a weekly recount that
rebuilds every `stats` counter from its sources (matches, visits, claims, awards), stores any member/field
whose stored value differs in `site_stats/counter_drift`, alerts the super admin, and writes nothing until
the super admin taps Apply on the Organizer Dash. The super admin wants to revisit it before it is built.

**Future work: skill belongs in `preferences`.** A member's skill level (`skill_level`) is stored on
`stats` today, beside the scoring record, although it is a self-reported playing preference like
league, courts and zone. The super admin wants it added to `preferences`. That means a v3 shape change:
the field in `DATA_DICTIONARY_v3.csv`, the owner whitelist in `firestore.rules`, `profileBootstrap.ts`,
the profile and Player Dash editors, every reader (draw banding, seeding, `pairDraw`/`pairSkillGroup`,
`newMatch`) and a backfill from `stats`. Decide whether `stats.skill_level` then goes or stays as a copy.

The rules and the group table used to be two implementations that **did drift** (the table kept
adding a +5 completion bonus long after the payout became the organizer's switch). That is why the
table now reads the points each result entry stored, and the rules live only in `lib/scoring.js`.

- **The RR +5 group bonus is awarded manually by the organizer, never automatically.** The "Group
  Bonus" switch in each group card calls `setGroupBonus`; completing a group's last match awards
  nothing. On writes `awards/rr_group_bonus_{eventId}_{drawKey}_{slug(group_label)}`
  (`category: 'rr_group_bonus'`, `sub_category: 'league'`) and pays every player in the group
  `leaguePoints`; off deletes it and takes the points back from its `awardees`. **The switch is on
  exactly while that doc exists** — nothing on the matches records it. A group may be awarded with
  unplayed matches (the organizer gets a confirm warning).
- **Doubles partners** get the captain's credit in the same payment (`partnersFor`, from the
  event's active doubles registrations and their `partner_uid`), and undoing negates the stored
  per-player changes, partners included.
- **`awards` holds every bonus**, one doc per award with a deterministic id and `awardees` as the
  exactly-once guard: `matchday`, `hourly_coverage`, `pioneer`, `board_new` (Board Freshness),
  `zone_sweep`, `explorer` (`sub_category: 'task'`, paid through `rsPoints`) and `rr_group_bonus`
  (`league`). A zone sweep counts visits and every kind of report; its `started_at` is the cycle's
  first contribution.
- **Explorer is a city-wide sweep, not a badge** (the old Explorer badge could never be earned and
  was removed). When check-ins and reports together cover every **Toronto** court on the roster
  (181 today; GTA courts never count toward it, see "GTA courts"),
  every member who contributed this cycle gets +30 and the sweep resets. Score visits count too
  (a score at a court is a check-in for every player on court). Progress lives
  in `site_stats/city_sweep` (`covered_keys` of `total_courts`). The Tasks tab draws it as a bar on the
  Explorer card, and the member's own zone (`zone_sweep_{slug}`, from `preferences.preferred_zone`)
  as a bar on the Full Zone Sweep card (`useSweep`). Every Toronto zone has a sweep doc from
  conversion, so the bar reads 0 of N before anyone contributes; a GTA municipality's doc is created
  by its first contribution, so its bar is hidden until then. It shares `advanceSweep` with the zone sweep, in the same
  `onCourtActivityZoneSweep` trigger.

`functions/courtCounts.js` (`aggregateCourtCounts`, every 6h) maintains `site_stats/court_counts` — the per-court player counts shown on the public `/courts` page. It stores counts keyed by the **raw** `preferred_courts` string rather than a resolved court name, so `matchCourtName` (which needs the courts CSV) stays client-side only. `useCourtData.ts` reads that one doc and falls back to the original three full-collection reads if it's missing, so the page works before the function is deployed. Needs `firebase deploy --only functions:aggregateCourtCounts`.

The same doc also carries `activity` — `{ d7, d30 }`, each `{ byKey, byName }` — feeding the court map's **Activity** view (its own button in the map bar, cycling off / 7D / 30D, beside the two-way Members Only / All Courts toggle). A check-in, a waiting-board report, a racquet-queue report and a court-conditions report each count once; a recorded score counts **the players on court** ("User Playing Matches", always even: 2 for singles, 4 for doubles, from the match's `sub_category`). `byKey[court_key]` holds `{ checkins, waiting_board, queue, condition }` and `byName[court name]` the players; the map bubble is their sum. A visit written from a score (`lat`/`lng`/`dist_m` all 0) is the score itself and isn't counted again. Two key spaces because the sources key differently: `courts` docs already carry a slugified `court_key` (mirror of `src/utils/courtKey.ts`), while a score's `court` (on its `submissions` entry) is the free-text court name the scorer typed, resolved client-side by `matchCourtName` for the same reason the preference counts are. This half has **no client fallback** and cannot have a useful one: `/courts` is public and `courts` and `submissions` are `allow read: if isAuthenticated()`, so a signed-out visitor can't compute it at all. Until the function is deployed the Activity view is simply empty. The total reads in the map bubble; **while 7D or 30D is on, each row of the court list shows that window's breakdown as pills** (User Playing Matches, Check-ins, Waiting board, Racquet queue, Court conditions; zero pills hidden). The court pop-up deliberately carries neither — it stays about who plays there.

The doc's `reports` (`court_key` → the 3 newest **court-condition** notes, any age, no names) feeds
the map bar's **Reports** button: while on, the list keeps only courts with notes and each row
shows the newest as a pill (full text), with More for the other two. Its sibling `report_counts` (`court_key` → every condition report with a note) replaces the player count on the map markers and the list's players badge while Reports is on. Copying
report text into this world-readable doc is the owner's call (2026-10-06): it makes notes,
anonymous ones included, public with no review step.

Separately, `functions/taskPoints.js` keeps the **per-player** task counters on `stats/{uid}`, and `functions/groupAwards.js` is a complementary **collective/group** bonus engine (Matchday, Hourly Coverage, Court Pioneer, Board Freshness, Full Zone Sweep, Explorer) that reads across many players' activity, writes an `awards` doc and raises the awardees' `rsPoints` — the two files award different things and don't overlap.

**Courts are visits and reports** (`courts`, `category: 'visit' | 'report'`). A visit is one per
player per court per day, id `{uid}_{courtKey}_{YYYYMMDD}` (Toronto day), from a check-in (the
member's own, within 400 m) or from a score that names a court on the roster (every player on
court, partners included). **A score at a court that isn't on the roster writes no visit**: the
visits are held in `site_stats/pending_court_visits` and the organizers get one "Court not in the
list" alert per new court. Adding the court means adding it to
`public/Tennis Courts Facilities - 4326.csv`, regenerating `functions/courts.json` and deploying
functions; the next `aggregateCourtCounts` run (every 6h) then writes the held visits
(`releaseHeldVisits`, `lib/memberLocation.js`), and only then do `courtsVisited`, the zone tier
and the court awards move. A same-day repeat overwrites the check-in or is skipped
for a score, so it never counts twice, and "visited this court" is simply "a visit exists". `courtsVisited` counts distinct courts.
A check-in's `lat`/`lng` are set to 0 once it is 30 days old (the nightly `pruneNotifications`, which reads
only visits with `lat > 0`). `dist_m` is kept, so `courtCounts` still tells a check-in (`dist_m` > 0) from a
score's visit (all three 0).

### GTA courts
The roster CSV holds Toronto (182 rows) **and** 322 GTA courts in 24 municipalities across York,
Peel, Durham and Halton. Its last column, `City`, is `Toronto` or the municipality. The source,
research notes and verification status of every GTA row live outside the repo
(`gta_tennis_courts_final.csv`). Duplicates and sites with no tennis courts were left out of the
roster.

- **A GTA court's zone is its municipality** ("Markham", "Mississauga"…). `getZone` (`zones.ts`)
  checks the GTA boundaries in `src/utils/gtaZones.ts` first and falls back to the Toronto road
  rules, so every caller (map, CourtsEditor, Signup's border prompt) gets it with no other change.
  Every GTA court sits inside its own `City` boundary and no Toronto court sits inside any, which
  was checked when the roster was built. Re-check it whenever either file changes.
- **Boundaries** are OpenStreetMap's lower-tier municipality relations (admin_level 8), unsimplified,
  rounded to 4 decimals. Neighbouring outlines come from shared OSM ways, so they meet with no
  measurable overlap (none at ~100 m sampling). Don't simplify them per polygon: the earlier
  simplified set overlapped by ~0.6 km² along shared borders. They are **not drawn** on the map
  (Show Zones is the 7 Toronto zones only); they only decide zones. The map's Zone filter lists, after
  the Toronto zones, only the municipalities that have a court on the map.
- **Unknown public hours say nothing.** A GTA club whose source says no public hours were found gets
  an empty `ClubInfo`, so it shows no Public Hours badge and no explanation (it reads as an orange
  "club" dot).
- **`functions/courts.json` is `{ courtKey: { zone, city } }`**, generated from the CSV with the app's
  own `getZone` and `courtKey`. Toronto keys keep the zone the file already had. The one known
  disagreement: Parkway Valley Tennis Club is listed twice; the server says North York, the
  map computes North Scarborough. `memberLocation.js` is its only reader.
- **Sweeps:** each municipality is a zone, so it gets its own Full Zone Sweep through the existing
  `advanceSweep`. **Explorer stays Toronto-only** (`torontoCourts()` / `isTorontoCourt()`).
- **To do: GTA zones are not in the pickers or tournament draws yet.** `ZONE_NAMES` (the profile and
  tournament zone pickers, `DEFAULT_ZONE_BUCKETS`, `ZONE_COLORS`, `ZONE_COURT_COUNTS`) is still the 7
  Toronto zones. A member whose courts are all in Markham gets `preferred_zone: 'Markham'`; the
  pickers don't list it, and tournaments send them to the Unassigned draw. Adding them means a
  bucket per municipality (or per region), picker entries, and `ZONE_COURT_COUNTS` rows.

### Firestore collections
`DATA_DICTIONARY_v3.csv` (repo root) is the authoritative shape: every collection, field, allowed
value and writer, plus the retired ones. **Every doc in a collection carries every field**; a field
that doesn't apply holds a typed empty (`''` / `0` / `false` / `[]` / `{}`), and a timestamp for
something that hasn't happened is `null`. Dates are Firestore Timestamps, never ISO strings; read
them with `toDate` / `toMillis` (`src/utils/eventDates.ts`). Kinds are discriminated by
`category` / `sub_category`, never by collection name, and every owner reference is `uid`.

Retired collections — **don't reintroduce them**: `tournament_matches`, `court_visits`,
`court_attendance`, `court_reports`, `court_suggestions`, `rallies`, `ladder_challenges`,
`score_submissions`, `task_progress`, `redeemable`, `rewards`, `group_awards`, `zone_sweeps`,
`tasks` (counters → `stats`, offers → `services`, awards → `awards`), `offers` (→
`stats.pointsSpent`), `redemptions` (→ `bookings`), `partner_pool`, `tournament_result_audit` (→ the
`submissions` chain), `court_improvements` (→ `courts` reports), `newsletter_subscribers`,
`email_log`, `group_lessons`, and `site_stats/board_zone_*` (→ `zone_sweep_*`). Pre-deletion
snapshots live in `_archive_database_consolidation/{source}/docs/{id}` (Admin SDK only).

| Collection | Written by | Notes |
|---|---|---|
| `users`, `stats`, `preferences`, `contacts` | Signup / profile / `profileBootstrap.ts`; `stats` counters by the server (see "Stats data flow") | doc id **is** the uid. `contacts` is the PII split out of `users`; `preferences` is playing preferences only |
| `providers` | Super admin (the offer form's `flagProvider`); the provider may change only their own `name`/`area` | id = the member's uid; `roles` ⊆ `stringer` \| `coach` \| `organizer`, `name` = business name. Public read |
| `events` | Organizer via event form (`eventService.ts`); `scoreMatch` stamps `completed_at` | `category` / `sub_category` — see "Event kinds and recurring meetups". `status`: `active` \| `cancelled` (+ `cancelled_at`); a cancelled event is hidden everywhere and left out of every list and current-event check, its registrations kept |
| `event_participants` | Player self-join (`useJoin.ts`) or organizer (`handleAddPlayer`); `onParticipantSeat` | id `{eventId}_{uid}`, doubles `{eventId}_{uid}_{mensdoubles\|womensdoubles\|mixeddoubles}` (the rules check it). `status`: `active` \| `withdrawn` \| `cancelled`, with `withdrawn_reason/_at/_by`; re-adding sets the same row back to `active`. A partner not on the app is a `guest_…` uid (`isGuest` in `src/utils/guest.ts` and `functions/lib/constants.js`): it gets a `stats/guest_…` doc only when it plays a match or receives walkover points, its points are parked there, and guests are left out of leaderboards, the rank snapshot, member counts, visits, tasks, alerts and connections. Linking a guest to a member who joins is done by hand on request |
| `matches` | `useTournament.ts` (draws), `ladderService.ts` and `rallyService.ts` (requests); `status`/`winner_uid`/advancement only by `scoreMatch` | `category`: `tournament` \| `challenge` \| `rally`; `sub_category`: `singles` \| `doubles`; `status`: `open` \| `accepted` \| `complete` \| `declined` \| `cancelled` \| `played` (a stale rally) |
| `submissions` | `scoreMatch` only (server) | Every scoring action and the points it paid — see "Scoring is one module". Readable by any signed-in member |
| `awards` | `functions/groupAwards.js`; `scoreMatch` (`bonus`) | Every bonus, deterministic ids. Server-only, public read |
| `league_seasons` | Season rollover (server-only) | `{uid}_{season}`: one finished season's league points. Public read |
| `courts` | `checkinService.ts`, `photoReportService.ts` (signed in or out); `taskPoints.js` (visits from scores) | `category`: `visit` \| `report`; report `sub_category`: `condition` \| `waiting_board` \| `queue`. Signed-out rows are reports only, `uid: 'not_a_member'` |
| `services` | Offer form (`servicesApi.ts`) | The Services catalog; **bare** slug ids — `bookings.service_id` and `redeemReward` resolve `services/{id}` directly, so never prefix them. `provider_id` is the provider's uid |
| `bookings` | `functions/bookings.js`, `functions/rewards.js` (server-only) | One job with a stringer or coach, paid by price or points — see "Bookings and the Provider Dash" |
| `listings` | `listingService.ts` | Marketplace; `category`: `sell` \| `rent` \| `trade` |
| `connections`, `public_contacts` | `functions/connections.js`, booking callables, `onParticipantSeat` (server-only) | Who may read whose `contacts` — see below. `connections.reason`: `rally` \| `challenge` \| `tournament` \| `booking` \| `partner_pool` |
| `task_claims` | `claimService.ts` (player), organizer review | `category`: `volunteer` \| `ambassador` \| `host`; created as `status: 'pending'`, only an organizer may update |
| `notifications` | `functions/lib/notify.js` (server-only) | `category` (area) + `sub_category` (the specific alert); `read_at: null` = unread, and it is the only field a recipient may change. Recipient may read/mark-read/delete; clients can never create. Read items are swept 24h after `read_at`, anything over 30 days nightly. No challenge/rally request alerts — see "Player Dash" |
| `ranking_history/{uid}/entries` | `functions/rankSnapshot.js` (weekly) | Subcollection. Public read, no client writes |
| `mailing_list` | Homepage Subscribe button and the court report form (`src/lib/newsletter.ts`) | The one mailing list; `source` is `newsletter` or `court report submission`. Two row shapes — see below. Create is open to **unauthenticated** callers; read/manage is organizer-only |
| `volunteer_signups` | Homepage Volunteer form (`src/lib/volunteer.ts`) | Auto-id, one row per submission, no `source`. A visitor's row is `uid: 'not_a_member'`, `user_name: 'anonymous'`. Create is open to **unauthenticated** callers; read/manage is organizer-only |
| `site_stats` | `courtCounts.js`, `rankSnapshot.js`, `taskPoints.js`, `groupAwards.js` (server-only) | Named singletons, each its own fixed shape: `court_counts`, `summary`, `court_coverage`, `zone_sweep_*`, `city_sweep`, `pending_court_visits` |
| `admin_stats` | `functions/adminMetrics.js` (server-only) | Organizer metrics; organizers read |
| `events/{eventId}/rr_drafts/{drawKey}` | `useTournament.ts` (organizer, pre-generation) | **Subcollection** — see the rules-path rule below. `groups` + `labels` only; withdrawn players are filtered by registration `status` |

### Mailing list: two row shapes, one collection

`mailing_list` is the one mailing list. The homepage Subscribe button writes `source: 'newsletter'`
and the court report form writes `source: 'court report submission'` when a signed-out reporter
leaves an email. Every row carries `email`, `uid`, `user_name`, `source`, `member`, `created_at` and nothing
else (`hasOnly()`). A row looks different
depending on who made it. The split is enforced by `firestore.rules`, not by the client, so `src/lib/newsletter.ts`
and that rule change together:

- **A signed-in member** owns exactly one row, and **the doc id is their uid**. It carries
  `uid`, `email`, `user_name`, `source`, `created_at`. Because the id is the uid, tapping
  Subscribe again overwrites that row instead of listing them twice, and the rule requires
  `subscriberId == request.auth.uid`, so nobody can write a row in another member's name.
- **`member`** is `true` on a member row. A visitor row is written `false`, and `onNewsletterSubscribed`
  sets it `true` when the email matches a member's `contacts.email`.
- **A signed-out visitor** gets an auto-id row with the same fields, but `uid: 'not_a_member'` and
  `user_name: 'anonymous'`, and the rule accepts **only** those values on this path. A real uid can
  never equal the sentinel, which is the whole reason a stranger can't forge a member row.
  Visitors can subscribe twice; dedupe on export.

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

A long list passes `searchable`, which puts a search box (matching label and hint) at the top of the
sheet; Add Player on the Tournament page uses it for the member list.

No native `<select>` remains in `src/`; every dropdown is a `SelectField`. Don't add a native one
back, and don't hand-roll another dropdown.

### WhatsApp / SMS alerts (Twilio)
`functions/lib/twilio.js` sends from +12892361080: WhatsApp first, as an approved Content template
(`KINDS`: `nextOpponent`, `reminder`), and SMS with the same words when the send is refused or
Twilio reports it failed (status callback → `twilioWebhook` → `smsFallback`). **Keep each
`KINDS[].text` identical to its template.** **Contact Method is never consulted** (owner, 2026-10-25):
anyone with a phone or WhatsApp number on their profile gets them, and the opponent's number goes in
the message whatever their switches say; only a member with no number is skipped ("see the draw" in
the opponent's message). Guests never.
Only production sends (`emailDeliveryDecision`).

**Sending hours (Toronto time):** a next-opponent message decided between 8:00am and 4:00pm goes
out at once; one decided after 4:00pm or before 8:00am, and every paper-plane reminder, waits for the
next 8:00am. Either way `queueMatchMessage` puts one Cloud Tasks task
per player, match, kind and morning on the `sendQueuedMessage` queue (no Firestore doc; a repeat before
8:00 is dropped by the task id). When it runs, the task sends only if the match is still unplayed with the
same two players and the event isn't cancelled.

- **Next opponent:** queued by `onMatchUpdated`; the in-app `match_advanced` still goes at once.
- **Reminder:** only by hand — the paper plane (`RemindButton` in `MatchCard.tsx`, via
  `RemindContext`, organizers only) calls `remindMatch`, which queues it ("Queued for 8:00am").
- **Replies:** `twilioWebhook` (`onRequest`) checks the Twilio signature against `WEBHOOK_URL`, finds
  the member by number, and alerts the organizers of each event where they have an unplayed match
  (`organizer_player_reply`): `U` = unavailable, `H` = difficulty fixing a time/court, anything else
  forwarded as text. An unknown number goes to every organizer. **No reply is ever sent back.**
- Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_AUTH_TOKEN`
  (signature check only). The webhook URL must be set on both the number and the WhatsApp sender in
  Twilio, exactly as `WEBHOOK_URL`.

### Contact details are opponent-only
The app deliberately carries **no in-app messaging** — it shares phone/email/WhatsApp instead. So
`contacts/{uid}` has to be readable by someone, but only by the person you're actually arranging a
game with. `contacts` read is allowed for: the owner, someone holding a **connection**, any
organizer (the organizer role or the super admin), and any signed-in member reading an organizer's
contacts or those of a member with a `public_contacts` marker.

`connections/{uidA__uidB}` is written **only** server-side: by the `onMatchConnection` trigger, on an
accepted rally/challenge or a tournament fixture; by the booking callables when a member books a
provider; and by `onParticipantSeat` between players looking for a doubles partner in the same
event and division (`reason: 'partner_pool'`). An *open* request earns nothing — otherwise anyone could
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

**Organizers are per event** (Racquets-And-Strings ADR-001). An event is managed by the super admin
and its `organizer_ids` (the creator first; there is no `creator_id`): `isEventManager` in the
rules, `isOrganizer(uid, event)` in `functions/lib/roles.js`, `isEventManager` in
`src/utils/eventTypes.ts` — change all three together. Creating an event needs the `organizer`
role (`providers/{uid}.roles`) and lists only the creator; only the super admin may change
`organizer_ids` (there is no assignment screen yet). Work that belongs to no event (rallies,
claims, refunds, bookings) goes to every member with the `organizer` role plus the super admin
(`organizerUids` in `lib/notify.js`).

Security rules (`firestore.rules`): owners can only update `skill_level / name / uid / league / updated_at` and the five self-reported task booleans in `stats`; every points and counter field is server-only. Roles live on `providers/{uid}`, which only the super-admin UID (`7PvfzNtDmsOq5GLMieId7QRT7wH3`) may write. Rules require `firebase deploy --only firestore:rules` to take effect — a git push alone does not deploy them.

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
every field you didn't think of — including writing PII into a world-readable doc. `users`,
`contacts` (`ownerContactFields()`), `stats` and `preferences` do this correctly; copy that pattern.

**A UI role toggle grants nothing.** Organizer / provider views are switched by the roles loaded
into `profile.roles` (from `providers/{uid}`) in the same session — no separate login. That decides
what is *rendered*. Every
privileged action behind those views must **also** be enforced in `firestore.rules` or inside a
callable Cloud Function, or a user flips the flag in devtools and writes to Firestore directly,
bypassing the UI entirely. Treat the toggle as cosmetic and the rules file as the boundary.

**Server-only collections stay server-only.** `connections`, `public_contacts`, `submissions`,
`awards`, `bookings`, `league_seasons`, `site_stats`, `admin_stats` and `ranking_history` are all
`allow write: if false` for clients and written by Cloud Functions; `notifications` is too, except
that the recipient may set `read_at` or delete. A client that could write `connections` could grant
itself anyone's phone number, and one that could write `submissions` could pay itself points.
Don't "temporarily" open one to ship a feature — add a callable.

**Roles are the super admin's.** `providers/{uid}.roles` makes an account a stringer, coach or
organizer: a provider reads the bookings whose `provider_id` is their uid and gets connected to
every member who books; an organizer creates events and gets event-less organizer work. Only the
super admin may write `providers` (`allow write: if isSuperAdmin()`), and `preferences` carries no
role fields at all, so a member cannot grant themselves anything by editing their own docs.
`hasRole()` in the rules and `rolesOf()` in `functions/lib/roles.js` are the same check — change
both together.

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
`AuthContext.tsx` calls `ensureUserProfileDocuments` (`profileBootstrap.ts`) on every login to guarantee the `users/stats/preferences/contacts` docs exist in their full v3 shape. The `profile` object (`UserProfile` type) bundles those docs plus `roles` (from `providers/{uid}`, `[]` when absent) and is consumed throughout the app via `useAuth()`.

**OAuth sign-in lives in one place.** `useOAuthSignIn.ts` holds the whole flow (popup → redirect fallback on `popup-blocked`, the `getRedirectResult` mount effect, profile bootstrap, and the `account-exists-with-different-credential` linking hand-off). `useGoogleSignIn.ts` and `useAppleSignIn.ts` are thin wrappers that only bind a provider, a `providerId`, and a `credentialFromError`; they keep their original return names (`handleGoogleSignIn` / `handleAppleSignIn`) so `Signup.tsx` is unchanged. `getOAuthSignInErrorMessage` in `authMessages.ts` is the same story for the error copy. Both hooks mount their own `getRedirectResult` effect and filter on `providerId`, so each ignores the other's result — don't "simplify" that filter away. Add a new provider by adding a wrapper, never by copying the hook.

### Account deletion and consent

**Consent** is `contacts.consent_at`, the one field added for it. It is stamped when a member ticks "I am 17
or older" and "I agree to the Terms of Service and Privacy Policy" at signup (Complete Profile stays disabled
until both are ticked; the one stamp records both), or taps I agree on `ConsentSheet`, which also confirms the
age, (`src/components/ConsentSheet.tsx`, mounted in `App.tsx`). The sheet shows to any signed-in
member whose `consent_at` is `null` or earlier than `PRIVACY_EFFECTIVE` (`FooterElements.tsx`). Which version
they agreed to is whichever was in effect at that stamp, so there is no version field: move the date forward
with any material policy change and everyone is asked again. Closing the sheet only hides it until the next load.

**Delete account** (Profile footer → `DeleteAccountSheet` → `deleteAccount` in `functions/accountLookup.js`)
is immediate and final (there are no backups). The client signs in again first; the server refuses a sign-in
older than 5 minutes, any member holding a role (organizer, stringer, coach) or the super admin, and anyone
with a booking still `lead`/`in_progress`.

- **Deleted:** `users`, `contacts`, `preferences`, `public_contacts`, their `mailing_list` row and rows with
  their email, `volunteer_signups`, `connections`, `notifications`, `listings`, `ranking_history/{uid}`, their
  Storage folders, and the Auth user (last, so a failure can be retried).
- **Anonymised to "Former member", uid kept:** every stored name (`matches`, `submissions`,
  `event_participants` incl. partners' `partner_name`, `courts`, `bookings`, `task_claims`, `league_seasons`,
  `stats`). The uid stays because undo, points, awards and sweeps are keyed on it. `stats` is kept, so they stay
  on leaderboards as "Former member" — the owner's decision. Check-in `lat`/`lng` go to 0; their reports lose
  their photos but keep the note. Report photos sit in the shared, uid-less `court_reports/members/`, so they
  are deleted by each report's `photo_paths`, not by the folder prefix (which still clears older uploads).
- **Matches:** unplayed tournament matches with a real opponent become walkovers through `recordScore` with
  the super admin as actor (`isOrganizer` always accepts it); the rest are blanked to Player Loading, the
  same as an organizer's removal. Registrations are withdrawn, never deleted. Unscored challenges and rallies
  are deleted. Each affected event's organizers get `organizer_account_deleted`, without the member's name.
- **`onMatchConnection` skips a write that leaves the pair and status unchanged**, or anonymising a played
  match would re-create a connection to the deleted uid.

### Privacy compliance (North America)

**Scope: North American markets only** (owner, 2026-11-03): PIPEDA and CASL. The Privacy Policy
(`PRIVACY_SECTIONS`, `StaticPages.tsx`) is written to PIPEDA, and nothing GDPR-specific is built. What is in
place, and where:

- **Age 17+**: a required tick at signup and the ConsentSheet text; the Terms' Eligibility says the same.
  Recorded by `consent_at`, with no age field.
- **Consent to be contacted at join**: a required tick in `JoinEventSheet` ("contacted about this event and
  my contact details shared with my opponents"). It only enables Join and is **not stored**; the
  registration is the record. An organizer's Add Player doesn't ask.
- **Check-in coordinates cleared at 30 days** (see the courts section). Scores aren't touched.
- **`lastActive` is private**: it lives on `contacts`, not the public `users` doc, and is written on every
  sign-in. `courtCounts` reads it there; the client fallback in `useCourtData` can't (signed-out visitors), so
  it has no 90-day filter. `scripts/move-last-active.mjs` moved the existing values.
- **Report photos carry no uid**: `court_reports/members/` (signed in) and `court_reports/anon/`. Photos stay
  public (owner's call).
- **Fonts are bundled** (`@fontsource/montserrat` in `index.css`, `@fontsource/josefin-sans` in
  `Newsletter.tsx`), so no request goes to Google's font servers. Don't add a Google Fonts link back.
- **The Sheets export** leaves out `contacts`, `notifications` and `connections`.
- **Newsletter unsubscribe** is handled by Brevo, which sends the newsletter and records who unsubscribed.
- **The policy names every processor**: Firebase, Google Analytics, Resend, Twilio (and Meta for WhatsApp),
  Brevo and Google Sheets. Add any new one, and bump `PRIVACY_EFFECTIVE`.

**Open question: EU/UK members.** Whether to serve them is undecided. Until the owner decides, build none of
the parked plan below.

**Parked GDPR plan**, if that changes:
- An opt-in consent banner before Google Analytics loads (it loads unconditionally today and sets the uid as
  User-ID), and deleting a member's analytics data when they delete their account.
- A legal basis for each purpose in the policy (contract, consent, legitimate interest).
- The EU-US Data Privacy Framework or Standard Contractual Clauses for US storage.
- An Art. 27 EU representative: a named person or company.
- An EU/UK complaint route, and the rights to restriction, objection and portability (a machine-readable copy).
- An opt-out from SMS/WhatsApp that doesn't require removing the number (the Contact Method switches are
  ignored for them today).
- A record of processing, data processing agreements with Google, Resend, Twilio and Brevo, and a breach
  process.

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
Ink on lime measures ~9.5:1 dark and ~5.5:1 light. **One more use, the owner's call (2026-10-23):**
a light lime tint (`bg-lime/25`) behind a walkover on the player's tournament match card; text on it
stays `text-fg`.
**To do:** the Donate button was relabelled **Contribute** on screen (2026-10-07), but the code still
says Donate: `DONATE_URL` (`FooterElements.tsx`) and the comments in `Button.tsx`, `index.css` and
`HomeElements.tsx`, including the lime rule above. Rename them to Contribute in a later pass. Don't reach for lime for anything else, and
don't use clay for a support CTA.

Check every change in **both** themes.

### The homepage is the design-system reference

`/` (`src/pages/Home.tsx` + `src/pages/home/HomeElements.tsx`) set the design spec, and the rest of
the app was swept to it on 2026-10-30 (the audit is `UI_UX_AUDIT.md`). When you touch a page, keep
to the rules below; the shared pieces carry most of them, so reach for those first.

**Primary navigation** is the bottom tab bar below `lg` (every tab labelled; Marketplace reads
"Market") and plain text links in the top bar from `lg`. Both read `TABS` in `BottomNav.tsx`;
anything fixed to the bottom clears the bar only below `lg` (`pb-16 lg:pb-0`, `lg:bottom-8`).

**The homepage FAQ** (`FAQ` / `FaqSection` in `HomeElements.tsx`, below the Support band) is the
source of truth for player-facing rules. The old Google Doc guide is out of date and isn't linked.

| Rule | How |
|---|---|
| Buttons | `Button`, or `buttonCls(variant, size)` (`Button.tsx`) for a link or label that must look like one. Fixed heights: `md` 44px (`h-11`), `sm` 36px (`h-9`) **only** for actions inside a dense row (Score, Accept), `lg` 48px. `font-semibold`, `gap-2`, icons sized by the button. `primary` is an alias of `clay`. There is no second button recipe (`pillButtonCls` is gone) |
| Control radius | `rounded-2xl`; `rounded-full` only for pills, avatars and dots; sheets keep their own top radius |
| Focus | `focusRing` (`Button.tsx`) on custom controls; `index.css` gives every other link and button the same ring and `cursor: pointer` (Tailwind v4 resets buttons to the default cursor) |
| Disabled | `opacity-50` + `cursor-not-allowed`, never another opacity |
| Smallest text | `text-xs` (12px). Nothing under it |
| Type sizes | page/section `text-2xl`, sub `text-lg`, body `text-sm`; the hero `text-3xl` is the one display exception (the Newsletter masthead aside) |
| Uppercase labels | `tableHeadCls` (`Input.tsx`): `text-xs font-bold uppercase tracking-widest text-fg/70` |
| Icons | lucide only, no text glyphs (✓ ✕): 14px (`size-3.5`) in chips, 16px in text and buttons, 20px standalone |
| Cards | fill only, `bg-fg/5`; `bg-fg/10` only for a state (played, selected, hover). No border, no shadow; shadows belong to floating layers (sheet, FAB, map popups) |
| Tables and stat tiles | `tableHeadCls`, `statTileCls`, `numCls` (`Input.tsx`), beside `field` |
| Page width | content pages `max-w-xl`; Tournament, the Courts map and the dashes keep their wide layouts; sheets and forms `max-w-md` |
| Banners | `AlertMessage` (announces itself: `role` alert or status) |

**Clay contrast is kept as is** (owner, 2026-10-30): white on clay and `text-clay` on a light card
measure 2.84:1, under WCAG AA. That was a deliberate brand call; don't darken clay without asking.

One thing is still not done: homepage cards use `bg-fg/5` rather than `bg-tennis-surface` (page and
card are the same `#143D34` today, so a `tennis-surface` card is invisible; splitting those tokens
changes every surface in the app).

### One name per thing
Several features carried two names for the same idea, with the old one kept alive "for now". Each
became a bug. The surviving pairs are listed here; **don't add another.**

- **A zone is `preferences.preferred_zone`, and nothing else.** There is no zone request
  (`req_zone_change` / `new_zone` are gone) and no `preferred_zone_manual`. Every path writes that
  one field with no approval step: the profile card's Zone section (`updatePreferredZone`), a
  court edit (which recomputes it, limited to the zones of the chosen courts), the tournament
  page's "Change Your Zone", and an organizer's move (the rules let an organizer change only that
  field on someone else's preferences). A zone **merge** for one tournament lives in
  `events.zone_draw_config.merges` and never touches a member's zone. **Unassigned** (no Toronto
  zone) is not a bucket but can be merged *from* like one (`merges.unassigned`), never into:
  `zoneBucketFor` and the server's `playerZone` both follow the merge, and the Unassigned draw
  disappears once it is merged away. An empty `preferred_zone` is a zone change too. Courts with no
  Toronto zone write `''`, and `onZoneChanged` treats that as a move to Unassigned (it used to
  return early and skip both the seat give-up and the alert). **A zone change keeps every
  match with a real opponent** — the player keeps playing all of those. The one thing it gives up
  is an old-zone draw where **none** of their matches has a real opponent (alone in a group, or
  opposite Player Loading/BYE) and none is played: `onZoneChanged` (`functions/zoneMoves.js`)
  blanks those slots to Player Loading, the same blanking a removal does, re-checked in a
  transaction. It alerts the organizers of a live singles tournament the player is in **only when
  their draw already has generated matches**, once per change, saying what it gave up and what to
  do: if the new zone already has a generated draw they'd belong to, they appear in Unplaced
  Players for that zone, to be placed by hand; otherwise nothing is needed — `preferred_zone`
  routes them in when that draw is generated. There is deliberately **no** auto-seating in any
  case. This is why `unplacedParticipants` tests seating **per draw**, not per event: a
  zone-changer is seated in their old draw and unseated in the new one, and only the second fact
  matters. Needs `firebase deploy --only functions:onZoneChanged`. Its alert is
  `sub_category: 'organizer_zone_change'` (it was `organizer_zone_change_request`).
- **A result is the applied `submissions` entry: `winner_uid` + absolute `set_N_player_1/2`,** for
  tournament matches, challenges and rallies alike. `match.winner_uid` is the one copy kept on the
  match, for advancement and "who won". Nothing else about a result lives on the match —
  `claimed_winner_*`, `score_line`, `walkover`, `points_*`, `applied_*`, `completed_at`,
  `score_disputed`, `dispute_uid`, `result_submissions` and `score_edited_at` are gone.
- **An event's managers are `organizer_ids`; roles are `providers/{uid}.roles`.** `creator_id`,
  `preferences.event_creator`, `stringer`, `stringer_id`, `coach` and `coach_id` are gone.
- **A withdrawal is `event_participants.status: 'withdrawn'`** (+ `withdrawn_reason/_at/_by`); the
  `removal` fields are gone. **A notification is unread while `read_at` is `null`**; there is no
  `read` flag.
- **Genuinely irreducible duplicates** — these cross a language boundary and cannot share code, so
  they stay hand-synced: `functions/lib/points.js` ↔ `taskCatalog.ts` (what the server pays vs what
  the client promises), and `pairId()` in `functions/connections.js` ↔ `firestore.rules` (writes the
  connection doc vs reads it to permit a `contacts` read — if these ever disagree, every contact
  read in the app starts failing).
- **Future decision: share client/server code.** Several rules are hand-copied between `src/` and
  `functions/`: `drawKeyOfDoc` ↔ `drawKeyOf`, `registrationId` ↔ `participantSeat.js`,
  `pairDivision`/`pairSkillGroup` ↔ `pairDraw`, `isEventManager` ↔ `isOrganizer`, `hasRole` ↔
  `rolesOf`. Sharing them needs a build step that copies one source into `functions/` (CommonJS) or
  a parity test. Dropped for now (owner, 2026-10-30); decide before adding another pair.

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
- **`currentMatches` also drops `status: 'cancelled'`.** Cancelling is how a draw is reshaped
  without losing the record — the document and any results it paid stay — so a cancelled match must
  not render, be scoreable or be counted. It was ignored at first, and the Zephyr Open beginners
  draw went on showing its old R16 rows and Player Loading slots after being rebuilt as QF/SF/F.
  One consequence: Cancel Matches no longer sweeps cancelled docs up with the rest of the draw.
  That is accepted — regeneration writes the same deterministic ids and overwrites them.
- **Winner advancement must match `zone` too** (`sameDraw` in `lib/scoring.js`). Template match
  ids (M1, M5, …) are identical across zone draws, so without it the next-match lookup can write
  the winner over a real player's slot in the *other* zone — silently, and reported as success.
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
  just blanked), then sets every registration they hold in the event to `status: 'withdrawn'`.
  Matches already played are untouched. Walkovers go through `scoreMatch` first, because the
  server refuses a result once a side is blank.
- Removal blanks them out of **every** unplayed match left in the draw, not just one group: any
  match doc still listing them keeps reconstructing their name on the group card.
- The registration must stop being `active` — an active row is what routes a player into a draw
  (and what lists them in Unplaced Players), so while it stays active they can be placed into a *different*
  draw. The row is never deleted; re-adding sets it back to `active`.
- The withdrawal goes in the **same batch** as the match-doc changes. Written separately, the
  matches change reaches `onSnapshot` before the withdrawal's round trip finishes, and the
  just-removed player is re-seated — persisting across a reload.

**Scoring**
- **`completed_at` is pinned to first scoring.** Re-editing a complete match used to overwrite it
  with "now", corrupting anything sorted by it (streaks, months active, best finish). A correction
  copies the replaced entry's `completed_at`; its own `created_at` says when it was entered.
- **The RR +5 bonus checks its award doc before paying and before reversing.** It used to pay
  automatically on the last match completing, keyed off `status !== 'complete'` — which only means
  *this* match was unscored, so a corrected match re-confirmed paid a second +5 while a later reset
  removed only 5, leaving a permanent surplus. It is now an organizer button, and `groupBonus` does
  nothing when the award doc's existence already matches the switch; that check and `awardees` are
  the only things standing between a double payout and a phantom deduction.
- **A blank `winner_uid` must be rejected.** It completes the match displaying player 2 as winner,
  credits player 1 with a loss, awards nobody a win, and writes an empty uid into the next round.
- **A result is paid inside the same server transaction that reads the match.** Two submissions
  fired close together (a mobile double-tap) used to each read a pre-confirm world and both apply
  ±3 — winner +6, loser −6, and those phantom points are spendable on Services. `recordScore`
  reads the match and its applied entry, reverses that entry's stored points, and pays the new
  result in one transaction.

**Effects and writes**
- **The merge-inference effect must key on `[matches, statsMap]`.** Inside the matches snapshot
  callback, `statsMap` is a stale `{}` closure, so every band lookup returns 0 and the inference
  silently falls back to Challengers+Masters.
- **Nothing seats a late joiner automatically, knockout included.** The server seating
  (`seatJoiner`) was removed: it filled bye slots whose player had already advanced, and it put a
  Masters joiner in a Beginners+Challengers merged draw (see "Placement is manual").
- **`useTasks` never retries a failed task write.** Clearing `written` in `.catch()` turned a
  rules-rejected write into an endless render→write→reject spin — the Profile page flicker.
- **The Matchday query is bounded to a ±36h window** on applied `submissions.completed_at`. It
  used to read every completed match in the league on every completion — quadratic, and the first
  query here to time out.
- **Board Freshness is `onDocumentCreated`, not `onDocumentUpdated`.** A report is never updated
  (`firestore.rules` allows only its create), so the old trigger waited for a transition that can
  never happen; those bonuses were never once paid.

**Matches page**
- There are no filters. Each tab shows 20 people (`mixFor`), each with pills saying why: New (no
  match played), Most matches (the top quarter of the pool by matches played), Nearby (a shared
  preferred court) and Re-Match (played before). The list takes one person from each pill in turn,
  so there is no fixed share: more new sign-ups simply means more New. Untagged people fill the rest,
  and the whole ordered list is what the weekly refresh and the dice draw from.

### Change discipline
Fix exactly what is asked. Do not bundle adjacent cleanup, refactors, or new files into a stated request. If you notice something else broken, mention it in one sentence at the end and wait to be asked.
