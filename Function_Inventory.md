# Function Inventory — Toronto Tennis League App

Full function-by-function inventory across the codebase (React/TS frontend, Firebase Cloud Functions, admin scripts). Grouped by feature area, then by file. Line numbers refer to current file state.

---

## 1. Tournament Engine (`src/pages/tournament/`, `src/pages/Tournament.tsx`)

### `useTournament.ts` (~85 functions/closures — the core draw engine hook)
| Function | Line | Description |
|---|---|---|
| `useTournament` | 22 | Root hook; owns all tournament state, Firestore subscriptions, and every handler below. |
| `load` (participants effect) | 119 | Live `onSnapshot` loader for `event_participants`. |
| `norm` | 237 | Normalizes a string (trim/lowercase/collapse spaces) for name matching. |
| `liveName` | 674 | Resolves a player's current display name from live user data, falling back to the match snapshot. |
| `liveContact` | 678 | Resolves a player's current contact info live, falling back to snapshot. |
| `run` (matches effect) | 765 | Live `onSnapshot` loader for `tournament_matches` + score submissions. |
| `run` (draw-state effect) | 948 | Recomputes derived draw state (started/finished/preview) when matches change. |
| `generateDraw` | 1007 | Creates a bracket draw's Firestore match docs from placed/seeded players for a given `DrawConfig`. |
| `updateMatchWithSubmission` | 1077 | Confirms a score: (1) writes match result, (2) best-effort stats batch, (3) best-effort winner advancement — three isolated steps per CLAUDE.md. |
| `sameDraw` | 1220 | Predicate matching another match in the same bracket/draw. |
| `handleUpdateRoundDeadline` | 1257 | Creator sets/edits a round's scheduling deadline. |
| `handleSetPreviewDrawSize` | 1273 | Overrides the auto-calculated preview draw size for a label. |
| `handleGenerateAll` | 1277 | Generates every eligible draw for the event in one action. |
| `reverseMatchStatsInto` | 1298 | Un-applies a match's stat contributions into a batch (used when resetting/editing). |
| `reverseRRBonusesInto` | 1337 | Un-applies Round Robin group-stage bonus points into a batch. |
| `handleResetDraw` | 1347 | Deletes a generated bracket draw and reverses its stats. |
| `handleEditPlayer` | 1379 | Creator swaps a player into/out of a match slot. |
| `handleSubmitScore` | 1442 | Validates and submits a score — player path creates a `score_submissions` doc, creator path writes directly via `updateMatchWithSubmission`. |
| `handleConfirmSubmission` | 1518 | Creator approves a pending player-submitted score. |
| `handleRejectSubmission` | 1548 | Creator rejects a pending player-submitted score. |
| `handleAddPlayer` | 1559 | Creator manually adds a player/team to the event. |
| `handleOpenScoreForm` | 1614 | Opens the score-entry modal for a match. |
| `handleSetLLDrawSize` | 1623 | Sets the Lucky Loser / reserves draw size. |
| `handleResetLLDraw` | 1628 | Deletes the reserves (LL) draw. |
| `handleGenerateReservesDraw` | 1646 | Generates the reserves/Lucky-Loser draw from unplaced participants. |
| `rrDraftKey` | 1688 | Builds the localStorage/Firestore key for the current RR draft. |
| `saveRRDraft` | 1694 | Persists an in-progress (ungenerated) RR group draft. |
| `setRRWithdrawnMembership` | 1714 | Adds/removes players from the RR "withdrawn" set. |
| `handleGenerateRR` | 1722 | Generates the Round Robin group-stage draw from an `RRConfig`. |
| `handleSaveGroupEdit` | 1763 | Rewrites one RR group's roster, including cross-draw moves (Challengers ↔ Masters). |
| `handleCreateRRGroup` | 1891 | Creates a new RR group from unplaced players ("Add Group"). |
| `handleRenameGroup` | 1940 | Sets a custom label on an RR group. |
| `handleRemoveParticipant` | 1973 | Removes a participant from the event entirely. |
| `writeSchedule` | 2019 | Shared helper writing a schedule patch to a match doc. |
| `handleAskOrganizerSchedule` | 2030 | Player requests organizer help scheduling a match. |
| `handleSetSchedule` | 2037 | Sets a match's date/AM-PM slot. |
| `handleResetRR` | 2044 | Deletes the entire RR group stage. |
| `handleGenerateRRKnockout` | 2075 | Builds the knockout bracket from RR group winners + best runners-up. |

