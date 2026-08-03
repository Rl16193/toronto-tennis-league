# Function Inventory — Toronto Tennis League App

Full function-by-function inventory across the codebase (React/TS frontend, Firebase Cloud Functions, admin scripts). Grouped by feature area, then by file. Line numbers refer to current file state.

**Refreshed** after a dead-code removal + de-duplication pass (see CLAUDE.md and git history). The app has changed substantially since the previous version of this document — several pages were rebuilt, several files were removed, and several new modules were added (`Matches.tsx`, `History.tsx`, `Notifications.tsx`, `features/friendlies/`, several shared UI components, `ThemeContext`, `functions/groupAwards.js`). This version reflects the current codebase; it does not reproduce every removed/superseded entry from the prior version.

---

## 1. Tournament Engine (`src/pages/tournament/`, `src/pages/Tournament.tsx`)

### `useTournament.ts` (~2030 lines — the core draw engine hook)
| Function | Line | Description |
|---|---|---|
| `computeMatchPoints` | 24 | **New (de-dup).** Module-level: computes a match's loser/winner points + final/apply flags — shared by `updateMatchWithSubmission` (apply) and `reverseMatchStatsInto` (its exact inverse). |
| `useTournament` | ~40 | Root hook; owns all tournament state, Firestore subscriptions, and every handler below. |
| `load` (participants effect) | 115 | Live `onSnapshot` loader for `event_participants`. |
| `norm` | 233 | Normalizes a string (trim/lowercase/collapse spaces) for name matching. |
| `liveName` | 589 | Resolves a player's current display name from live user data, falling back to the match snapshot. |
| `liveContact` | 593 | Resolves a player's current contact info live, falling back to snapshot. |
| `run` (matches effect) | 680 | Live `onSnapshot` loader for `tournament_matches` + score submissions. |
| `run` (auto-place late joiners) | 848 | Distributes newly-joined RR players into eligible groups automatically. |
| `currentDrawKey` | 393 | **New (de-dup).** Memoized `getDrawKey(...)` for `currentDraw`, referenced at every one of its ~8 call sites below instead of each recomputing it. |
| `autoLabelFor` | 563 | **New (de-dup).** Shared band/zone auto-label computation, used by both `previewRRLabels` and `buildRRLabelsFrom`. |
| `generateDraw` | 907 | Creates a bracket draw's Firestore match docs from placed/seeded players for a given `DrawConfig`. |
| `updateMatchWithSubmission` | 1004 | Confirms a score: writes the match result, updates stats/points (via `computeMatchPoints`), then (best-effort) advances the winner — isolated so a rules rejection never rolls back a recorded score. |
| `sameDraw` | 1120 | Predicate matching another match in the same bracket/draw. |
| `handleUpdateRoundDeadline` | 1157 | Creator sets/edits a round's scheduling deadline. |
| `handleSetPreviewDrawSize` | 1173 | Overrides the auto-calculated preview draw size for a label. |
| `handleGenerateAll` | 1177 | Generates every eligible draw for the event in one action. |
| `reverseMatchStatsInto` | 1232 | Un-applies a match's stat/points contributions into a batch (used when resetting/editing), via `computeMatchPoints`. |
| `reverseRRBonusesInto` | 1237 | Un-applies Round Robin group-stage bonus points into a batch. |
| `handleResetDraw` | 1247 | Deletes a generated bracket draw and reverses its stats. |
| `handleEditPlayer` | 1279 | Creator swaps a player into/out of a match slot. |
| `handleSubmitScore` | 1331 | Validates and submits a score — player path creates a `score_submissions` doc, creator path writes directly via `updateMatchWithSubmission`. |
| `handleConfirmSubmission` | 1407 | Creator approves a pending player-submitted score. |
| `handleRejectSubmission` | 1437 | Creator rejects a pending player-submitted score. |
| `handleAddPlayer` | 1448 | Creator manually adds a player/team to the event. |
| `handleOpenScoreForm` | 1503 | Opens the score-entry modal for a match. |
| `rrDraftKey` | 1514 | Builds the Firestore key for the current RR draft. |
| `saveRRDraft` | 1520 | Persists an in-progress (ungenerated) RR group draft. |
| `setRRWithdrawnMembership` | 1540 | Adds/removes players from the RR "withdrawn" set. |
| `handleGenerateRR` | 1548 | Generates the Round Robin group-stage draw from an `RRConfig`. |
| `handleSaveGroupEdit` | 1589 | Rewrites one RR group's roster, including moves in from other groups within the same draw. |
| `handleCreateRRGroup` | 1765 | Creates a new RR group from unplaced players ("Add Group"). |
| `handleRenameGroup` | 1814 | Sets a custom label on an RR group. |
| `writeSchedule` | 1849 | Shared helper writing a schedule patch to a match doc. |
| `handleAskOrganizerSchedule` | 1860 | Player requests organizer help scheduling a match. |
| `handleSetSchedule` | 1867 | Sets a match's date/AM-PM slot. |
| `handleResetRR` | 1874 | Deletes the entire RR group stage. |
| `handleGenerateRRKnockout` | 1905 | Builds the knockout bracket from RR group winners + best runners-up. |

