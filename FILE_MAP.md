# File Map — Toronto Tennis League

All source files, their paths, and what they do.

---

## Root Config

| File | Description |
|------|-------------|
| `package.json` | NPM scripts, dependencies, and project metadata |
| `vite.config.ts` | Vite bundler config — dev server, vendor chunk splitting, Tailwind plugin |
| `tsconfig.json` | TypeScript compiler settings |
| `firebase.json` | Firebase Hosting config — cache headers, SPA rewrite rules |
| `index.html` | HTML entry point for the Vite SPA |
| `firestore.rules` | Firestore security rules — who can read/write each collection |
| `CLAUDE.md` | Instructions for Claude Code when working in this repo |
| `FILE_MAP.md` | This file |

---

## Public Assets (`public/`)

| File | Description |
|------|-------------|
| `public/Logo.png` | Site logo used in the Navbar |
| `public/robots.txt` | SEO crawler directives |
| `public/sitemap.xml` | SEO sitemap |
| `public/2025League.xlsx` | Source spreadsheet for historical league stats (reference only) |
| `public/Tennis Courts Facilities - 4326.csv` | Court location data used by the court search autocomplete |

---

## Scripts (`scripts/`)

| File | Description |
|------|-------------|
| `scripts/export-firestore.js` | Exports Firestore collections (users, stats, preferences, event_participants) to CSV files in `scripts/exports/` — requires `serviceAccount.json` in project root |
| `scripts/regroup-rr.js` | EOD automation (Admin SDK) — places RR late joiners into vacant matching groups or forms new groups by skill tier + zone; `npm run regroup:rr`, supports `--dry-run` |

---

## App Entry (`src/`)

| File | Description |
|------|-------------|
| `src/main.tsx` | React root render wrapped in `ErrorBoundary` |
| `src/App.tsx` | Route definitions, lazy-loaded pages, `PrivateRoute`, `ScrollToTop`, `RouteFallback` |
| `src/index.css` | Global Tailwind CSS styles |
| `src/types.ts` | Shared TypeScript interfaces — `UserData`, `UserStats`, `UserPreferences`, `TennisEvent`, `EventParticipant` |
| `src/vite-env.d.ts` | Vite ambient type declarations |

---

## Context (`src/context/`)

| File | Description |
|------|-------------|
| `src/context/AuthContext.tsx` | Global auth state — current user, full profile, loading flag, `refreshProfile`. Consumed via `useAuth()` throughout the app |

---

## Lib (`src/lib/`)

| File | Description |
|------|-------------|
| `src/lib/firebase.ts` | Initialises Firebase app, Auth, Firestore, Storage, and Analytics — single shared instance |
| `src/lib/profileBootstrap.ts` | Creates default `users`, `stats`, and `preferences` docs on first login if they don't exist |

---

## Services (`src/services/`)

| File | Description |
|------|-------------|
| `src/services/accountService.ts` | Single utility — `emailExistsInProfiles()` checks Firestore for a duplicate email before signup |

---

## Utilities (`src/utils/`)

| File | Description |
|------|-------------|
| `src/utils/eventDates.ts` | Low-level date helpers — `getEventStartDate`, `parseValidDate`, `formatDateLabel`, `sortEventsByStartDate` for Firestore timestamp objects |
| `src/utils/eventTypes.ts` | Event classification helpers — `isTournamentEvent`, `isRecurringWeekly`, `isMeetupEvent`, `isSpecialEvent` |
| `src/utils/skillLevels.ts` | Skill level constants, descriptions, and tournament preference options |

---

## Shared Components (`src/components/`)

| File | Description |
|------|-------------|
| `src/components/Layout.tsx` | Wraps every page with `Navbar`, `Footer`, and an animated `motion.main` content area |
| `src/components/Navbar.tsx` | Fixed top navigation — logo, nav links (Events / Leagues), auth buttons, mobile hamburger menu |
| `src/components/Footer.tsx` | Site footer — branding, quick links, Terms / Privacy / Rules, contact info |
| `src/components/Button.tsx` | Reusable button — variants: `primary`, `outline`, `ghost`; sizes: `sm`, `md`, `lg` |
| `src/components/Input.tsx` | Reusable styled input wrapper |
| `src/components/AlertMessage.tsx` | Toast / banner for success and error feedback |
| `src/components/ModalShell.tsx` | Generic modal container used by `ScoreModal` and `CreatorEventModal` |

---

## Pages (`src/pages/`)

| File | Description |
|------|-------------|
| `src/pages/Home.tsx` | Public landing page — hero section, feature cards, photo gallery |
| `src/pages/Login.tsx` | Email and Google sign-in form |
| `src/pages/Signup.tsx` | Registration form — email, password, name, phone, availability |
| `src/pages/Events.tsx` | Lists all events, join form for players, event creation modal for organizers |
| `src/pages/Leagues.tsx` | League standings and rankings page |
| `src/pages/Profile.tsx` | Authenticated user's own profile — editable info, availability, skills, stats, joined events |
| `src/pages/PlayerProfile.tsx` | Read-only view of another player's profile — name, stats, availability calendar |
| `src/pages/StaticPages.tsx` | Exports `Rules`, `Terms`, `Privacy`, and `Contact` as static page components |
| `src/pages/Tournament.tsx` | Tournament management page — consumes `useTournament` hook, renders draw UI and scoring |

---

## Tournament System (`src/pages/tournament/`)