*(Plus ~45 smaller inline closures — one-line comparators, predicates, and `useMemo`/`useEffect` bodies — that compute `userDraw`, `visibleDraws`, `displayMatches`, and similar derived view state referenced throughout CLAUDE.md.)*

### `Tournament.tsx` (top-level route/page)
| Function | Line | Description |
|---|---|---|
| `getDrawState` | 32 | Labels a set of matches as preview/in-progress/finished. |
| `formatEventRange` | 61 | Formats an event's start–end date range for display. |
| `Tournament` | 84 | Page component; wires `useTournament()` to the draw UI, tabs, and modals. |
| `yearOf` | 178 | Extracts the year from an event's date. |
| `selectEvent` | 184 | Navigates to/selects a specific tournament event. |
| `drawSelector` (JSX var) | 227 | Renders the draw-tab selector UI. |
| `roundRobinFull` | 242 | Renders the full-width RR groups + knockout view. |
| `drawContent` (JSX var) | 273 | Renders the active draw's bracket/RR content. |

### `rrGeneration.ts` (Round Robin generation — pure functions)
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

### `utils.ts` (tournament shared helpers)
| Function | Line | Description |
|---|---|---|
| `formatScheduledDate` | 7 | Formats a scheduled match date + AM/PM slot for display. |
| `formatSetScores` | 17 | Formats a match's set scores as a string (e.g. "6-3, 6-4"). |
| `formatPlayerName` | 29 | Formats/cleans a player name for display. |
| `getParticipantDisplayName` | 43 | Resolves the display name for a participant, using live user data if available. |
| `parseDateValue` | 55 | Parses a Firestore date-like value into a `Date`. |
| `getEventDate` | 57 | Resolves an event's canonical start date across legacy field name variants. |
| `isTournamentStarted` | 60 | Whether a tournament's start date has passed. |
| `getDrawKey` | 65 | Builds the draw's Firestore doc-ID key from choice/division/skill group. |
| `skillBand` | 70 | Maps a numeric skill level to a band label (Beginners/Challengers/Masters). |
| `getScheduleState` | 80 | Derives a match's scheduling state object. |
| `getDrawSize` | 87 | Auto-calculates bracket size (8/16/32) from participant count. |
| `fallbackTemplate` | 93 | Builds a placeholder bracket template before real matches exist. |
| `normalizeTemplateMatches` | 142 | Normalizes template match objects to a consistent shape. |
| `getWinnerPlaceholder` | 152 | Builds the "Winner of Match X" placeholder label for a future round slot. |
| `getContactValue` | 163 | Extracts a usable contact value from user data. |
| `normalizeForMatch` | 170 | Normalizes a name for fuzzy participant matching. |
| `deduplicateDoublesTeams` | 178 | Removes duplicate doubles-team entries from a participant list. |
| `filterParticipantsForDraw` | 212 | Filters the participant pool down to those eligible for a specific draw. |
| `isSpecialDraw` | 230 | Whether a draw config is a merged/special (non-standard) draw. |
| `sortParticipantsForDraw` | 235 | Sorts participants into seeding order for draw generation. |
| `mapParticipantsToPlayers` | 253 | Maps raw participant docs into `TournamentPlayer` view objects. |
| `buildMatchFields` | 274 | Builds the Firestore fields for a single bracket match doc. |
| `buildPlayerList` | 313 | Assembles the ordered player list feeding draw generation. |

