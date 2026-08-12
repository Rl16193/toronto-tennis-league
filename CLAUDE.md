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

# Place RR late joiners into groups (EOD automation; Admin SDK, requires serviceAccount.json)
npm run regroup:rr              # add --dry-run via: node scripts/regroup-rr.js --key serviceAccount.json --dry-run

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
| `src/pages/services/ServicesElements.tsx` | Services tab, offer form, group-lesson card |
| `src/features/events/EventsElements.tsx` | Event card, creator form, join sheet, schedule formatters |

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
- Score submission (`handleSubmitScore` → `updateMatchWithSubmission`): **three separate steps** — (1) match result batch, (2) stats batch (best-effort), (3) winner advancement (best-effort). Stats and advancement are isolated so a rules rejection never rolls back a recorded score.
- Points are computed by the shared `computeMatchPoints(match)` helper (used by both `updateMatchWithSubmission` and its exact inverse `reverseMatchStatsInto`). An RR group-stage win scores **3 points** and the loser **1**, *whether or not it was a walkover* — the old `isWalkover ? 1 : 3` penalised the player who showed up, and was deliberately removed. `computeGroupStandings` in `rrGeneration.ts` is the display-side twin of the same rule (3/1, no walkover branch) — keep the two in sync. (There was a third copy in `scripts/backfill-rr-points.mjs`; that one-off correction pass has been run and the script is deleted.)
- Winner advancement resolves the next match from loaded state (`matches` array) using normalized bracket comparison (`m.bracket ?? null`), with reconstructed doc ID as fallback.
- Participant draw visibility (`userDraw`): a participant sees the draw they are **actually placed in** — `userDraw` looks for the participant's `user_id` in a generated match and returns that match's draw. **Do not** route `userDraw` by skill: a creator can move a player across skill groups (e.g. Challengers → Masters) without changing their `event_participants` skill, and skill-derived routing would hide the draw they're really in. There is deliberately **no** pre-generation fallback — before any draw is generated there is no placement, so `userDraw` is `undefined` and `visibleDraws` shows the participant every draw. That is intended (nothing to hide pre-generation), so don't "fix" the undefined by guessing a draw from `skill_level`.

Draw document IDs follow the pattern: `{eventId}_{drawKey}_{matchId}` where `drawKey = getDrawKey(tournamentChoice, division, skillGroup)`. (The `{eventId}_reserves_{drawKey}_` LL/Lucky-Loser draw variant was a client feature with no UI consumer and was removed as dead code — nothing generates or reads `bracket: 'reserves'` docs anymore.)

### Round Robin (`rrGeneration.ts`)
Events with `tournament_format === 'rr'` use group-stage + knockout instead of a single bracket.

**Group formation (`buildZoneTierGroups`)** is **skill-band × zone, auto-sized**. Players are bucketed by skill band (`skillBand` in `utils.ts`: Beginners 2–2.5, Challengers 3–3.5, Masters 4–5) and then by preferred-court zone; each bucket is split by `splitEvenly(n)` — `g = ceil(n/5)` balanced groups of 3–5 (5→[5], 6→[3,3], 7→[4,3], 8→[4,4], 9→[5,4], 10→[5,5], 11→[4,4,3], 12→[4,4,4]). A draw with **≤5 total players is one group** (zone/band ignored). A lone player in a distinct zone becomes their own placeholder group **only when the draw already has >3 zone-clustered groups**; otherwise the band's players are pooled (ordered by zone) and split, folding the singleton in. Labels are `Group X · Band · Zone`, dropping the zone segment when unassigned/mixed. Group letters are positional at render (`rrGroupLabels`); a creator-renamed label (`rr_label_custom`) is shown verbatim. The preview (`previewRRGroups`) uses the same function so it matches the generated draw. NOTE: the skill-band sub-split is intentional (it supersedes the old "no `getTier`" rule); the **size algorithm is authoritative** and is never overridden by band boundaries, so the old 3+2 bug can't recur.

**Merge** — Masters + Challengers can be merged into one RR draw via the same "Merge Draws" toggle used for brackets (a merged draw has `skillGroup: 'All'`, which collects all skill levels).

**Participant visibility** — a participant sees **both skill draws in their own division** (Challengers + Masters for their gender; doubles → their own division), read-only. Creators see all draws. (`visibleDraws` in `useTournament.ts`.)

