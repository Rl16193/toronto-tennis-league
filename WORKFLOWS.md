# Racquets & Strings — Complete Workflow Map

---

## 1. Authentication

### Sign Up (Email)
1. User lands on `/signup` (or clicks "Join the League" from home)
2. **Step 1** — Personal info: name, email, password (min 6 chars), phone, avatar upload, preferred contact mode
3. **Step 2** — Skills & preferences: NTRP skill level (slider 1–7), preferred courts, favourite players, availability days/times
4. **Step 3** — Review & confirm
5. On submit: Firebase Auth `createUserWithEmailAndPassword` → creates `users/{uid}`, `stats/{uid}`, `preferences/{uid}` in Firestore via `profileBootstrap`
6. Redirects to `returnTo` param (default `/events`)

### Sign Up (Google OAuth — new user)
1. Click Google button on Login page
2. `signInWithPopup` → `getAdditionalUserInfo.isNewUser === true`
3. `ensureUserProfileDocuments` creates `users/stats/preferences` docs
4. Redirected to `/signup` to complete profile (name, skill, etc.)

### Login (Email)
1. Enter email + password → `signInWithEmailAndPassword`
2. Optional "Stay logged in" checkbox sets `browserLocalPersistence` vs `browserSessionPersistence`
3. Email suggestion via mailcheck (e.g., gnail → gmail)
4. On success: redirects to `returnTo` param (default `/events`)

### Login (Google — returning user)
1. `signInWithPopup` → `ensureUserProfileDocuments` (no-ops if docs exist)
2. Redirects to `returnTo`

### Password Reset
1. Toggle "Forgot Password?" → email-only form appears
2. `sendPasswordResetEmail` → success screen with instructions

### Auth Guards
- `/leagues` → redirects to `/login?returnTo=%2Fleagues` if not logged in
- `/events` join button → redirects to login with `intent=join-event`

---

## 2. Profile (Own)

**Route:** `/profile`  
**Auth required:** yes

- **ProfileInfo** — name, email, phone, skill level; edit mode saves to `users/{uid}`
- **ProfileStats** — matchesPlayed, wins, losses, % pts won (from `stats/{uid}`)
- **ProfileEvents** — events the user has joined (from `event_participants` where `user_id == uid`)
- **ProfileAvailability** — preferred courts, availability days/times, favourite players; saves to `preferences/{uid}`
- **Calendar** — May 2026 date picker for marking availability

---

## 3. Player Profile (Public)

**Route:** `/players/:userId`

- Shows name, skill level, tournament preference, contact info, contact mode
- Match stats: played, wins, losses, % pts won
- Availability calendar (May 2026)
- Organizer contact section (if accessed via event context)
- Visible to any logged-in user

---

## 4. Events Page

**Route:** `/events`

### Browsing
- All events fetched from `events` collection
- **Visible events filter:**
  - Social/non-tournament events: hidden once start date has passed
  - Any event: hidden once end date has passed
- Shown as 3-column card grid

### Joining an Event (Player)
1. Click "Join" on an EventCard → card expands inline (no modal)
2. **Tournament event:**
   - Select format: Singles or Doubles
   - Select division: Men's / Women's (Singles) or Men's / Women's / Mixed (Doubles)
   - Doubles-only: partner name, partner in-app toggle (yes/no), combined skill level
   - Slot availability checked against `tournament_matches` — shows "Full" or fallback bracket message
   - On submit: creates `event_participants` doc with `tournament_choice`, `division`, `skill`, etc.
3. **Social/regular event:**
   - Simple "Reserve your spot" → creates `event_participants` doc
4. Slot status logic:
   - Counts players in `tournament_matches` for the chosen draw
   - If full, offers fallback to alternate skill bracket (Challengers ↔ Masters)

### Check Past Events
- Button (top-right, hidden for creators) → navigates to `/tournament?tab=past`

### Creating an Event (Creator only)
1. Click "Add an Event" → modal form opens
2. Fields: title, type, date, end date, location, description, organizer, skill level, image
3. `createEvent` uploads image to Firebase Storage, writes `events` doc
4. New event appears in the grid immediately

---

## 5. Matches Page (Tournament)

**Route:** `/tournament`

### Tab Structure
- **Upcoming** — tournament event with no `tournament_matches` docs yet
- **Active** — `tournament_matches` exist but no final match (`round === 'F'`) is `status === 'complete'`
- **Past** — a final match with `status === 'complete'` and `winner_user_id` set

URL param `?tab=past|active|upcoming` sets the initial tab.

### Accordion Per Event
- Each tab shows a collapsible list of tournament events
- Header: event name + date range
- One accordion open at a time per tab