### `bracketImage.ts` (SVG/PNG export)
| Function | Line | Description |
|---|---|---|
| `getRoundLabels` | 4 | Returns round names (Round of 16, QF, SF, Final…) for a draw size. |
| `escapeSvg` | 12 | Escapes text for safe SVG embedding. |
| `truncate` | 15 | Truncates long names for the exported image. |
| `formatDeadline` | 19 | Formats a round deadline for the exported image. |
| `formatSvgScore` | 27 | Formats a match score for SVG rendering. |
| `buildDrawSvg` | 56 | Builds the full bracket SVG markup. |
| `buildRRGroupSvg` | 130 | Builds an RR group-table SVG. |
| `doublesShortNames` | 154 | Shortens doubles team names to fit the image. |
| `contactOf` | 176 | Resolves a player's contact info for the exported image. |
| `openRRGroupsInNewTab` | 245 | Opens the generated RR groups image in a new tab. |
| `downloadRRGroupsAsPng` | 252 | Downloads the RR groups image as PNG. |
| `openDrawInNewTab` | 287 | Opens the generated bracket image in a new tab. |
| `downloadDrawAsPng` | 295 | Downloads the bracket image as PNG. |

### Tournament sub-components
| File | Function | Description |
|---|---|---|
| `BracketView.tsx` | `getRoundTone` | Picks a round's accent color/style. |
| | `isPlaceholder` | Whether a slot name is an unresolved placeholder. |
| | `getRoundState` | Derives a round's preview/loading/started/finished state. |
| | `formatDeadline` | Formats a round deadline for display. |
| | `BracketPlayer` | Renders one player row in a bracket cell. |
| | `PlayerSelect` | Dropdown for creator to assign a player into a bracket slot. |
| | `BracketView` | Main bracket-rendering component. |
| `RoundRobinView.tsx` | `toggle` | Toggles a player's selection in the group-editor UI. |
| | `submit` | Submits an edited group's roster. |
| | `RoundRobinView` | Main RR groups + standings + knockout rendering component. |
| `RRGroupCard.tsx` | `RRGroupCard` | Renders one RR group's standings table and match list. |
| `RRConfigModal.tsx` | `RRConfigModal` | Modal for configuring/confirming RR draw generation. |
| `DrawTabs.tsx` | `subBtnClass` | CSS class helper for a sub-tab button's active state. |
| | `DrawTabs` | Renders the division/skill-group draw-selector tabs. |
| `OpponentPanels.tsx` | `ProfileLink` | Links a name to that player's profile. |
| | `scheduleBadge` | Renders a match's scheduling-status badge. |
| | `CurrentMatchCell` | Renders a player's current/next-match cell. |
| | `contactFor` | Resolves the opponent's contact info to display. |
| `ScoreModal.tsx` | `ScoreModal` | Modal for entering/submitting a match score. |
| | `handleSubmit` | Form submit handler inside the modal. |
| `AddPlayerPanel.tsx` | `AddPlayerPanel` | Creator UI panel for manually adding a player. |
| | `handler` (outside-click) | Closes the panel on outside click. |
| | `handleAdd` | Submits the add-player action. |
| `PendingScoresPanel.tsx` | `setScoreString` | Formats a pending submission's score for display. |
| | `PendingScoresPanel` | Lists pending player-submitted scores for creator confirm/reject. |
| `TournamentHeader.tsx` | `TournamentHeader` | Renders the tournament page header (title, dates, actions). |
| `ContactOpponentButton.tsx` | `toE164Phone` | Normalizes a phone number to E.164 for `tel:`/WhatsApp links. |
| | `outlineCls` | CSS class helper for the button's outline style. |
| | (outside-click handler) | Closes a popover on outside click. |
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
| | `handleExpand` | Expands/collapses an event card's detail view. |
| | `handleCreateEvent` | Submits the creator's new-event form. |
| `useEvents.ts` | `useEvents` | Hook loading all events + the user's join state. |
| | `getJoinedChoices` | Returns which tournament choices (Singles/Doubles) a user joined for an event. |
| | `hasJoinedRegularEvent` | Whether the user joined a non-tournament event. |
| | `hasJoinedTournamentChoice` | Whether the user joined a specific tournament choice. |
| | `hasJoinedAnyTournament` | Whether the user joined any tournament draw for the event. |
| | `isFullyJoinedEvent` | Whether the user has joined every available slot in the event. |
| `useJoin.ts` | `useJoin` | Hook handling the join-event flow (singles/doubles branch, slot assignment). |
| | `isOpenSlot` | Whether a participant slot is empty/placeholder (Player Loading/BYE). |
| | `findSlot` | Finds an open slot for a given tournament choice/division/group. |
| | `handleStartJoin` | Opens the join form/modal for an event. |
| | `handleSubmitJoin` | Submits the join request, writing `event_participants`. |
| `eventService.ts` | `fetchEvents` | Fetches all events from Firestore. |
| | `resolveStorageUrl` | Resolves a Storage path to a public download URL. |
| | `validateEventForm` | Validates the creator's new-event form fields. |
| | `uploadEventImage` | Uploads an event's cover image to Storage. |
| | `createEvent` | Writes a new event doc to Firestore. |
| `EventCard.tsx` | `getJoinLastDateMs` | Extracts an event's join-deadline as a timestamp. |
| | `isLateRegistration` | Whether the event is within its late-registration window. |
| | `isJoinHardClosed` | Whether joining is fully closed. |
| | `EventCard` | Renders one event's card (info, join button, status). |
| | `resendVerification` | Resends the email-verification link from the card's join gate. |
| | `handleJoinClick` | Handles the card's join button click. |
| `CreatorEventModal.tsx` | `CreatorEventModal` | Modal form for creating/editing an event (creator-only). |
| `eventFormatters.ts` | `getEventDays` | Returns which weekdays a recurring event runs on. |
| | `formatEventSchedule` | Formats a recurring event's schedule string. |
| | `formatTournamentRange` | Formats a tournament's date range string. |
| `eventTypes.ts` | `isRecurringWeekly` / `isTournamentEvent` / `isLadderEvent` / `isMeetupEvent` / `isSpecialEvent` / `isSeasonOpener` / `isWeekendMatchdaysEvent` / `isTopspinMeetupEvent` | Type-predicate helpers classifying an event by its `type`/`title`. |