**Editing groups (creator)** — `handleSaveGroupEdit(rrGroup, newPlayers)` rewrites one group's roster; a cross-group move (including across two groups **within the same draw**) is expressed by including the moved player in the target group's `newPlayers` and omitting them from the source — the function reconciles both groups' Firestore docs atomically. There is no separate cross-*skill-draw* move action (Challengers ↔ Masters): instead, a background effect in `useTournament.ts` reactively removes a player from this draw's groups if they're found seated in the sibling skill draw's groups, so a creator moving someone via `event_participants`/skill edits elsewhere self-heals without a dedicated "move" call. `handleRenameGroup` sets a custom label; `handleCreateRRGroup` spins up a new group from unplaced players ("Add Group"). Emptying a group dissolves it; a group left with one player keeps a placeholder match so the lone player stays visible and movable (never silently dropped). Moves into/out of a group with a played match are refused.

**Knockout** — the creator picks the bracket size (R4/R8/R16) via `handleGenerateRRKnockout`. Every group winner is auto-seeded (`selectGroupWinners`, ordered points → gamesWon so the top seed lands in slot 1); the remaining slots are left as `PLAYER_LOADING` for the creator to fill by hand in the draw editor (`buildRRKnockoutDocs` with `manualFill: true`, which also skips first-round bye auto-advancement). Re-selecting a size rebuilds the knockout, and is refused once any knockout match has been played. There is **no** automatic runner-up fill — that behaviour was removed along with `selectAdvancingPlayers`.

**Late joiners** — unlike knockout draws, **RR accepts registration after the draw is generated** (`slotStatus` in `useJoin.ts` is bypassed for RR); they are NOT sent to the reserves/LL draw. The EOD script `scripts/regroup-rr.js` (Admin SDK) places them: groups with **4–5 players (or any played group) are locked**; only groups with **≤3 players** accept a joiner, needing a matching band (zone preferred), else the overflow forms new `(band, zone)` groups via `splitEvenly`. Groups with played matches are never touched. The script duplicates the pure helpers from `rrGeneration.ts`/`utils.ts` — keep them in sync.

### Leagues, Friendlies & Matches (`src/pages/Matches.tsx`)
League Ladder standings and challenges no longer live on the Tournament page — they moved to `/matches` (`Matches.tsx`), which has a Friendlies/Challenges segmented control. The **Challenges** tab reuses the unchanged `src/features/leagues/` module (`ladderService.ts`, `useLadder.ts`, `useStandings.ts`). The **Friendlies** tab is a separate, newer module, `src/features/friendlies/` (`rallyService.ts`), implementing a parallel non-competitive request/accept flow (a `rallies` collection) modelled on the ladder-challenge loop but with no points, standings impact, or organizer step. `src/pages/Leagues.tsx` is now pure standings/leaderboard (tournament + community boards) — it no longer renders any challenge UI.

### Stats data flow (read before changing)
One source writes to `stats/{userId}` at runtime:
- **`useTournament.ts`** (`updateMatchWithSubmission`) — live increments on score confirmation

All fields are camelCase (`matchesPlayed`, `leaguePoints26`, etc.). Snake_case and `_xlsx` fields are dead.

Two rules for writing `leaguePoints26`, both learned from real defects:
- **`confirmChallenge` (`ladderService.ts`) uses `runTransaction`, not a batch.** The loser's deduction is floored at 0, which needs a read-then-write; done in a plain batch, two concurrent organizer confirms both read the same starting value and one −3 is silently lost. All three writes use `set(…, { merge: true })` so a player with no `stats` doc can't reject the whole thing and strand the challenge in `reported`.
- **The RR +5 group-completion bonus is paid in a separate, best-effort commit, so "group is complete" is NOT proof it was paid.** The same batch stamps `rr_group_bonus_v2: true` on every match in the group; `reverseRRBonusesInto` must check that stamp before deducting, or a failed bonus commit followed by a draw reset takes 5 points players never received.
- **Doubles partner credits are applied in the same live scoring batch and reversed with the same per-captain `partner_uid` lookup.** The backfill script `scripts/backfill-doubles-partners.mjs` stamps processed matches with `doubles_partner_pts_v2: true`; `reverseMatchStatsInto` receives the same `partnerUidByCaptain` map so reset/cancel undoes partner credits in the same pass.