### Draw Visibility (inside an accordion)
| User type | Which draws shown |
|-----------|------------------|
| Creator | All draws always |
| Participant (in `event_participants`) | Only the draw they are **placed in** (see below) |
| Non-participant / new user | All draws (preview mode) |

For Past events: participant sees their draw; non-participant defaults to Men's Challengers.

**Participant draw resolution (`userDraw`)** — once matches are generated, a participant sees the draw their `user_id` actually appears in (`tournament_choice` + `division` + `skill_group` of their match). Only before generation does it fall back to skill-derived routing (`skill_level >= 4` → Masters, else Challengers). This matters because a creator can move a player across skill groups (e.g. Challengers → Masters) without editing their `event_participants` skill; placement-based visibility ensures the moved player sees the draw they're really in. Do not change `userDraw` back to skill-only routing.

### Draw Tabs
Within an accordion, draw sub-tabs are shown based on visibility:
- **Men's Singles** → Challengers / Masters skill groups (or merged)
- **Women's Singles** → Challengers (or merged)
- **Doubles** → Men's / Women's / Mixed / Consolidated

### Opponent Card (Active tournaments only)
- Collapsible dropdown header. Bracket draws show **"Your Matches"** (`OpponentCard`); RR draws show **"Your Group"** (`RROpponentPanel`). Same collapsible pattern for both formats.
- Only rendered once the draw is generated — never during preview (so no "Player Loading" opponent appears).
- Name / contact / profile link are resolved live by `user_id` (fall back to the match-doc snapshot), so a re-seated or profile-updated player shows current info.
- "View Profile" button hidden when there is no `user_id`.

---

## 6. Draw Lifecycle

### Phase 1: Preview (no Firestore match docs)

`displayMatches` is computed entirely client-side:

1. `filterParticipantsForDraw` — filters `event_participants` by `tournament_choice`, `division`, and `skillGroup`
2. `buildPlayerList` — maps participants to `TournamentPlayer` objects, sorted alphabetically (or by skill for merged draws)
3. `getDrawSize(playerCount, tournamentChoice)`:
   - Doubles → always 16
   - Singles ≤ 8 players → draw size 8
   - Singles 9–16 players → draw size 16
   - Singles 17+ players → draw size 32