---

## 3. Profile (`src/pages/Profile.tsx`, `src/pages/PlayerProfile.tsx`, `src/features/profile/`)
| File | Function | Description |
|---|---|---|
| `Profile.tsx` | `Profile` | Own-profile page component (wires info/availability/events/actions). |
| `PlayerProfile.tsx` | `skillTier` | Maps skill number to a tier label. |
| | `leagueDivision` | Derives Men's/Women's division from league string. |
| | `RacquetIcon` | Small decorative icon component. |
| | `SectionLabel` | Renders a labeled section heading. |
| | `Pill` | Renders a small pill/badge element. |
| | `PlayerProfile` | Public player-profile page (another user's view). |
| | `loadPlayer` | Loads the viewed player's profile + stats. |
| | `initial` | Computes the avatar-fallback initial letter. |
| `ProfileInfo.tsx` | `skillTier` / `tournamentPref` / `leagueDivision` | Same classification helpers as above, local copies. |
| | `RacquetIcon` | Decorative icon. |
| | `ProfileInfo` | Renders/edits the profile's personal-info fields. |
| | `open` | Opens the inline editor for a given field row. |
| | `save` | Persists an inline edit via the passed action + closes the editor. |
| | `computeZone` | Derives the player's zone from selected courts. |
| | `addCourt` | Adds a preferred court to the profile. |
| | `onPickAvatar` | Handles avatar file selection/upload. |
| `ProfileEvents.tsx` | `parseEventDate` | Parses a joined event's date field. |
| | `ProfileEvents` | Lists the user's joined events with cancel/reschedule actions. |
| | `openConfirm` / `closeConfirm` | Open/close the leave-event confirmation dialog. |
| | `handleConfirm` | Confirms leaving an event. |
| `ProfileAvailability.tsx` | `ProfileAvailability` | Edits the player's weekly availability grid. |
| | `has` | Checks if a day/slot is selected in the draft grid. |
| | `startEdit` | Enters edit mode, seeding the draft from current preferences. |
| | `toggle` | Toggles one day/slot cell. |
| | `save` | Persists the edited availability grid. |
| `RecentMatches.tsx` | `RecentMatches` | Shows the player's recent match results + current streak. |
| | `streak` (computed) | Computes the current win/loss streak from recent results. |
| `useProfileData.ts` | `useProfileData` | Hook loading the current user's full profile bundle. |
| `useProfileActions.ts` | `useProfileActions` | Hook bundling all profile mutation actions with loading/message state. |
| | `showMessage` | Sets a transient success/error message. |
| | `withProfileUpdate` | Wraps an update call with loading state + success/error messaging. |
| | `handleChangeEmail` | Changes the account email (re-auth + Firestore + Auth update). |
| | `handleRefreshEmailChange` | Re-checks verification status after an email change. |
| | `handleRemoveEvent` | Leaves a joined event. |
| | `handleUpdateEventDates` | Updates which dates the user is attending a recurring event. |
| `profileService.ts` | `syncName` | Internal: writes name to `users`. |
| | `updateName` / `updatePhone` / `updateWhatsappContact` / `updateBio` / `updateAvatar` / `updateSkills` / `updateLeagueAndAge` / `updateDisplayBadges` / `updatePreferredCourts` / `updateFavouritePlayers` / `updateAvailabilityGrid` | One Firestore-write function per editable profile field. |
| | `changeEmail` | Re-authenticates and updates the Firebase Auth email. |
| | `removeEventParticipant` | Deletes an `event_participants` doc. |
| | `updateEventParticipantDates` | Updates a participant's attendance dates. |

---

## 4. Leagues / League Ladder (`src/pages/Leagues.tsx`, `src/features/leagues/`)
| File | Function | Description |
|---|---|---|
| `Leagues.tsx` | `pgWinPct` | Computes a player's win percentage for the standings table. |
| | `Trend` | Renders an up/down/flat trend arrow. |
| | `Leagues` | Leagues/ladder standings page. |
| | `fetchActive` | Loads active league standings. |
| | `toggle` | Expands/collapses a player row. |
| `LadderView.tsx` | `sortRows` | Sort comparator for ladder standings rows. |
| | `clamp` | Numeric clamp helper. |
| | `randomUsesKey` | Builds the localStorage key tracking "random opponent" uses. |
| | `getRandomUses` / `bumpRandomUses` | Read/increment the random-challenge usage counter. |
| | `LadderView` | Renders the ladder standings + challenge UI for an event. |
| | `rollRandom` | Picks a random eligible opponent to challenge. |
| | `challenge` | Sends a ladder challenge to an opponent. |
| | `challengeState` | Derives the current challenge-button state vs. an opponent. |
| | `rankOf` | Computes a row's display rank from its window position. |
| `ladderService.ts` | `createChallenge` | Writes a new `ladder_challenges` doc. |
| | `reportChallenge` | Reports a result for a challenge. |
| | `rejectChallenge` / `cancelChallenge` | Reject or cancel a pending challenge. |
| | `confirmChallenge` | Confirms a reported result, updating both players' league points. |
| | `recordLadderClimb` | Records the winner's ladder-position climb after a confirmed challenge. |
| `useStandings.ts` | `toTitleCase` | Capitalization helper. |
| | `inDivision` | Whether a league string matches a division tab. |
| | `useStandings` | Hook loading and filtering league standings by division tab. |
| `useLadder.ts` | `useLadder` | Hook loading a user's ladder challenges (sent/received) for an event. |

---

## 5. Community Tasks / Points (`src/pages/Tasks.tsx`, `src/features/tasks/`)
| File | Function | Description |
|---|---|---|
| `Tasks.tsx` | `Tasks` | Community Tasks page (points, tiers, badges, check-in/photo entry points). |
| | `clearParams` | Clears the modal-controlling query params. |
| | `toggleTask` | Marks/unmarks a task as done. |
| | `toggleSection` | Expands/collapses a task category section. |
| | `CategorySection` | Renders one category's tier list. |
| `useTasks.ts` | `asRecord` | Casts task-progress data to a plain record for field access. |
| | `doneCount` | Counts completed Initiation tasks. |
| | `taskPoints` | Computes a user's total earned points. |
| | `earnedTierCount` | Counts earned milestone tiers. |
| | `profileMissingFields` | Lists which profile fields are still incomplete. |
| | `setTaskDone` | Writes a task's done/not-done state. |
| | `bumpCounter` | Increments a named counter field. |
| | `loadTournamentResults` | Loads the user's completed tournament matches (excludes walkovers/blank scores). |
| | `loadLadderResults` | Loads the user's confirmed ladder challenge results. |
| | `longestWinStreak` | Computes the best win streak from a chronological result list. |
| | `distinctMonths` | Counts distinct active months from a result list. |
| | `useTasks` | Main hook: full client-side recompute of counters/tiers on page load. |
| | `useCommunityStandings` | Hook loading the Community leaderboard rows. |
| `taskCatalog.ts` | `categoryTotal` | Sums a category's available points. |
| `badges.ts` | `earnedBadges` | Computes which badges a user has earned from their tier progress. |
| | `tierCount` | Internal: counts how many of a badge's required tiers are met. |
| `checkinService.ts` | `getCurrentPosition` | Wraps the browser geolocation API in a Promise. |
| | `findNearbyCourts` | Finds courts near a given lat/lng. |
| | `hasCheckedIn` | Whether the user already checked into a given court. |
| | `checkIn` | Records a court check-in. |
| | `checkZoneComplete` | Whether the user has checked into every court in a zone. |
| `CheckInModal.tsx` | `CheckInModal` | Modal for the "Check In" court-visit flow. |
| | `locate` | Requests the user's location and finds nearby courts. |
| | `doCheckIn` | Submits the check-in for a selected court. |
| `PhotoSubmitModal.tsx` | `PhotoSubmitModal` | Modal for submitting a court-condition/waiting-board photo report. |
| | `handleSubmit` | Uploads the photo and writes the report. |
| `photoReportService.ts` | `waitEstimateFor` | Text describing estimated wait time for a racquet-count bucket. |
| | `submitPhotoReport` | Writes a new photo report doc (with optional image upload). |
| `ClaimModal.tsx` | `ClaimModal` | Modal for submitting a Volunteer/Ambassador/Host claim. |
| | `submit` | Submits the claim. |
| `claimService.ts` | `createVolunteerClaim` / `createHostClaim` | Write a volunteer or host claim doc. |
| | `hasPlayedAMatch` | Whether a user has a real (non-walkover) played match — Ambassador eligibility gate. |
| | `alreadyClaimed` | Whether an invitee has already been claimed by an ambassador. |
| | `createAmbassadorClaim` | Writes an ambassador-invite claim doc. |
| | `reviewClaim` | Organizer approves/rejects a claim. |
| | `reviewPhotoReport` | Organizer approves/rejects a photo report. |
| `ReviewQueue.tsx` | `PhotoThumb` | Renders a thumbnail for a queued photo report. |
| | `ReviewQueue` | Organizer's review queue for pending photos + claims. |
| | `approvePhoto` / `rejectPhoto` / `approveClaim` / `rejectClaim` | Per-item approve/reject handlers. |
| `BadgePicker.tsx` | `BadgePicker` | Lets a user pick which earned badges to display on their profile. |
| | `toggle` | Toggles a badge's selected state. |
| `BadgeRow.tsx` | `BadgeRow` | Renders a compact row of badge icons. |
| `courtList.ts` | `loadCourtList` | Loads/parses the court CSV into a list for check-in/photo pickers. |

---

## 6. Court Map (`src/pages/CourtMap.tsx`, `src/pages/courtmap/`)
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
| | `idx` | Internal column-index lookup. |
| | `parsePrograms` | Parses the programs CSV into structured records. |
| | `pIdx` | Internal column-index lookup (programs). |
| | `pad` | Zero-pads a number string. |
| | `geocodeQuery` | Geocodes a free-text location query. |
| | `geocodeLocationId` | Geocodes using a stored location ID, falling back to name. |
| | `hasPublicHours` | Whether a court has posted public hours. |
| | `courtMarkerHtml` | Builds the HTML for a tennis-court map marker. |
| | `pickleballMarkerHtml` | Builds the HTML for a pickleball map marker. |
| `courtMapComponents.tsx` | `Badge` | Small colored badge component. |
| | `FilterSelect` | Dropdown filter control. |
| | `DaysDropdown` | Multi-select dropdown for filtering by day. |
| `ProgramResultsList.tsx` | `ProgramResultsList` | Renders the filtered list of programs. |
| `CourtResultsList.tsx` | `CourtResultsList` | Renders the filtered list of courts. |
| `CourtPopup.tsx` | `CourtPopup` | Map marker popup showing a court's details + actions. |
| `SuggestImprovementModal.tsx` | `SuggestImprovementModal` | "Suggest an improvement" form modal. |
| | `toggleType` | Toggles a selected suggestion type. |
| | `selectCourt` / `clearCourt` | Set/clear the associated court. |
| | `onPickImages` | Handles image attachment selection. |
| | `handleSubmit` | Submits the suggestion. |
| | `joinMailingList` | Submits the optional post-submit mailing-list opt-in for anonymous users. |

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
| `verification.ts` | `accountNeedsVerification` | Whether the signed-in account still needs email verification. |
| `accountService.ts` | `emailExistsInProfiles` | Checks whether an email is already registered. |
| `Signup.tsx` | `Signup` | Combined login/signup/complete-profile page. |
| | `validatePassword` | Validates the password field. |
| | `isNameValid` | Validates the name field. |
| | `validateCompletion` | Validates the profile-completion step. |
| | `handleEmailContinue` | Advances from email entry to password/login branch. |
| | `handleLogin` | Submits login. |
| | `handleResetPassword` | Sends a password-reset email. |
| | `handleCreateAccount` | Creates a new account. |
| | `handleResendVerification` | Resends the verification email. |
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

---

## 8. Notifications (`src/features/notifications/`)
| File | Function | Description |
|---|---|---|
| `useNotifications.ts` | `normalize` | Normalizes a raw notification doc into `AppNotification` shape. |
| | `useNotifications` | Hook loading/subscribing to the user's notifications. |
| | `timeAgo` | Formats an ISO timestamp as a relative "time ago" string. |
| `NotificationBell.tsx` | `NotificationBell` | Bell icon + dropdown list of notifications. |
| | (outside-click handler) | Closes the dropdown on outside click. |
| | `toggle` | Opens/closes the dropdown. |
| | `openItem` | Navigates to a notification's linked item and marks it read. |

---

## 9. Matches (`src/features/matches/`)
| File | Function | Description |
|---|---|---|
| `useUserMatches.ts` | `num` | Safe-numeric coercion helper. |
| | `useUserMatches` | Hook loading a user's recent match history. |

---

## 10. Shared Components (`src/components/`)
| File | Function | Description |
|---|---|---|
| `Button.tsx` | `cn` | Class-name join/merge helper. |
| | `Button` | Shared button component (variants/sizes). |
| `Input.tsx` | `cn` | Class-name join/merge helper (local copy). |
| | `Input` | Shared text-input component. |
| `AlertMessage.tsx` | `AlertMessage` | Inline success/error/info banner component. |
| `Sheet.tsx` | `Sheet` | Slide-up/modal sheet container (mobile-aware). |
| | `onChange` (media query) | Updates mobile/desktop mode on viewport change. |
| | `onKey` | Closes the sheet on Escape key. |
| `Navbar.tsx` | `Navbar` | Top navigation bar. |
| | `handleScroll` | Toggles the navbar's scrolled style. |
| | `handleLogout` | Signs the user out. |
| `BottomNav.tsx` | `BottomNav` | Mobile bottom tab-bar navigation. |
| `LoadingBar.tsx` | `LoadingBar` | Top-of-page route-transition loading indicator. |
| `Layout.tsx` | `Layout` | Page shell wrapping Navbar/BottomNav/content. |

---

## 11. Utilities & Lib (`src/utils/`, `src/lib/`)
| File | Function | Description |
|---|---|---|
| `zones.ts` | `getZone` | Maps lat/lng to a named city zone. |
| | `haversineKm` | Great-circle distance between two coordinates. |
| | `getZoneWithBorderCheck` | Zone lookup with border-buffer handling. |
| `availability.ts` | `normalizeDay` | Normalizes a day string to a `DayCode`. |
| | `asSlots` | Filters a value down to valid AM/PM slot entries. |
| | `getAvailabilityGrid` | Reads the availability grid from preferences (with legacy fallback). |
| | `gridToLegacy` | Converts the grid format back to the legacy shape for writes. |
| `eventDates.ts` | `getEventStartDate` / `getEventEndDate` | Resolve an event's start/end across legacy field names. |
| | `parseValidDate` | Parses a Firestore date-like value, returning `null` if invalid. |
| `eventTypes.ts` | *(see Events section above)* | |
| `courtKey.ts` | `courtKey` | Normalizes a court's dropdown label into a stable key. |
| `formatPhone.ts` | `formatPhone` | Formats a phone number for display. |
| `skillLevels.ts` | *(constants only — no functions)* | |
| `firebase.ts` | `setAuthPersistence` | Sets Firebase Auth's persistence mode (stay-logged-in toggle). |
| `analytics.ts` | `track` | Logs an analytics event. |
| | `setAnalyticsUser` | Sets the analytics user ID/properties. |
| | `clearAnalyticsUser` | Clears the analytics user on logout. |
| `accountService.ts` | *(see Auth section above)* | |

---

## 12. App Shell & Misc Pages
| File | Function | Description |
|---|---|---|
| `App.tsx` | `RouteFallback` | Loading fallback shown during route code-splitting. |
| | `ScrollToTop` | Scrolls to top on route change. |
| | `PrivateRoute` | Route guard requiring authentication. |
| | `App` | Root component defining all routes. |
| `Home.tsx` | `plus` | Formats a count as a rounded "N+" label. |
| | `greenMarkerHtml` | Builds HTML for the homepage's activity-map marker. |
| | `Home` | Landing/home page. |
| `home/AreaChart.tsx` | `AreaChart` | Small sparkline/area-chart component. |
| `StaticPages.tsx` | `PageWrapper` | Shared layout wrapper for static content pages. |
| | `Rules` / `Terms` / `Privacy` / `Contact` | Static content page components. |

---

## 13. Cloud Functions (`functions/`)
| File | Function | Description |
|---|---|---|
| `index.js` | `moderateUploadedImage` | Storage-triggered moderation check on uploaded images. |
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
| `taskPoints.js` | `recordPlayResult` | Transactionally records a played result's counters for a user. |
| | `bumpCounterAndAward` | Increments a counter field and checks/awards any newly-crossed tier. |
| | `markInitiationTask` | Marks one Initiation checkbox true. |
| | `notifyOrganizersOfQueue` | Sends the organizer digest for a new queue-report. |
| | `onMatchCompletedAwardPoints` | Trigger: awards Tournament/Streak tiers on match completion (excludes walkovers). |
| | `onLadderConfirmedAwardPoints` | Trigger: awards Ladder/Streak tiers on challenge confirmation. |
| | `onEventJoinedAwardPoints` | Trigger: marks the "joined an event" Initiation task. |
| | `onCourtVisitAwardPoints` | Trigger: awards Traveller tiers on a court check-in. |
| | `onQueueReportAwardPoints` | Trigger: awards points + organizer notify on a queue photo report. |
| | `onPhotoReportReviewed` | Trigger: awards Court Info/Care tiers + notifies submitter on photo review. |
| | `onClaimReviewed` | Trigger: awards Volunteer/Ambassador/Host tiers + notifies on claim review. |
| | `onPhotoReportCreated` | Trigger: sends the organizer digest when a new photo enters the queue. |
| | `onTaskClaimCreated` | Trigger: sends the organizer digest when a new claim is submitted. |
| `lib/notify.js` | `notify` | Low-level helper writing notification docs to a list of recipients. |
| | `organizerUids` | Resolves the current list of organizer/creator UIDs. |

---

## 14. Admin / One-off Scripts (`scripts/`)
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
- This supersedes the earlier "93 functions" inventory (that conversation/output could not be located in local session history) and expands coverage to every page and feature folder in the repo, plus Cloud Functions and admin scripts.
- Small one-line inline closures that are pure JSX event-handler wrappers (e.g. `onClick={() => ...}`) are generally omitted unless independently named — the table favors named, reusable functions.
- No code was changed to produce this report.
