# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server on port 3000
npm run build        # production build → dist/
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

There are no automated tests. `npm run lint` (`tsc --noEmit`) is the only static check.

## Stack

React 19 + TypeScript + Vite 6. Tailwind CSS v4 (via `@tailwindcss/vite` plugin — no `tailwind.config.js`). Firebase (Auth, Firestore, Storage, Hosting). `motion/react` for animations. React Router v7.

## Architecture

### Feature folders vs. pages
`src/features/` contains self-contained modules (`events/`, `profile/`, `auth/`) each with `components/`, `hooks/`, `services/`, and `types.ts`. `src/pages/` holds top-level route components that wire features together. The tournament system is large enough to live entirely under `src/pages/tournament/`.

### Tournament draw engine (`src/pages/tournament/`)
The core is `useTournament.ts` (~960 lines), a single hook consumed only by `Tournament.tsx`. It manages:
- Live Firestore subscriptions (`onSnapshot`) for `event_participants` and `tournament_matches`
- Preview draw (client-side, in `displayMatches`) vs. generated draw (Firestore docs)
- Draw size auto-calculation: `getDrawSize(count)` in `utils.ts` — Singles and Doubles both scale 8/16/32 with participant count
- Score submission (`handleSubmitScore` → `updateMatchWithSubmission`): **three separate steps** — (1) match result batch, (2) stats batch (best-effort), (3) winner advancement (best-effort). Stats and advancement are isolated so a rules rejection never rolls back a recorded score.
- Winner advancement resolves the next match from loaded state (`matches` array) using normalized bracket comparison (`m.bracket ?? null`), with reconstructed doc ID as fallback.
- Participant draw visibility (`userDraw`): a participant sees the draw they are **actually placed in** — `userDraw` first looks for the participant's `user_id` in a generated (non-reserves) match and returns that match's draw. Only when they aren't placed yet (preview / pre-generation) does it fall back to skill-derived routing (`skill_level >= 4 → Masters else Challengers`). **Do not** revert `userDraw` to skill-only: a creator can move a player across skill groups (e.g. Challengers → Masters) without changing their `event_participants` skill, and skill-only routing would hide the draw they're really in.

Draw document IDs follow the pattern: `{eventId}_{drawKey}_{matchId}` where `drawKey = getDrawKey(tournamentChoice, division, skillGroup)`. LL (reserves) docs prefix with `{eventId}_reserves_{drawKey}_`.

### Round Robin (`rrGeneration.ts`)
Events with `tournament_format === 'rr'` use group-stage + knockout instead of a single bracket.

**Group formation (`buildZoneTierGroups`)** is **skill-band × zone, auto-sized**. Players are bucketed by skill band (`skillBand` in `utils.ts`: Beginners 2–2.5, Challengers 3–3.5, Masters 4–5) and then by preferred-court zone; each bucket is split by `splitEvenly(n)` — `g = ceil(n/5)` balanced groups of 3–5 (5→[5], 6→[3,3], 7→[4,3], 8→[4,4], 9→[5,4], 10→[5,5], 11→[4,4,3], 12→[4,4,4]). A draw with **≤5 total players is one group** (zone/band ignored). A lone player in a distinct zone becomes their own placeholder group **only when the draw already has >3 zone-clustered groups**; otherwise the band's players are pooled (ordered by zone) and split, folding the singleton in. Labels are `Group X · Band · Zone`, dropping the zone segment when unassigned/mixed. Group letters are positional at render (`rrGroupLabels`); a creator-renamed label (`rr_label_custom`) is shown verbatim. The preview (`previewRRGroups`) uses the same function so it matches the generated draw. NOTE: the skill-band sub-split is intentional (it supersedes the old "no `getTier`" rule); the **size algorithm is authoritative** and is never overridden by band boundaries, so the old 3+2 bug can't recur.

**Merge** — Masters + Challengers can be merged into one RR draw via the same "Merge Draws" toggle used for brackets (a merged draw has `skillGroup: 'All'`, which collects all skill levels).

**Participant visibility** — a participant sees **both skill draws in their own division** (Challengers + Masters for their gender; doubles → their own division), read-only. Creators see all draws. (`visibleDraws` in `useTournament.ts`.)

**Editing groups (creator)** — `handleSaveGroupEdit` rewrites one group; `handleRenameGroup` sets a custom label; `handleCreateRRGroup` spins up a new group from unplaced players ("Add Group"); `handleMoveRRPlayer` does a **true move** of a player between two groups — including **across the sibling skill draw** (Challengers ↔ Masters, same gender) via the optional `targetDraw` arg, rewriting the player into that draw's `drawKey`/`skill_group`. Emptying a group dissolves it; a group left with one player keeps a placeholder match so the lone player stays visible and movable (never silently dropped). Moves into/out of a group with a played match are refused.

**Knockout** — every group winner advances, then the best second-place players (by points → gamesWon) fill up to the next 4/8/16 bracket (`selectAdvancingPlayers`; e.g. 5 groups → 5 winners + 3 best runners-up → 8-player draw). `buildRRKnockoutDocs` sizes to the next power of two; a full field needs no byes.

**Late joiners** — unlike knockout draws, **RR accepts registration after the draw is generated** (`slotStatus` in `useJoin.ts` is bypassed for RR); they are NOT sent to the reserves/LL draw. The EOD script `scripts/regroup-rr.js` (Admin SDK) places them: groups with **4–5 players (or any played group) are locked**; only groups with **≤3 players** accept a joiner, needing a matching band (zone preferred), else the overflow forms new `(band, zone)` groups via `splitEvenly`. Groups with played matches are never touched. The script duplicates the pure helpers from `rrGeneration.ts`/`utils.ts` — keep them in sync.

### Stats data flow (read before changing)
One source writes to `stats/{userId}` at runtime:
- **`useTournament.ts`** (`updateMatchWithSubmission`) — live increments on score confirmation

All fields are camelCase (`matchesPlayed`, `leaguePoints26`, etc.). Snake_case and `_xlsx` fields are dead.

### Firestore collections
| Collection | Written by |
|---|---|
| `users`, `stats`, `preferences` | Signup / profile / `profileBootstrap.ts` |
| `events` | Creator via event form |
| `event_participants` | Player self-join (`useJoin.ts`) or creator (`handleAddPlayer`) |
| `tournament_matches` | Creator generate/score (`useTournament.ts`) |

Security rules (`firestore.rules`): owners can only update `skill_level / tournament_preference / name / user_id` in `stats` — scoring fields are organiser-only. `event_creator` in `preferences` can only be set by the super-admin UID (`7PvfzNtDmsOq5GLMieId7QRT7wH3`). Rules require `firebase deploy --only firestore:rules` to take effect — a git push alone does not deploy them.

### Auth flow
`AuthContext.tsx` calls `ensureUserProfileDocuments` (`profileBootstrap.ts`) on every login to guarantee `users/stats/preferences` docs exist. The `profile` object (`UserProfile` type) bundles all three docs and is consumed throughout the app via `useAuth()`.

### Change discipline
Fix exactly what is asked. Do not bundle adjacent cleanup, refactors, or new files into a stated request. If you notice something else broken, mention it in one sentence at the end and wait to be asked.
