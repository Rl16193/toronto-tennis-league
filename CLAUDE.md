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

Draw document IDs follow the pattern: `{eventId}_{drawKey}_{matchId}` where `drawKey = getDrawKey(tournamentChoice, division, skillGroup)`. LL (reserves) docs prefix with `{eventId}_reserves_{drawKey}_`.

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
| `score_submissions` | Creator score form |

Security rules (`firestore.rules`): owners can only update `skill_level / tournament_preference / name / user_id` in `stats` — scoring fields are organiser-only. `event_creator` in `preferences` can only be set by the super-admin UID (`7PvfzNtDmsOq5GLMieId7QRT7wH3`). Rules require `firebase deploy --only firestore:rules` to take effect — a git push alone does not deploy them.

### Auth flow
`AuthContext.tsx` calls `ensureUserProfileDocuments` (`profileBootstrap.ts`) on every login to guarantee `users/stats/preferences` docs exist. The `profile` object (`UserProfile` type) bundles all three docs and is consumed throughout the app via `useAuth()`.

### Change discipline
Fix exactly what is asked. Do not bundle adjacent cleanup, refactors, or new files into a stated request. If you notice something else broken, mention it in one sentence at the end and wait to be asked.
