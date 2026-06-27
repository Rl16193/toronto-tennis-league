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
node scripts/export-firestore.js

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

**Group formation (`buildZoneTierGroups`)** is **skill-first, size-honoring**: players are ordered by skill descending (zone is only a secondary tiebreak so same-skill players who share a zone cluster), then filled into groups of exactly the creator-selected size, with the remainder in the last group ("fill to size, leftovers in last"). 5 players at size 5 → one group of 5; 12 at size 5 → [5,5,2]. A trailing size-1 group is merged back (it would generate no matches and drop the player). The label's zone suffix is the group's single distinct zone, or **"Mixed Zones"** when zones differ. **Do not** reintroduce a hidden skill-tier sub-split (the old Beginner/Intermediate/Advanced `getTier`) — it overrode the creator's group size and was the cause of the 3+2 bug. Group letters are positional at render (`rrGroupLabels`); the stored `rr_group_label` only supplies the zone suffix. The preview (`previewRRGroups`) uses the same function so it matches the generated draw.

**Merge** — Masters + Challengers can be merged into one RR draw via the same "Merge Draws" toggle used for brackets (a merged draw has `skillGroup: 'All'`, which collects all skill levels).

**Editing groups (creator)** — `handleSaveGroupEdit` rewrites one group; `handleMoveRRPlayer` does a **true move** of a player between two groups (rebuilding both in one batch). Emptying a group dissolves it; a group left with one player keeps a placeholder match so the lone player stays visible and movable (never silently dropped). Moves into/out of a group with a played match are refused.

**Late joiners** — unlike knockout draws, **RR accepts registration after the draw is generated** (`slotStatus` in `useJoin.ts` is bypassed for RR); they are NOT sent to the reserves/LL draw. The EOD script `scripts/regroup-rr.js` (Admin SDK) places them: **fill the most incomplete group first** (below target size, closest skill, matching zone, no played matches) else form new skill-first groups for the overflow. Groups with played matches are never touched. The script duplicates the pure helpers from `rrGeneration.ts`/`utils.ts` — keep them in sync.

The RR knockout stage auto-sizes to the next power of two (`buildRRKnockoutDocs`) with byes for top seeds.

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