4. `fallbackTemplate(drawsize)` generates the bracket structure for size 8/16/32
5. Players slotted into positions 1..drawsize; slots beyond player count show "Player Loading"
6. `previewSlotOverrides` applied on top (creator's manual drag-and-drop changes)

**Key:** draw size is recalculated live every time `participants` changes. Adding a new participant (via join or creator add) can bump the draw from 8→16 or 16→32 automatically in preview.

### Phase 2: Generated (Firestore match docs exist)

1. Creator clicks "Generate Matches"
2. `generateDraw` runs with current preview state (including slot overrides)
3. Each match written to `tournament_matches/{eventId}_{drawKey}_{matchId}` via batched write
4. `currentMatches` is now non-empty → `displayMatches` returns Firestore data directly
5. Draw size is **locked** to whatever was written — adding more participants after this point does NOT expand the draw

### After Generation: Adding a Player
- `handleAddPlayer` creates an `event_participants` doc
- `participants` updates via `onSnapshot`
- The new player appears in `reservesPlayers` (players filtered for the draw but not placed in any match slot)
- Creator can place them in the LL Draw (reserves bracket) — they do NOT enter the main draw
- Main draw expansion requires cancelling the draw (only possible if no scores have been submitted), then regenerating

**Round Robin events are different (RR-only).** Group formation is **skill-first and honors the creator's group size**: players are ordered by skill (zone is a secondary tiebreak) and filled into groups of exactly the chosen size, remainder in the last group (5 players at size 5 → one group of 5; 12 → [5,5,2]). A group's zone suffix is its single zone, or **"Mixed Zones"** when zones differ. Masters + Challengers can be merged via the "Merge Draws" toggle. In edit mode the creator can **move a player between groups** ("Move to → Group"); emptying a group dissolves it (a one-player group keeps a placeholder so nobody is dropped), and groups with a played match can't be reshuffled.

RR accepts registration after the draw exists (no "draw full"); late joiners are NOT sent to reserves. The EOD script `scripts/regroup-rr.js` (run via `npm run regroup:rr`) **fills the most incomplete group first** (below the target size, closest skill, matching zone, no played matches) and otherwise forms new skill-first groups for the overflow. Groups with a completed/started match are never disturbed, and the script is idempotent (a run with no new joiners writes nothing). Bracket/knockout events keep the reserves flow above.

### Phase 3: Cancel Draw
- `handleResetDraw` checks for any `status === 'complete'` match in `tournament_matches`
- If found → blocked: "Cannot cancel — a match has already been played in this draw."
- If clear → confirms with `window.confirm` → deletes all `currentMatches` docs → returns to preview mode

---

## 7. Creator Draw Controls

### Edit Mode
- Toggle "Edit Draw" button (only in preview, before generation)
- In edit mode, creator can drag/reassign players to any slot via `handleEditPlayer`
- Changes stored in `previewSlotOverrides` (client-side, not saved until Generate is clicked)
- Edit dropdown includes ALL players in that division/choice regardless of skill group

### Move Players (Live Draw)
- After generation, `handleEditPlayer` on a live match updates `tournament_matches` doc directly
- Can swap/replace any player in any slot

### Add Player (Creator)
- Available in edit mode
- `availableUsers` = all registered users (`users` collection) minus current participants
- Adds player to `event_participants`; in preview this expands the draw automatically if count crosses a threshold
- In a generated draw, player goes to reserves list

### Draw Size Override (Preview only)
- Creator can manually set draw size via `handleSetPreviewDrawSize`
- Overrides the auto-calculated `getDrawSize` result
- Cleared on generate

### Merge / Consolidate
- **Merge Men's Singles** — combines Challengers + Masters into one draw (skill group = 'All'); BYE slots placed to separate skill groups in early rounds
- **Merge Women's Singles** — same for women
- **Consolidate Doubles** — merges Men's/Women's/Mixed doubles into one draw
- Auto-enabled when loading an event that already has merged/consolidated match docs

### Generate Matches
- Writes all preview matches to Firestore
- Clears `previewSlotOverrides` and `previewDrawSize` for that draw

### Download Draw
- Renders bracket as PNG via html-to-image (or similar)

---

## 8. Score Submission (Creator only)

1. Creator clicks on a match → score form opens
2. Enter sets (up to 3), select winner
3. On submit:
   - `tournament_matches/{matchId}` updated: scores, winner, `status = 'complete'`
   - Winner propagated to next match slot (`next_match_id` + `next_slot`)
   - **Stats updated** (idempotent delta logic):

| Stat | Winner | Loser |
|------|--------|-------|
| matchesPlayed | +1 | +1 |
| wins | +1 | — |
| loses | — | +1 |
| leaguePoints26 | +20 (final only) | +round pts (R32=1, R16=2, QF=3, SF=5, F=10) |
| tournamentsPlayed | +1 (final only) | +1 (any round) |
| pointswon | games won | games won |
| totalPointsPlayed | total games | total games |

4. **Edit score** (re-entry on completed match): computes delta (new − old) for each stat field and applies only the difference — no double-counting

### LL Draw (Reserves) — halved points
- Winner: +10 pts, rounds: R32=0.5, R16=1, QF=1.5, SF=2.5, F=5

---

## 9. LL Draw (Lucky Losers / Reserves)

- Shown below the main draw when reserves players exist
- Creator sets LL draw size (4 / 8 / 16) via `handleSetLLDrawSize`
- Creator assigns players to slots via `handleEditPlayer` (LL preview)
- "Generate LL Draw" → writes to `tournament_matches` with `bracket = 'reserves'`
- LL Draw can be reset independently of main draw
- Scores submitted for LL matches earn halved league points

---

## 10. Leagues Page

**Route:** `/leagues`  
**Auth required:** yes

- Fetches all `stats` docs where `leaguePoints26 > 0`
- Division tabs: Men's / Women's / Doubles
- `inDivision` filter on `stats.league` field (string match)
- Sorted by `leaguePoints26` descending
- Shows top 15; current user's row always shown (below separator if outside top 15)
- `*` marker on Matches column for players still active in a live tournament (not yet eliminated)
- Columns: # | Skill | Name | Matches | Wins | Pts

---

## 11. Firestore Collections Reference

| Collection | Key fields | Written by |
|-----------|-----------|-----------|
| `events` | title, type, startDate, endDate, creator_id | Creator (event form) |
| `event_participants` | user_id, event_id, tournament_choice, division, skill | Player join / Creator add |
| `tournament_matches` | event_id, draw key fields, player slots, scores, status, bracket | Creator generate / score submit |
| `stats` | matchesPlayed, wins, loses, leaguePoints26, tournamentsPlayed, pointswon, totalPointsPlayed, league | Score submission |
| `users` | name, email, phone, preferred_mode_of_contact | Signup / Profile edit |
| `preferences` | preferred_courts, availability, favourite_players | Signup / Profile edit |