`functions/courtCounts.js` (`aggregateCourtCounts`, every 6h) maintains `site_stats/court_counts` — the per-court player counts shown on the public `/courts` page. It stores counts keyed by the **raw** `preferred_courts` string rather than a resolved court name, so `matchCourtName` (which needs the courts CSV) stays client-side only. `useCourtData.ts` reads that one doc and falls back to the original three full-collection reads if it's missing, so the page works before the function is deployed. Needs `firebase deploy --only functions:aggregateCourtCounts`.

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
| `matches` | `useTournament.ts`, `ladderService.ts`, `rallyService.ts` | `category`: `singles` \| `doubles` \| `rally` \| `challenge` \| `score_submission` |
| `courts` | `checkinService.ts`, `photoReportService.ts` | `type`: `check-in` \| `attendance` \| `condition` \| `waiting_board` \| `queue` |
| `tasks` | `useTasks.ts`, `functions/taskPoints.js`, `functions/groupAwards.js` | progress doc per uid; `type: 'offer'` rows are the Services catalog (seeded by `scripts/seed-rewards.mjs`, **bare** doc ids — `redemptions.reward_id` and `functions/rewards.js` resolve `tasks/{rewardId}` directly, so never prefix them) |
| `offers`, `redemptions`, `group_lessons` | `functions/rewards.js` (server-only) | |
| `listings` | `listingService.ts` | Marketplace |
| `connections`, `public_contacts` | `functions/connections.js` (server-only) | Who may read whose `contacts` — see below |
| `task_claims` | `claimService.ts` (player), organizer review | `type`: `volunteer` \| `ambassador` \| `host`; created as `status: 'pending'`, only a creator may update |
| `notifications` | `functions/notifications.js` (server-only) | Recipient may read/mark-read/delete; clients can never create |
| `ranking_history/{uid}/entries` | `functions/rankSnapshot.js` (weekly) | Subcollection. Public read, no client writes |
| `mailing_list` | Public newsletter form | Create is open to **unauthenticated** callers; read/manage is creator-only |
| `site_stats` | `functions/courtCounts.js` | Named singleton docs (`court_counts`) |
| `events/{eventId}/rr_drafts/{drawKey}` | `useTournament.ts` (creator, pre-generation) | **Subcollection** — see the rules-path rule below |

### Contact details are opponent-only
The app deliberately carries **no in-app messaging** — it shares phone/email/WhatsApp instead. So
`contacts/{uid}` has to be readable by someone, but only by the person you're actually arranging a
game with. `contacts` read is allowed for: the owner, an organizer, someone holding a
**connection**, and someone with a `public_contacts` marker.

`connections/{uidA__uidB}` is written **only** by the `onMatchConnection` trigger, on an accepted
rally/challenge or a tournament fixture. An *open* request earns nothing — otherwise anyone could
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

Security rules (`firestore.rules`): owners can only update `skill_level / tournament_preference / name / uid / league` in `stats` — scoring fields are organiser-only. `event_creator` in `preferences` can only be set by the super-admin UID (`7PvfzNtDmsOq5GLMieId7QRT7wH3`). Rules require `firebase deploy --only firestore:rules` to take effect — a git push alone does not deploy them.

Storage rules (`storage.rules`) also require a manual deploy — `firebase deploy --only storage`, or paste into Firebase Console → Storage → Rules → Publish. A git push alone does not deploy them.

### Security rules: hard rules
Because the client talks to Firestore directly, **`firestore.rules` *is* the API layer.** There is no
server in between. Five rules follow from that, all learned from real defects:

**Rules do not cascade into subcollections.** A `match /events/{eventId}` block does *not* cover
`events/{eventId}/rr_drafts/{drawKey}`; that path needs its own nested `match`, or every read and
write is denied by default. This has already bitten once — `useTournament.ts` writes RR drafts to
that subcollection while `firestore.rules` declares a *top-level* `/rr_drafts/{id}` that can never
match, and the `onSnapshot` error path sets the draft to `null`, so it fails **silently**. When you
add a subcollection, add its rule at the full nested path and verify a write actually lands.

