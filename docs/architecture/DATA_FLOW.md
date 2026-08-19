# Core data flows

Diagram: [core data flow](diagrams/core-data-flow.md).

## 1. Signup, login, and profile bootstrap

1. The browser starts Firebase Auth through the Signup page and provider helpers.
2. The pre-auth email check calls `checkSignupEmail` so the client does not need anonymous access to contact records.
3. `AuthContext` observes Auth state and calls `ensureUserProfileDocuments`.
4. The client reads `users/{uid}`, `stats/{uid}`, `preferences/{uid}`, and optionally `contacts/{uid}`.
5. Missing profile documents are created through the owner rules; server-controlled fields remain protected.

Evidence: `src/context/AuthContext.tsx`, `src/lib/profileBootstrap.ts`, `src/features/auth/useOAuthSignIn.ts`, `functions/accountLookup.js`.

## 2. Event join, draw, score, advancement, and stats

1. The member reads public `events` and creates an `event_participants` document.
2. An organizer reads participants and writes event/draw configuration or a nested RR draft.
3. Draw generation creates or updates `matches`; the connection trigger can link real player pairs.
4. Players report scores through the match state machine; notifications Functions react to submissions and transitions.
5. Functions award points for server-observed match transitions, while tournament code still contains direct `stats` writes for some score/advancement paths.
6. History and rankings read the resulting `matches`, `stats`, and `ranking_history` projections.

Evidence: `src/features/events/hooks/useJoin.ts`, `src/pages/tournament/useTournament.ts`, `src/pages/tournament/rrGeneration.ts`, `functions/notifications.js`, `functions/taskPoints.js`, `functions/friendlyPoints.js`.

## 3. Tasks, points, rewards, and redemption

1. A member creates permitted task claims, check-ins, attendance, or photo reports.
2. Firestore triggers validate the event category and award progress/counters in Functions.
3. Group-award triggers maintain deterministic per-recipient ledger documents and aggregate state.
4. The client calls callable Functions for redeem, coupon use/flagging, cancellation, review, and group-lesson join/leave.
5. The client reads projections such as `offers/{uid}`, notifications, and task progress.

Evidence: `src/features/tasks/**`, `src/features/services/servicesApi.ts`, `functions/taskPoints.js`, `functions/groupAwards.js`, `functions/rewards.js`.

## 4. Marketplace listing and contact reveal

1. The member uploads listing images to `listings/{uid}/...` in Storage.
2. The member creates a public `listings` document after upload.
3. `moderateUploadedImage` handles finalized objects; unsafe uploads are removed.
4. `onListingContact` maintains `public_contacts/{uid}` while the seller has a listing.
5. A signed-in buyer can use the listing-mediated contact path; the actual contact document remains protected by Rules.

Evidence: `src/features/marketplace/listingService.ts`, `storage.rules`, `firestore.rules`, `functions/index.js`, `functions/connections.js`.

## 5. Notifications and email

Functions create recipient-scoped `notifications` documents. `notify.js` separately loads profile/preferences/contact data, respects the email opt-out, and sends email through Resend using the configured branded sender/reply-to. Email failures are logged without blocking the in-app notification.

Evidence: `functions/lib/notify.js`, `functions/lib/constants.js`, `src/features/notifications/useNotifications.ts`.

## Target state, risks, and open questions

- Target: all points-moving writes should have one server-authoritative path and rules tests should prove clients cannot mint counters.
- Current risk: tournament-specific direct `stats` writes create a second authority path beside trigger-based awards.
- Target: run the same flows against emulators, then staging, with seed data and rules/function integration tests.
- Open: confirm deployed trigger versions and whether historical documents contain all fields assumed by current readers.

Last verified source SHA: `ce46599`.