*(Plus a background cross-draw deduplication effect keyed on `rrSiblingDraw`/`rrSiblingMatches` that silently removes a player from this draw's groups if they're found seated in the sibling skill draw's groups — no dedicated "move between skill draws" action exists; see CLAUDE.md. Plus ~35 smaller inline closures — comparators, predicates, and `useMemo`/`useEffect` bodies — computing `userDraw`, `visibleDraws`, `displayMatches`, etc.)*

*Cleanup note: the entire Reserves/Lucky-Loser (LL) draw subsystem (`reservesPlayers`, `currentReservesMatches`, `llDrawDisplayMatches`, `handleSetLLDrawSize`, `handleGenerateReservesDraw`, `handleResetLLDraw`, etc.) and the unused `handleRemoveParticipant` were removed as dead code — no UI consumer called any of them.*

### `Tournament.tsx` (top-level route/page, 525 lines)
| Function | Line | Description |
|---|---|---|
| `getDrawState` | 30 | Labels a set of matches as preview/in-progress/finished. |
| `formatEventRange` | 59 | Formats an event's start–end date range for display. |
| `Tournament` | 82 | Page component; wires `useTournament()` to the draw UI, tabs, and modals. |
| `selectEvent` | 176 | Navigates to/selects a specific tournament event. |
| `drawHasCompleted` | 227 | Whether a draw config has at least one completed, non-reserves match (used to hide unplayed draws on completed events). |
| `drawSelector` (JSX var) | 234 | Renders the draw-tab selector UI. |
| `roundRobinFull` | 249 | Renders the full-width RR groups + knockout view. |
| `drawContent` (JSX var) | 281 | Renders the active draw's bracket/RR content. |

### `rrGeneration.ts` (Round Robin generation — pure functions, unchanged)
| Function | Line | Description |
|---|---|---|
| `splitEvenly` | 17 | Splits `n` players into balanced groups of 3–5 (the core group-sizing algorithm). |
| `sharedZone` | 29 | Returns the common preferred-court zone across a player list, if any. |
| `sharedBand` | 35 | Returns the common skill band across a player list, if any. |
| `autoLabel` | 41 | Builds a group's display label (`Group X · Band · Zone`). |
| `buildZoneTierGroups` | 56 | Forms groups by skill-band × zone, auto-sized via `splitEvenly` — the group-formation entry point. |
| `generateGroupPairings` | 151 | Produces the round-robin match schedule (all pairs) for an n-player group. |
| `buildRRGroupMatchFields` | 179 | Builds the Firestore match doc fields for one RR group's matches. |
| `buildSafeGroupRewrite` | 241 | Validates and builds a group-edit rewrite, refusing moves that touch played matches. |
| `computeGroupStandings` | 275 | Computes a group's standings table (points, games won/lost) from its matches. |
| `nextPow2` | 328 | Rounds up to the next power of two (for knockout bracket sizing). |
| `selectAdvancingPlayers` | 340 | Picks group winners + best runners-up to fill the knockout bracket. |
| `selectGroupWinners` | 381 | Extracts the #1 finisher from each group. |
| `buildRRKnockoutDocs` | 409 | Builds the Firestore match docs for the post-group knockout bracket. |
| `deriveRRConfig` | 506 | Reconstructs an `RRConfig` from existing RR match docs (for re-editing/display). |

### `utils.ts` (tournament shared helpers, 394 lines)
| Function | Line | Description |
|---|---|---|
| `formatScheduledDate` | 7 | Formats a scheduled match date + AM/PM slot for display. |
| `formatSetScores` | 24 | Formats a match's set scores as a string (e.g. "6-3, 6-4"). Now typed against a minimal `ScoredSets` shape so it also accepts a `ScoreSubmissionDoc`. |
| `getMatchDisplayFlags` | 53 | **New (de-dup).** Derives the shared per-match display state (preview/editable/score-text/submit-button visibility) used identically by `BracketView` and `BracketAccordion`. |
| `formatPlayerName` | 93 | Formats/cleans a player name for display. |
| `getParticipantDisplayName` | 107 | Resolves the display name for a participant, using live user data if available. |
| `parseDateValue` | 119 | Parses a Firestore date-like value into a `Date`. |
| `getEventDate` | 121 | Resolves an event's canonical start date across legacy field name variants. |
| `isTournamentStarted` | 124 | Whether a tournament's start date has passed. |
| `getDrawKey` | 129 | Builds the draw's Firestore doc-ID key from choice/division/skill group. |
| `skillBand` | 134 | Maps a numeric skill level to a band label (Beginners/Challengers/Masters). |
| `getScheduleState` | 144 | Derives a match's scheduling state object. |
| `getDrawSize` | 151 | Auto-calculates bracket size (8/16/32) from participant count. |
| `fallbackTemplate` | 157 | Builds a placeholder bracket template before real matches exist. |
| `normalizeTemplateMatches` | 206 | Normalizes template match objects to a consistent shape. |
| `getWinnerPlaceholder` | 216 | Builds the "Winner of Match X" placeholder label for a future round slot. |
| `getContactValue` | 227 | Extracts a usable contact value from user data. |
| `normalizeForMatch` | 234 | Normalizes a name for fuzzy participant matching. |
| `deduplicateDoublesTeams` | 242 | Removes duplicate doubles-team entries from a participant list. |
| `filterParticipantsForDraw` | 276 | Filters the participant pool down to those eligible for a specific draw. |
| `isSpecialDraw` | 298 | Whether a draw config is a merged/special (non-standard) draw. |
| `sortParticipantsForDraw` | 303 | Sorts participants into seeding order for draw generation. |
| `mapParticipantsToPlayers` | 321 | Maps raw participant docs into `TournamentPlayer` view objects. |
| `buildMatchFields` | 342 | Builds the Firestore fields for a single bracket match doc. |
| `buildPlayerList` | 381 | Assembles the ordered player list feeding draw generation. |

### `bracketImage.ts` (SVG/PNG export, 309 lines)
| Function | Line | Description |
|---|---|---|
| `getRoundLabels` | 4 | Returns round names (Round of 16, QF, SF, Final…) for a draw size. |
| `escapeSvg` | 12 | Escapes text for safe SVG embedding. |
| `truncate` | 15 | Truncates long names for the exported image. |
| `formatDeadline` | 19 | Formats a round deadline for the exported image (SVG-specific: `"Till "` prefix + empty guard). |
| `formatSvgScore` | 27 | Formats a match score for SVG rendering (kept separate from `formatSetScores` — different escaping needs). |
| `buildDrawSvg` | 56 | Builds the full bracket SVG markup. |
| `buildRRGroupSvg` | 130 | Builds an RR group-table SVG. |
| `doublesShortNames` | 154 | Shortens doubles team names to fit the image. |
| `contactOf` | 176 | Resolves a player's contact info for the exported image. |
| `downloadRRGroupsAsPng` | 245 | Downloads the RR groups image as PNG. |
| `downloadDrawAsPng` | 277 | Downloads the bracket image as PNG. |

*Cleanup note: `openDrawInNewTab` and `openRRGroupsInNewTab` (the retired "PNG in a new tab" player fallback) were removed as dead code.*

### Tournament sub-components
| File | Function | Description |
|---|---|---|
| `BracketView.tsx` | `getRoundTone` | Picks a round's accent color/style. |
| | `isPlaceholder` | Whether a slot name is an unresolved placeholder. |
| | `getRoundState` (exported) | Derives a round's preview/loading/started/finished state — imported by `BracketAccordion.tsx`. |
| | `formatDeadline` (exported) | Formats a round deadline for the desktop UI badge (no `"Till "` prefix — different shape than `bracketImage.ts`'s). Imported by `BracketAccordion.tsx`. |
| | `BracketPlayer` | Renders one player row in a bracket cell. |
| | `PlayerSelect` (exported) | Dropdown for creator to assign a player into a bracket slot — shared with `BracketAccordion.tsx`. |
| | `BracketView` | Main desktop bracket-rendering component; per-match flags now come from `getMatchDisplayFlags` (utils.ts) instead of an inline block. |
| `BracketAccordion.tsx` | `BracketAccordion` | **New.** Mobile round-by-round accordion view for bracket draws — round chips + one-open-at-a-time sections. Sibling to `BracketView`, not a replacement (`Tournament.tsx` renders one or the other by breakpoint). Reuses `PlayerSelect`/`formatDeadline`/`getRoundState` from `BracketView.tsx` and `getMatchDisplayFlags` from `utils.ts`. |
| `RoundRobinView.tsx` | `toggle` | Toggles a player's selection in the group-editor UI. |
| | `submit` | Submits an edited group's roster. |
| | `RoundRobinView` | Main RR groups + standings + knockout rendering component. |
| `RRGroupCard.tsx` | `RRGroupCard` | Renders one RR group's standings table and match list. |
| `RRConfigModal.tsx` | `RRConfigModal` | Modal for configuring/confirming RR draw generation. |
| `DrawTabs.tsx` | `drawKey` / `chipLabel` / `select` | Draw-tab identity/label helpers and the tab-select handler (now built on the shared `ChipRow`/`SegmentedControl` components). |
| | `DrawTabs` | Renders the division/skill-group draw-selector tabs. |
| `OpponentPanels.tsx` | `scheduleBadge` | Renders a match's scheduling-status badge (returns `null` when nothing to show, unlike the old always-render version). |
| | `CurrentMatchCell` | Renders a player's current/next-match cell. |
| `ScoreModal.tsx` | `ScoreModal` | Modal for entering/submitting a match score. |
| | `handleSubmit` | Form submit handler inside the modal. |
| | `setSetValue` | Updates one set's score value (now built on the shared `Stepper` component). |
| `AddPlayerPanel.tsx` | `AddPlayerPanel` | Creator UI panel for manually adding a player. |
| | `handler` (outside-click) | Closes the panel on outside click. |
| | `handleAdd` | Submits the add-player action. |
| `PendingScoresPanel.tsx` | `PendingScoresPanel` | Lists pending player-submitted scores for creator confirm/reject. *(De-dup: its local `setScoreString` duplicate was removed — it now imports `formatSetScores` from `utils.ts`.)* |
| `TournamentHeader.tsx` | `TournamentHeader` | Renders the tournament page header (title, dates, actions). |
| `ContactOpponentButton.tsx` | `toE164Phone` | Normalizes a phone number to E.164 for `tel:`/WhatsApp links. |
| | `pillButtonCls` (exported) | Shared pill-button CSS-class builder, reused by `ScheduleControls.tsx` and other inline action buttons. |
| | `btnCls` | Thin wrapper over `pillButtonCls`. |
| | `ContactOpponentButton` | Contact dropdown (WhatsApp/Text/Call/Email), portalled to `<body>` with its own scroll-tracked positioning; only one instance open at a time app-wide via a window event. |
| `ScheduleControls.tsx` | `ScheduleControls` | Renders "Request Scheduling Assistance" / "Submit Score" action buttons. |
| `ScheduleRequestsPanel.tsx` | `RequestRow` | One row letting a creator set a date/slot for a scheduling request. |
| | `ScheduleRequestsPanel` | Lists all pending scheduling requests for a creator. |
| `BracketErrorBoundary.tsx` | `BracketErrorBoundary` (class) | React error boundary wrapping the bracket UI. |
| | `getDerivedStateFromError` | Static lifecycle method catching render errors. |

---

## 2. Events (`src/pages/Events.tsx`, `src/features/events/`)
| File | Function | Description |
|---|---|---|
| `Events.tsx` | `Events` | Events listing/creation page component. |
| | `handleJoin` | Opens the join flow for an event (renamed from `handleExpand`; now opens `JoinEventSheet` rather than expanding an inline form). |
| | `handleCreateEvent` | Submits the creator's new-event form. |
| `useEvents.ts` | `useEvents` | Hook loading all events + the user's join state. |
| | `getJoinedChoices` | Returns which tournament choices (Singles/Doubles) a user joined for an event. |
| | `hasJoinedRegularEvent` | Whether the user joined a non-tournament event. |
| | `hasJoinedTournamentChoice` | Whether the user joined a specific tournament choice. |
| | `hasJoinedAnyTournament` | Whether the user joined any tournament draw for the event. |
| | `isFullyJoinedEvent` | Whether the user has joined every available slot in the event. |
| `useJoin.ts` | `useJoin` | Hook handling the join-event flow (singles/doubles branch, slot assignment). *(De-code: `handleStartJoin`/`SIGNUP_ROUTE` and the `navigate` param were removed — dead; `JoinEventSheet.tsx` is now the sole join-flow UI.)* |
| | `isOpenSlot` | Whether a participant slot is empty/placeholder (Player Loading/BYE). |
| | `findSlot` | Finds an open slot for a given tournament choice/division/group. |
| | `handleSubmitJoin` | Submits the join request, writing `event_participants`. Its local `trackJoin` closure **(new, de-dup)** fires the `join_event` analytics event, called from both the regular-event and tournament-event branches instead of duplicating the block. |
| `JoinEventSheet.tsx` | `chip` | CSS-class helper for a selectable chip's active state. |
| | `JoinEventSheet` | **New.** The join-flow bottom sheet — replaced the old in-card expanding join form; calls `useJoin`'s state/`handleSubmitJoin`. |
| `eventService.ts` | `fetchEvents` | Fetches all events from Firestore. |
| | `resolveStorageUrl` | Resolves a Storage path to a public download URL. |
| | `validateEventForm` | Validates the creator's new-event form fields. |
| | `createEvent` | Writes a new event doc to Firestore. *(Cleanup: `uploadEventImage`/`ACCEPTED_EVENT_IMAGE_TYPES` were removed — dead, no file-input consumer.)* |
| `EventCard.tsx` | `getJoinLastDateMs` | Extracts an event's join-deadline as a timestamp. |
| | `isLateRegistration` (exported) | Whether the event is within its late-registration window. |
| | `isJoinHardClosed` | Whether joining is fully closed. |
| | `EventCard` | Renders one event's card (info, join button, status). |
| `CreatorEventModal.tsx` | `CreatorEventModal` | Modal form for creating/editing an event (creator-only). |
| `eventFormatters.ts` | `getEventDays` | Returns which weekdays a recurring event runs on. |
| | `formatEventSchedule` | Formats a recurring event's schedule string. |
| | `formatTournamentRange` | Formats a tournament's date range string. |
| `eventTypes.ts` | `isRecurringWeekly` / `isTournamentEvent` / `isLadderEvent` / `isSeasonOpener` / `isWeekendMatchdaysEvent` / `isTopspinMeetupEvent` | Type-predicate helpers classifying an event by its `type`/`title`. *(Cleanup: `isMeetupEvent`/`isSpecialEvent` were removed — unused.)* |

---

## 3. Profile (`src/pages/Profile.tsx`, `src/pages/PlayerProfile.tsx`, `src/features/profile/`)
| File | Function | Description |
|---|---|---|
| `Profile.tsx` | `Profile` | Own-profile page (314 lines — now inlines its own streak/points/upcoming-matches hub tiles directly rather than delegating to separate `RecentMatches`/`ProfileEvents` components). |
| `PlayerProfile.tsx` | `deriveResults` | Derives streak, best-finish, and won-final flags from a player's tournament matches. |
| | `SectionLabel` | Renders a labeled section heading. |
| | `Pill` | Renders a small pill/badge element. |
| | `PlayerProfile` | Public player-profile page (another user's view). |
| | `loadPlayer` | Loads the viewed player's profile + stats. |
| | `initial` | Computes the avatar-fallback initial letter. |
| `ProfileInfo.tsx` | `tournamentPref` | Maps skill number to a tournament-preference label (local — `PlayerProfile.tsx` has no counterpart use for it). |
| | `ProfileInfo` | Renders/edits the profile's personal-info fields. |
| | `open` | Opens the inline editor for a given field row. |
| | `save` | Persists an inline edit via the passed action + closes the editor. |
| | `computeZone` | Derives the player's zone from selected courts. |
| | `addCourt` | Adds a preferred court to the profile. |
| | `onPickAvatar` | Handles avatar file selection/upload. |
| `useProfileData.ts` | `useProfileData` | Hook loading the current user's full profile bundle. |
| `useProfileActions.ts` | `useProfileActions` | Hook bundling all profile mutation actions with loading/message state. |
| | `showMessage` | Sets a transient success/error message. |
| | `withProfileUpdate` | Wraps an update call with loading state + success/error messaging. |
| | `handleChangeEmail` | Changes the account email (re-auth + Firestore + Auth update). |
| | `handleRefreshEmailChange` | Re-checks verification status after an email change. |
| | `handleUpdateEventDates` | Updates which dates the user is attending a recurring event. |
| `profileService.ts` | `syncName` | Internal: writes name to `users`. |
| | `updateName` / `updatePhone` / `updateWhatsappContact` / `updateBio` / `updateAvatar` / `updateSkills` / `updateLeagueAndAge` / `updateDisplayBadges` / `updatePreferredCourts` / `updateFavouritePlayers` / `updateAvailabilityGrid` | One Firestore-write function per editable profile field. `updateAvailabilityGrid` currently has no UI caller since the availability editor was removed — kept because rebuilding that editor (not removing the write path) is the intended fix. |
| | `changeEmail` | Re-authenticates and updates the Firebase Auth email. |
| | `updateEventParticipantDates` | Updates a participant's attendance dates. |

*Cleanup note: `ProfileEvents.tsx` and `RecentMatches.tsx` (whole files) were deleted — neither was imported anywhere; `Profile.tsx` now inlines the same functionality. `useProfileActions.ts`'s `handleRemoveEvent` and `profileService.ts`'s `removeEventParticipant` were removed with them (their only caller). `profile/types.ts`'s unused `ProfileEditData` type was also removed.*

*De-dup note: `skillTier` and `leagueDivision` were duplicated in both `PlayerProfile.tsx` and `ProfileInfo.tsx` — both now import them from `src/utils/skillLevels.ts` instead.*

---

## 4. Leagues, Friendlies & Matches (`src/pages/Leagues.tsx`, `src/pages/Matches.tsx`, `src/features/leagues/`, `src/features/friendlies/`)
League Ladder standings/challenges no longer live on the Tournament page — they moved to `/matches`. `Leagues.tsx` is now pure standings/leaderboard.

| File | Function | Description |
|---|---|---|
| `Leagues.tsx` | `pgWinPct` | Computes a player's win percentage for the standings table. |
| | `Trend` | Renders an up/down/flat trend arrow. |
| | `Leagues` | Standings/leaderboard page (tournament + community boards) — no longer renders any challenge UI. |
| | `fetchActive` | Loads active league standings. |
| | `toggle` | Expands/collapses a player row. |
| `Matches.tsx` | `weekKey` | Computes the current ISO-ish week key (for the weekly randomizer budget). |
| | `randStoreKey` | Builds the localStorage key for a mode's randomizer state. |
| | `loadRandState` / `saveRandState` | Read/write the randomizer state (which slots are randomized + overrides) from localStorage. |
| | `seededRand` | Deterministic pseudo-random from a string seed — gives the Friendlies pool a stable weekly ordering. |
| | `rankWindow` | Computes the ±6 rank window around the viewer for the Challenges tab's player pool. |
| | `Matches` | **New page** (`/matches`). Friendlies + Challenges hub with a segmented-control mode toggle; Friendlies pool = same skill band + shared preferred court (falling back to band-only, then activity-only); Challenges pool = a rank window. |
| | `byActivity` / `sameBand` / `sharesCourtWithMe` | Player-pool filter/sort predicates for building each tab's 12-player list. |
| | `randomizeSlot` / `resetSlot` | Randomize or restore one of the 12 pool slots (spends/returns a weekly randomizer credit). |
| | `sendRally` | Sends a Friendlies request via `createRally`. |
| | `sendChallenge` | Sends a ladder challenge via `createChallenge`. |
| | `RallyRow` | Renders one sent/received rally request row. |
| `ladderService.ts` | `createChallenge` | Writes a new `ladder_challenges` doc. |
| | `reportChallenge` | Reports a result for a challenge. |
| | `rejectChallenge` / `cancelChallenge` | Reject or cancel a pending challenge. |
| | `confirmChallenge` | Confirms a reported result, updating both players' league points. |
| | `recordLadderClimb` | Records the winner's ladder-position climb after a confirmed challenge. |
| `useStandings.ts` | `toTitleCase` | Capitalization helper. |
| | `inDivision` | Whether a league string matches a division tab. |
| | `useStandings` | Hook loading and filtering league standings by division tab — used by both `Leagues.tsx` and `Matches.tsx`. |
| `useLadder.ts` | `useLadder` | Hook loading a user's ladder challenges (sent/received) for an event. |
| `useCrossEventConflicts.ts` | `useCrossEventConflicts` | Hook flagging players already committed elsewhere (unchanged; pre-existing, now also consumed by `Matches.tsx`). |
| `friendlies/rallyService.ts` | `createRally` | **New module.** Writes a new `rallies` doc — a non-competitive, no-points, no-organizer-step request modeled on the ladder-challenge loop. |
| | `respondRally` | Accepts/declines a pending rally request. |
| | `cancelRally` | Cancels a sent rally request. |
| | `useRallies` | Hook loading a user's sent/received rallies + active-partner IDs. |

---

## 5. Community Tasks / Points (`src/pages/Tasks.tsx`, `src/features/tasks/`)
| File | Function | Description |
|---|---|---|
| `Tasks.tsx` | `Tasks` | Community Tasks page (points, tiers, badges, check-in/photo entry points, group-bonus display). |
| | `clearParams` | Clears the modal-controlling query params. |
| | `toggleTask` | Marks/unmarks a task as done. |
| | `toggleSection` | Expands/collapses a task category section. |
| | `sectionProps` | **New (de-dup).** Builds the `open`/`onToggle`/`titleClassName`/`bodyClassName` prop set for the shared `Accordion` component, reproducing the page's prior look — replaces the local `Section` shell (removed) that both `CategorySection` and `GroupSection` used. |
| | `CategorySection` | Renders one per-player tier category's checklist (now via `Accordion`). |
| | `GroupSection` | **New.** Renders a read-only list of collective/group bonus tasks (Matchday, Zone Sweep, etc. — see `functions/groupAwards.js`), each a descriptive card rather than a checkbox. |
| `useTasks.ts` | `tasksCompletedCount` (renamed from `doneCount`) | Total individual tasks completed across every category. |
| | `milestoneCount` (renamed from `earnedTierCount`) | Count of categories where every task is done. |
| | `asRecord` | Casts task-progress data to a plain record for field access. |
| | `taskPoints` | Computes a user's total points: flat Initiation award + earned tiers + server-awarded `bonusPoints` (group awards). |
| | `profileMissingFields` | Lists which profile fields are still incomplete. |
| | `setTaskDone` | Writes a task's done/not-done state. |
| | `bumpCounter` | Increments a named counter field. |
| | `dedupePlayedResults` | **New (de-dup).** Shared by both loaders below: de-dupes docs by id, then maps each to a `PlayedResult` via a caller-supplied `toResult` (returning `null` skips a doc — used for the tournament walkover/blank-score guard). |
| | `loadTournamentResults` | Loads the user's completed tournament matches (excludes walkovers/blank scores, via `dedupePlayedResults`). |
| | `loadLadderResults` | Loads the user's confirmed ladder challenge results (via `dedupePlayedResults`). |
| | `longestWinStreak` | Computes the best win streak from a chronological result list. |
| | `distinctMonths` | Counts distinct active months from a result list. |
| | `useTasks` | Main hook: full client-side recompute of counters/tiers on page load. |
| | `useCommunityStandings` | Hook loading the Community leaderboard rows. |
| `taskCatalog.ts` | `categoryTotal` | Sums a category's available points. Also now defines `COMMUNITY_GROUP_TASKS`/`DAILY_GROUP_TASKS` (`GroupTaskDef[]`) — the descriptive catalogue backing `GroupSection`, mirroring `functions/groupAwards.js`'s bonus catalogue. |
| `badges.ts` | `earnedBadges` | Computes which badges a user has earned from their tier progress. |
| | `tierCount` | Internal: counts how many of a badge's required tiers are met. |
| `checkinService.ts` | `torontoDayKey` | **New.** Toronto-local calendar-day key (YYYYMMDD) — the Matchday-bonus boundary and daily-attendance dedup key. |
| | `baseVisitDoc` | **New (de-dup).** Shared field builder (`user_id`/`user_name`/`court_key`/`court_name`/`zone`/`lat`/`lng`/`dist_m`/`created_at`) spread by both `logAttendance` and `checkIn` before their one collection-specific extra field. |
| | `logAttendance` | **New.** Append-only daily attendance record (`court_attendance`, one row per player per court per day) — distinct from the once-forever check-in "passport". |
| | `getTopCheckIns` | **New.** Most-checked-in courts from a bounded recent window — "what's busy lately" for the check-in start screen. |
| | `getCurrentPosition` | Wraps the browser geolocation API in a Promise. |
| | `findNearbyCourts` | Finds courts near a given lat/lng. |
| | `hasCheckedIn` | Whether the user already checked into a given court (the once-forever passport stamp). |
| | `checkIn` | Records a court check-in (passport stamp; `firestore.rules` deny overwriting, so it's a one-time award). |
| | `checkZoneComplete` | Whether the user has checked into every court in a zone. |
| `CheckInModal.tsx` | `CheckInModal` | Modal for the "Check In" court-visit flow (now also records a visit type and daily attendance). |
| | `locate` | Requests the user's location and finds nearby courts. |
| | `doCheckIn` | Submits the check-in for a selected court. |
| `PhotoSubmitModal.tsx` | `PhotoSubmitModal` | Modal for submitting a court photo report — the single unified flow (merges the former "Report"/"Submit a Photo" and "Suggest an Improvement" flows). |
| | `addFiles` / `removeFile` | Manage the up-to-`MAX_PHOTOS` attached-file list. |
| | `handleSubmit` | Uploads the photo(s) and writes the report. |
| `photoReportService.ts` | `extractPhotoMetadata` | **New.** Best-effort EXIF/file provenance extraction (capture time, camera, GPS) stored alongside each report — a signal, never proof. |
| | `submitPhotoReport` | Uploads photo(s) and writes a `court_reports` doc with `status: 'approved'` — reports auto-approve; no organizer review step anymore (server-side Vision SafeSearch can still flip a report to rejected after the fact). |
| `ClaimModal.tsx` | `ClaimModal` | Modal for submitting a Volunteer/Ambassador/Host claim. |
| | `submit` | Submits the claim. |
| `claimService.ts` | `createVolunteerClaim` / `createHostClaim` | Write a volunteer or host claim doc. |
| | `hasPlayedAMatch` | Whether a user has a real (non-walkover) played match — Ambassador eligibility gate. |
| | `alreadyClaimed` | Whether an invitee has already been claimed by an ambassador. |
| | `createAmbassadorClaim` | Writes an ambassador-invite claim doc. |
| | `reviewClaim` | Organizer approves/rejects a volunteer/ambassador/host claim. |
| `ReviewQueue.tsx` | `ReviewQueue` | Organizer's review queue — **claims only now** (photo reports no longer need review; the `'photos'` queue param is a stale deep-link value handled as a no-op). |
| | `approveClaim` / `rejectClaim` | Per-item approve/reject handlers. |
| `BadgePicker.tsx` | `BadgePicker` | Lets a user pick which earned badges to display on their profile. |
| | `toggle` | Toggles a badge's selected state. |
| `BadgeRow.tsx` | `BadgeRow` | Renders a compact row of badge icons. |
| `courtList.ts` | `loadCourtList` | Loads/parses the court CSV into a list for check-in/photo pickers. |

---

## 6. Court Map (`src/pages/CourtMap.tsx`, `src/pages/courtmap/`)
Unchanged from the previous inventory pass except line-number drift; not re-verified function-by-function in this refresh.

| File | Function | Description |
|---|---|---|
| `CourtMap.tsx` | `CourtMap` | Interactive court-map page (Leaflet map + filters + results list). |
| `useCourtData.ts` | `fetchCsv` | Fetches a CSV file's raw text. |
| | `useCourtData` | Hook loading and parsing court/program CSV data. |
| | `load` | Internal load-and-parse effect body. |
| `courtMapUtils.ts` | `getPickleballMappings` | Maps pickleball-specific court data fields. |
| | `formatDist` | Formats a distance in km for display. |
| | `parseDateStr` | Parses a date string from the CSV. |
| | `formatDateRange` | Formats a program's date range. |
| | `fmt` | Internal date-formatting helper. |
| | `getProgramStatus` | Classifies a program as ongoing/upcoming/past. |
| | `toYears` | Converts a months string to years. |
| | `matchCourtName` | Fuzzy-matches a preferred-court string to a known court. |
| | `parseCourts` | Parses the courts CSV into structured records. |
| | `parsePrograms` | Parses the programs CSV into structured records. |
| | `geocodeQuery` | Geocodes a free-text location query. |
| | `geocodeLocationId` | Geocodes using a stored location ID, falling back to name. |
| | `hasPublicHours` | Whether a court has posted public hours. |
| | `splitMarkerSvg` / `soloMarkerSvg` | **New (de-dup).** Shared two-tone/single-color circle SVG templates, factored out of `courtMarkerHtml`'s 6 near-identical branches. |
| | `courtMarkerHtml` | Builds the HTML for a tennis-court map marker (now a short sequence of `splitMarkerSvg`/`soloMarkerSvg` calls). |
| | `pickleballMarkerHtml` | Builds the HTML for a pickleball map marker. |
| `courtMapComponents.tsx` | `Badge` | Small colored badge component. |
| | `FilterSelect` | Dropdown filter control. |
| | `DaysDropdown` | Multi-select dropdown for filtering by day. |
| `ProgramResultsList.tsx` | `ProgramResultsList` | Renders the filtered list of programs. |
| `CourtResultsList.tsx` | `CourtResultsList` | Renders the filtered list of courts. |
| `CourtPopup.tsx` | `CourtPopup` | Map marker popup showing a court's details + actions. |

*The old `SuggestImprovementModal.tsx` (already removed before this pass) is fully absorbed into `features/tasks/PhotoSubmitModal.tsx` — see section 5.*

---

## 7. Auth & Signup (`src/context/AuthContext.tsx`, `src/features/auth/`, `src/pages/Signup.tsx`)
| File | Function | Description |
|---|---|---|
| `AuthContext.tsx` | `useAuth` | Hook exposing the auth context. |
| | `AuthProvider` | Provides `user`/`profile`/loading state app-wide. |
| | `refreshProfile` | Reloads the current user's profile bundle (calls `ensureUserProfileDocuments`). |
| `profileBootstrap.ts` | `createDefaultStats` / `createDefaultPreferences` | Build default doc shapes for a new user. |
| | `ensureUserProfileDocuments` | Guarantees `users`/`stats`/`preferences` docs exist on login. |
| `useGoogleSignIn.ts` | `useGoogleSignIn` | Hook wrapping Google OAuth sign-in. |
| | `handleGoogleSignIn` | Runs the Google sign-in popup flow. |
| `authMessages.ts` | `getAuthErrorMessage` | Maps a Firebase Auth error code to a friendly message. |
| | `getGoogleSignInErrorMessage` | Same, for Google sign-in–specific errors. |
| `accountService.ts` | `emailExistsInProfiles` | Checks whether an email is already registered. |
| `Signup.tsx` | `BrandMark` | Small decorative logo/brand mark component. |
| | `Signup` | Combined login/signup/complete-profile page (1062 lines). |
| | `validatePassword` | Validates the password field. |
| | `isNameValid` | Validates the name field. |
| | `validateCompletion` | Validates the profile-completion step. |
| | `handleEmailContinue` | Advances from email entry to password/login branch. |
| | `handleLogin` | Submits login. |
| | `handleResetPassword` | Sends a password-reset email. |
| | `handleCreateAccount` | Creates a new account. |
| | `handleCompleteProfile` | Submits the post-signup profile-completion form. |
| | `handleAccountContinue` | Advances the multi-step signup flow. |
| | `goToEmailPhase` | Returns to the email-entry step. |
| | `handleEmailChange` | Updates the email input field. |
| | `addCustomCourt` / `addCustomPlayer` | Add a free-text court/favourite-player entry not in the dropdown list. |
| | `selectCourt` | Selects a preferred court during signup. |
| `signupValidation.ts` | `emailExistsForSignup` | Checks for a duplicate email during signup. |
| | `getSignupErrorMessage` | Maps a signup error to a friendly message. |
| `courtSearch.ts` | `parseCsvLine` | Parses one CSV line into fields. |
| | `extractDropdownCourts` | Extracts the court-name list for the signup dropdown. |
| | `mergeCourtOptions` | Merges custom + CSV court lists, de-duplicated. |
| | `extractCourtsWithCoords` | Builds a name→coordinates map from the CSV. |
| | `getCourtSuggestions` | Filters court options by a search query, excluding already-selected. |

*Note: `src/features/auth/verification.ts` (`accountNeedsVerification`), listed in the previous inventory version, no longer exists in the repo — likely already folded into `Signup.tsx`'s inline verification checks.*

---

## 8. Notifications (`src/features/notifications/`, `src/pages/Notifications.tsx`, `src/components/HeaderMenu.tsx`)
The old bell-dropdown (`NotificationBell.tsx`, already removed before this pass) is replaced by a hamburger `HeaderMenu` (with an unread badge) deep-linking to a full-screen `Notifications` page.

| File | Function | Description |
|---|---|---|
| `useNotifications.ts` | `normalize` | Normalizes a raw notification doc into `AppNotification` shape. |
| | `useNotifications` | Hook loading/subscribing to the user's notifications. |
| | `timeAgo` | Formats an ISO timestamp as a relative "time ago" string. |
| `Notifications.tsx` | `Notifications` | **New page** (`/notifications`) — full-screen notifications feed. |
| | `openItem` | Navigates to a notification's linked item and marks it read. |
| `HeaderMenu.tsx` | `badgeLabel` | **New (de-dup).** Formats an unread count as `"9+"` past the cap — used at both the trigger-icon and Notifications-row badge sites. |
| | `HeaderMenu` | **New.** Hamburger menu sheet (About/How It Works/Notifications w/ unread badge/Profile/Logout), rendered from `Navbar.tsx`. |
| | `close` | Closes the menu sheet. |
| | `handleLogout` | Signs the user out. |

---

## 9. Matches / User Match History (`src/features/matches/`, `src/pages/History.tsx`)
| File | Function | Description |
|---|---|---|
| `useUserMatches.ts` | `num` | Safe-numeric coercion helper. |
| | `isRealOpponent` | Whether an opponent-name placeholder (BYE/Player Loading/"Winner of…") represents a real, contactable person. |
| | `useUserMatches` | Hook loading a user's completed match history **and** upcoming (unplayed) matches — expanded from the previous version, which only returned completed matches. |
| `History.tsx` | `History` | **New page** (`/history`) — "My Matches" (via `useUserMatches`) + a past-tournaments archive. |

---

## 10. Shared Components (`src/components/`)
| File | Function | Description |
|---|---|---|
| `Button.tsx` | `Button` | Shared button component (variants/sizes). *(De-dup: local `cn()` removed — now imports the shared one from `src/lib/cn.ts`.)* |
| `Input.tsx` | `Input` | Shared text-input component. *(Same de-dup.)* |
| `AlertMessage.tsx` | `AlertMessage` | Inline success/error/info banner component. |
| `Sheet.tsx` | `Sheet` | Slide-up/modal sheet container (mobile-aware). |
| | `onChange` (media query) | Updates mobile/desktop mode on viewport change. |
| | `onKey` | Closes the sheet on Escape key. |
| `Navbar.tsx` | `Navbar` | Top navigation bar — now includes the theme toggle (`useTheme`) and renders `HeaderMenu`. |
| | `handleScroll` | Toggles the navbar's scrolled style. |
| `BottomNav.tsx` | `BottomNav` | Mobile bottom tab-bar navigation. |
| `LoadingBar.tsx` | `LoadingBar` | Top-of-page route-transition loading indicator. |
| `Layout.tsx` | `Layout` | Page shell wrapping Navbar/BottomNav/content. |
| `Accordion.tsx` | `Accordion` | **New.** Generic controlled collapsible-card primitive (open/onToggle owned by the parent) — used by `BracketAccordion.tsx` and the Tasks page's category sections. |
| `ChipRow.tsx` | `ChipRow` | **New.** Horizontally-scrollable chip/tab selector — used by `DrawTabs.tsx`. |
| `SegmentedControl.tsx` | `SegmentedControl` | **New.** 2/3-way segmented toggle — used by `DrawTabs.tsx` (Groups/Knockout) and `Matches.tsx` (Friendlies/Challenges). |
| `Fab.tsx` | `Fab` | **New.** Floating action button — used by `Events.tsx`. |
| `HeaderMenu.tsx` | *(see Notifications section)* | |
| `RacquetIcon.tsx` | `RacquetIcon` | **New.** Shared SVG mark — the single source now used by `BottomNav.tsx`, `Matches.tsx`, `Profile.tsx`, `PlayerProfile.tsx`, `ProfileInfo.tsx`, `EventCard.tsx` (previously duplicated locally in two profile files). |
| `Stepper.tsx` | `Stepper` | **New.** +/− number input, used by `ScoreModal.tsx` for game-score entry. |

---

## 11. Theming (`src/context/ThemeContext.tsx`)
| File | Function | Description |
|---|---|---|
| `ThemeContext.tsx` | `readInitialTheme` | Resolves the starting theme from localStorage/system preference. |
| | `ThemeProvider` | **New.** Light/dark theme provider — sets the `data-theme` attribute and persists to localStorage. Wraps the app in `App.tsx`. |
| | `toggleTheme` | Flips between light and dark. |
| | `useTheme` | Hook exposing the current theme + toggle, consumed by `Navbar.tsx`. |

---

## 12. Utilities & Lib (`src/utils/`, `src/lib/`)
| File | Function | Description |
|---|---|---|
| `zones.ts` | `getZone` | Maps lat/lng to a named city zone. |
| | `haversineKm` | Great-circle distance between two coordinates. |
| | `getZoneWithBorderCheck` | Zone lookup with border-buffer handling. |
| `availability.ts` | `normalizeDay` | Normalizes a day string to a `DayCode`. |
| | `asSlots` | Filters a value down to valid AM/PM slot entries. |
| | `getAvailabilityGrid` | Reads the availability grid from preferences (with legacy fallback). Currently has no UI caller (the edit screen was removed) — kept for the write path (`Signup.tsx`) and pending a rebuilt editor. |
| | `gridToLegacy` | Converts the grid format back to the legacy shape for writes. |
| `eventDates.ts` | `getEventStartDate` / `getEventEndDate` | Resolve an event's start/end across legacy field names. |
| | `parseValidDate` | Parses a Firestore date-like value, returning `null` if invalid. |
| `eventTypes.ts` | *(see Events section above)* | |
| `courtKey.ts` | `courtKey` | Normalizes a court's dropdown label into a stable key. |
| `formatPhone.ts` | `formatPhone` | Formats a phone number for display. |
| `skillLevels.ts` | `skillTier` **(new here — de-dup)** | Maps a numeric skill level to a tier label (Beginner/Challenger/Masters). Hoisted from duplicate copies in `PlayerProfile.tsx`/`ProfileInfo.tsx`. |
| | `leagueDivision` **(new here — de-dup)** | Normalizes a free-text league string into `"Men's" \| "Women's" \| ''`. Same hoist. |
| `firebase.ts` | `setAuthPersistence` | Sets Firebase Auth's persistence mode (stay-logged-in toggle). |
| `analytics.ts` | `track` | Logs an analytics event. |
| | `setAnalyticsUser` | Sets the analytics user ID/properties. |
| | `clearAnalyticsUser` | Clears the analytics user on logout. |
| `accountService.ts` | *(see Auth section above)* | |
| `cn.ts` | `cn` | **New (de-dup).** Shared Tailwind class-merge helper (`twMerge(clsx(...))`), hoisted out of duplicate local copies in `Button.tsx` and `Input.tsx`. |

---

## 13. App Shell & Misc Pages
| File | Function | Description |
|---|---|---|
| `App.tsx` | `RouteFallback` | Loading fallback shown during route code-splitting. |
| | `ScrollToTop` | Scrolls to top on route change. |
| | `PrivateRoute` | Route guard requiring authentication. |
| | `App` | Root component defining all routes (now lazy-routes to `History.tsx`/`Matches.tsx`/`Notifications.tsx`; `/friendlies` and `/challenges` redirect to `/matches`; wraps the tree in `ThemeProvider`). |
| `Home.tsx` | `plus` | Formats a count as a rounded "N+" label. |
| | `useCountUp` | **New.** Animates a number counting up to a target value. |
| | `readCachedSlides` | **New.** Reads cached homepage carousel image URLs from localStorage. |
| | `Home` | Landing/home page (expanded — count-up stats, cached carousel, in-page check-in/report shortcuts). |
| | `onCheckIn` / `onReport` | **New.** Homepage shortcuts opening the check-in or photo-report flow directly (redirect to login first if signed out). |
| `home/AreaChart.tsx` | `AreaChart` | Small sparkline/area-chart component — now takes multiple named `series` rather than a single data array. |
| | `lineFor` | Builds one series' SVG path. |
| `StaticPages.tsx` | `PageWrapper` | Shared layout wrapper for static content pages. |
| | `HowItWorks` / `About` **(new)** | Additional static content pages. |
| | `Terms` / `Privacy` / `Contact` | Static content page components. |

---

## 14. Cloud Functions (`functions/`)
| File | Function | Description |
|---|---|---|
| `index.js` | `moderateUploadedImage` | Storage-triggered SafeSearch moderation check on uploaded images — can flip an already-auto-approved photo report to rejected. |
| | `sendWelcomeEmail` | Sends a welcome email when a user doc is created/verified. |
| | `buildWelcomeEmail` | Builds the welcome email's HTML content. |
| `notifications.js` | `onMatchCreated` | Notifies players when a new match is created. |
| | `onMatchUpdated` | Notifies players on match updates (score/schedule). |
| | `onScoreSubmitted` | Notifies the creator when a player submits a score. |
| | `onScoreSubmissionResolved` | Notifies the player when their submission is confirmed/rejected. |
| | `onScheduleRequested` | Notifies the creator of a scheduling-assistance request. |
| | `onLadderChallengeCreated` | Notifies the opponent of a new ladder challenge. |
| | `onLadderChallengeUpdated` | Notifies on challenge status changes (reported/confirmed/rejected). |
| | `onLadderChallengeDeleted` | Notifies on a cancelled challenge. |
| | `onTaskProgressUpdated` | Notifies a user of relevant task/tier progress changes. |
| | `onParticipantJoined` | Notifies the creator when a player joins their event. |
| | `weeklyReminders` | Scheduled (Tuesday 9am) reminder digest for outstanding matches/challenges. |
| | `pruneNotifications` | Scheduled cleanup of old notification docs. |
| `taskPoints.js` | `awardPairPoints` | **New (de-dup).** Shared by `onMatchCompletedAwardPoints` and `onLadderConfirmedAwardPoints`: records both players' play results (`recordPlayResult`) and, if a court was recorded, checks both in (`checkInFromMatch`). |
| | *(per-player award triggers)* | Same trigger set as before — awards individual tier/counter progress on match/ladder/event/court-visit/claim events. See CLAUDE.md's Stats data flow section. |
| `groupAwards.js` | *(collective/group bonus engine)* | **New file.** Reads across many players' documents to award group bonuses — Matchday, Hourly Coverage, Court Pioneer, Board Freshness, Full Zone Sweep — into `task_progress.bonusPoints` via an idempotent `group_awards/{awardId}` ledger. Complementary to, not overlapping with, `taskPoints.js`. |
| `lib/notify.js` | `notify` | Low-level helper writing notification docs to a list of recipients. |
| | `organizerUids` | Resolves the current list of organizer/creator UIDs. |

---

## 15. Admin / One-off Scripts (`scripts/`)
Not re-verified in this refresh pass — unchanged since the previous inventory version (still mirror the client-side pure helpers per CLAUDE.md's documented keep-in-sync tradeoff).

| File | Function | Description |
|---|---|---|
| `regroup-rr.js` | `getDrawKey` / `generateGroupPairings` / `skillBand` / `splitEvenly` / `sharedZone` / `autoLabel` | Mirrors of the client-side `rrGeneration.ts`/`utils.ts` pure helpers (kept in sync per CLAUDE.md). |
| | `buildRRGroupMatchDocs` | Builds match docs for a newly formed/expanded RR group. |
| | `getMany` | Batched Firestore doc-ID lookup helper. |
| | `parseEventDate` | Parses an event date field (Admin SDK context). |
| | `commitOps` | Commits a batch of writes. |
| | `main` | Entry point: places EOD late joiners into RR groups. |
| `backfill-task-points.mjs` | `isProfileComplete` | Mirrors the client's profile-completeness check. |
| | `main` | Entry point: backfills matches/streaks/months/Initiation counters and tiers. |
| `snapshot-ranks.mjs` | `inDivision` | Division-filter helper (Admin SDK context). |
| | `main` | Entry point: snapshots current league rank positions. |
| `backfill-availability.js` | `normalizeDay` / `asSlots` | Mirrors of `availability.ts` helpers. |
| | `deriveGrid` | Derives the availability grid shape from legacy data. |
| | `main` | Entry point: backfills the availability grid for existing users. |
| `backfill-zones.js` | `getZone` | Mirrors `zones.ts`'s zone lookup. |
| | `buildCourtMap` | Builds a name→court lookup map. |
| | `findCourtCoords` | Resolves a court's coordinates by name. |
| | `main` | Entry point: backfills each user's zone from their preferred courts. |
| `fix-stanley-park.js` | `main` | One-off data-correction script for a specific court entry. |
| `add-booking-urls.js` | `D` | Small decode/lookup helper. |
| | `getBookingUrl` | Resolves a court's external booking URL. |
| | `parseCsvLine` | Parses one CSV line. |
| `geocode-pickleball.js` | `parseCsvLine` / `parseCourts` | Parse the pickleball courts CSV. |
| | `matchCourtName` | Fuzzy-matches a court name/preference. |
| | `geocodeQuery` | Geocodes a location string. |

---

## Notes
- This is a refresh of the earlier version, after (1) other, unrelated development sessions substantially reworked the app (new Friendlies/Matches/History/Notifications pages, several new shared components, theming, expanded check-ins/photo reports/group bonuses), (2) a targeted dead-code-removal + de-duplication pass documented in CLAUDE.md, and (3) a second lean-code pass merging remaining duplicate logic (`computeMatchPoints`, `currentDrawKey`, `autoLabelFor` in `useTournament.ts`; `trackJoin` in `useJoin.ts`; `awardPairPoints` in `taskPoints.js`; `splitMarkerSvg`/`soloMarkerSvg` in `courtMapUtils.ts`; `Tasks.tsx`'s local `Section` merged into the shared `Accordion`; `badgeLabel` in `HeaderMenu.tsx`; `dedupePlayedResults` in `useTasks.ts`; `baseVisitDoc` in `checkinService.ts`) — all behavior-preserving.
- Sections 1–5 and 8–14 were individually re-verified against current file content for this refresh. Sections 6 (Court Map) and 15 (Admin Scripts) were not touched by either the drift or the cleanup pass and are carried forward from the prior version with only line-number awareness, not a fresh line-by-line read.
- Small one-line inline closures that are pure JSX event-handler wrappers (e.g. `onClick={() => ...}`) are generally omitted unless independently named — the table favors named, reusable functions.