**Whitelist writable fields with `hasOnly()`, never blacklist with `!hasAny()`.** A blacklist permits
every field you didn't think of — including writing PII into a world-readable doc. `contacts` and
`tasks` do this correctly (`ownerContactFields()`, `ownerTaskFields()`); copy that pattern.

**A UI role toggle grants nothing.** Admin / creator / provider views are switched by a flag on
`preferences` in the same session — no separate login. That flag decides what is *rendered*. Every
privileged action behind those views must **also** be enforced in `firestore.rules` or inside a
callable Cloud Function, or a user flips the flag in devtools and writes to Firestore directly,
bypassing the UI entirely. Treat the toggle as cosmetic and the rules file as the boundary.

**Server-only collections stay server-only.** `connections`, `public_contacts`, `notifications`,
`offers`, `redemptions`, `group_lessons`, `site_stats` and `ranking_history` are all `allow write:
if false` for clients and written by Cloud Functions. A client that could write `connections` could
grant itself anyone's phone number. Don't "temporarily" open one to ship a feature — add a callable.

**The deployed rules may not be the repo rules.** Deployment is manual, so before trusting anything
in `firestore.rules`, diff it against Firebase Console → Firestore → Rules. Same for `storage.rules`,
whose own header warns that deploying **replaces** the console copy.

### Never ship a secret to the client
`vite.config.ts` `define:` performs a literal text substitution at build time — anything put there is
compiled into the JavaScript every visitor downloads. `VITE_FIREBASE_*` values are fine (they are
public identifiers by design; security comes from the rules). Any real credential is not: call it
from a Cloud Function and keep the key server-side. There is a live instance of this to clean up —
`GEMINI_API_KEY` is inlined by `define:` and has no consumer anywhere in `src/`.

### Production is the only environment
There is no staging project and no emulator config, so `npm run dev` and every Admin SDK script in
`scripts/` read and write **production data**. There are also no backups — no scheduled Firestore
export and no PITR — so a bad write is permanent. Run admin scripts with `--dry-run` first
(`regroup-rr.js` supports it), and treat any destructive one-off as unrecoverable until backups exist.

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

Check every change in **both** themes.

### Defect notes (detail compressed out of code comments)
Each of these was a real bug. The code carries a one-to-four line warning; the reasoning is here.

**Zones**
- **`effectiveZone` maps a missing `zone` onto the default zone.** Zones went live mid-event, so
  groups generated before that carry no `zone`. They were briefly kept as a separate zone-less
  draw — which put the running groups outside the zone list and matched every participant to two
  draws, doubling every "N signed up" count. They are Downtown-Midtown draws, not a fourth category.
- **`currentMatches` MUST filter on `zone`.** Every destructive path (reset, cancel, regenerate)
  iterates it. Without the zone term, two zone draws in the same division/skill are
  indistinguishable, and resetting one zone deleted the other zone's matches and reversed those
  players' league points.
- **Winner advancement must normalize `zone` too.** Template match ids (M1, M5, …) are identical
  across zone draws, so without it `matches.find` can write the winner over a real player's slot
  in the *other* zone — silently, and reported as success.
- **Cross-draw dedupe is disabled (`AUTO_DEDUPE_ENABLED = false`).** It was the one path that
  could unseat a player with nobody acting; if the slot was then refilled they lost their place
  with no record why. The duplicate it guarded against is real — fix the cause, don't silently
  delete a player mid-event.
- **`zones.ts` geometry:** the DVP and Hwy 404 are spliced into one polyline (as two, they left a
  wedge that North York and its neighbours both claimed — the visible overlap). The east-edge road
  chain is re-binned at ~300m to drop intersection loops. Hwy 407 isn't in the Centreline dataset,
  so Steeles Ave stands in.

**Removing a player**
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
- **The RR +5 bonus checks its own stamp before paying and before reversing.** `status !==
  'complete'` only means *this* match was unscored — a corrected match re-confirmed would pay a
  second +5, and a later reset removes only 5, leaving a permanent surplus.
- **A blank `winner_uid` must be rejected.** It completes the match displaying player 2 as winner,
  credits player 1 with a loss, awards nobody a win, and writes an empty uid into the next round.
- **`confirmChallenge` reads the `applied` flag inside the transaction.** Two confirms fired close
  together (a mobile double-tap) each read a pre-confirm world and both apply ±3 — winner +6,
  loser −6, and those phantom points are spendable on Services.

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