| File | Description |
|------|-------------|
| `src/pages/tournament/useTournament.ts` | Core hook (~960 lines) — Firestore subscriptions, draw state, score submission, winner advancement, player list management |
| `src/pages/tournament/types.ts` | Tournament-specific TypeScript types — `DrawTab`, `SkillGroup`, `TournamentMatch`, `TournamentPlayer`, `DrawConfig`, `ScoreForm` |
| `src/pages/tournament/utils.ts` | Helper functions — `formatPlayerName`, `getEventDate`, `isTournamentStarted`, `getDrawSize`, `fallbackTemplate`, `getDrawKey` |
| `src/pages/tournament/drawConfigs.ts` | Hardcoded draw configurations — `VISIBLE_DRAWS`, `MENS_MERGED_DRAW`, `WOMENS_MERGED_DRAW`, `CONSOLIDATED_DOUBLES_DRAW` |
| `src/pages/tournament/drawGeneration.ts` | Generates bracket templates from participant counts — determines match slots and seedings |
| `src/pages/tournament/scoreSubmission.ts` | Firestore write logic for submitting match scores — batches match result, stats increment, winner advancement |
| `src/pages/tournament/bracketImage.ts` | Converts bracket data to a downloadable PNG image |
| `src/pages/tournament/BracketView.tsx` | Renders the visual bracket grid — matches, player names, scores |
| `src/pages/tournament/BracketErrorBoundary.tsx` | Error boundary wrapping `BracketView` to catch and display render errors gracefully |
| `src/pages/tournament/DrawTabs.tsx` | Tab bar for selecting draw division (Men's / Women's / Doubles) and skill group |
| `src/pages/tournament/TournamentHeader.tsx` | Header showing event name, date, status badge, and organizer controls |
| `src/pages/tournament/OpponentCard.tsx` | Collapsible "Your Matches" card — current + potential next-round opponents (bracket draws) |
| `src/pages/tournament/ScoreModal.tsx` | Modal form for submitting set scores for a match |
| `src/pages/tournament/AddPlayerPanel.tsx` | Organizer panel to add, edit, or remove players from the draw |
| `src/pages/tournament/rrGeneration.ts` | Round Robin engine — zone/tier group formation, pairings, group + knockout match builders, standings, advancer selection |
| `src/pages/tournament/RoundRobinView.tsx` | Renders RR group-stage cards and the knockout bracket |
| `src/pages/tournament/RRGroupCard.tsx` | Single RR group — standings table + collapsible match list, creator group-edit |
| `src/pages/tournament/RROpponentPanel.tsx` | Collapsible "Your Group" card for RR participants (opponents + contact + profile link) |

---

## Features — Auth (`src/features/auth/`)

| File | Description |
|------|-------------|
| `src/features/auth/authMessages.ts` | Reusable error and warning message strings for auth flows |
| `src/features/auth/useGoogleSignIn.ts` | Custom hook — handles Google sign-in and account linking to existing email accounts |

---

## Features — Signup (`src/features/signup/`)

| File | Description |
|------|-------------|
| `src/features/signup/signupValidation.ts` | Validates signup form fields — email format, password strength, name, phone |
| `src/features/signup/utils/courtSearch.ts` | Court location autocomplete — searches the CSV data file by name or address |

---

## Features — Events (`src/features/events/`)

| File | Description |
|------|-------------|
| `src/features/events/types.ts` | Event feature types — extends `TennisEvent` from `src/types.ts` |
| `src/features/events/services/eventService.ts` | Fetches, creates, and validates events in Firestore; handles event image upload to Storage |
| `src/features/events/hooks/useEvents.ts` | Hook — manages event list, filtering by type, and current user's joined status |
| `src/features/events/hooks/useJoin.ts` | Hook — manages join form state, validation, and submission to `event_participants` |
| `src/features/events/utils/eventFormatters.ts` | Formats event dates and types into human-readable display strings |
| `src/features/events/components/EventCard.tsx` | Displays a single event card with details and the join form |
| `src/features/events/components/CreatorEventModal.tsx` | Modal for organizers to create a new event with all fields and image upload |

---

## Features — Profile (`src/features/profile/`)

| File | Description |
|------|-------------|
| `src/features/profile/types.ts` | Profile feature types — `ProfileEditData` and related interfaces |
| `src/features/profile/services/profileService.ts` | Firestore writes for profile mutations — name, phone, skill level, availability, email, password, Google link |
| `src/features/profile/hooks/useProfileData.ts` | Fetches the current user's joined events for display on the profile page |
| `src/features/profile/hooks/useProfileActions.ts` | Dispatches profile mutation actions to `profileService` with loading and error state |
| `src/features/profile/components/ProfileInfo.tsx` | Editable section for name, phone, contact method, email change, and Google account linking |
| `src/features/profile/components/ProfileContactEdit.tsx` | Sub-form for changing email or password |
| `src/features/profile/components/ProfileContactView.tsx` | Read-only display of current email and contact preference |
| `src/features/profile/components/ProfileSkills.tsx` | Edit skill level and tournament preference (dropdown selects) |
| `src/features/profile/components/ProfileAvailability.tsx` | Edit available days/times, preferred courts, and favourite players |
| `src/features/profile/components/ProfileStats.tsx` | Read-only stats display — matches played, wins, losses, points. Used by both `Profile.tsx` and `PlayerProfile.tsx` |
| `src/features/profile/components/ProfileEvents.tsx` | Lists events the user has joined, with a remove button for each |
