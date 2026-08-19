# System architecture

## Current state

The application is a Vite-built React web client hosted by Firebase Hosting. The browser uses Firebase Auth for identity, Firestore for application data, Storage for images, and regional Cloud Functions for server-authoritative workflows. The client also initializes GA4 Analytics when the browser supports it. Functions use Resend for email and have scheduled integrations with Google Sheets and BigQuery for operational metrics.

Diagram: [current system architecture](diagrams/current-system-architecture.md).

The current deployment region is `us-central1`; scheduled functions format dates in `America/Toronto`. Firebase configuration is supplied through `VITE_FIREBASE_*` environment variables, while `.firebaserc` contains only a non-default `local -> rands-local` alias. Production must be selected explicitly through an approval-gated workflow.

## Runtime boundaries

| Boundary          | Current responsibility                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Browser / React   | Routing, presentation, form validation, user-initiated Firestore/Storage reads and permitted writes          |
| Firebase Auth     | Authenticated identity and provider sign-in (Google and Apple providers are configured in the client)        |
| Firestore Rules   | Client authorization, ownership, field-diff restrictions, and privacy gates                                  |
| Cloud Functions   | Notifications, points/rewards, connections, moderation, scheduled aggregation, callable privileged workflows |
| Storage Rules     | Public reads plus constrained image writes; moderation trigger handles finalized objects                     |
| Firebase Hosting  | Static `dist` output and SPA fallback                                                                        |
| Resend            | Outbound transactional email from Functions                                                                  |
| GA4               | Client analytics when supported                                                                              |
| Sheets / BigQuery | Scheduled operational metrics sinks used by `aggregateAdminMetrics`                                          |

## Target state

Preserve the same product topology while adding explicit environment selection, local emulator
configuration, rules tests, CI gates, and a staging project. Privileged data mutations should
converge on Functions or server-controlled workflows; the browser should remain an untrusted
caller even when UI role state says Organizer or Admin. The local rules suites now run through
temporary emulator configurations; this proves the checked-in rules contract, not deployed state.

## Evidence

- `src/lib/firebase.ts` — browser SDK initialization, env vars, Analytics, and Functions region.
- `src/App.tsx` and `src/main.tsx` — SPA routes, private route guard, lazy loading, and error boundary.
- `firebase.json`, `.firebaserc` — Hosting, Functions, rules, and active-project default.
- `functions/lib/constants.js`, `functions/lib/notify.js` — region, timezone, email, and notification boundaries.
- `functions/index.js`, `functions/notifications.js`, `functions/rewards.js`, `functions/adminMetrics.js` — trigger and integration surface.

## Risks and open questions

- `.firebaserc` carries only the local `rands-local` alias. Staging and production remain external approvals because this checkout does not ship an authorized non-local deployment target.
- `hosting:preview` and `hosting:deploy` are wrapper-gated, require an explicit `FIREBASE_DEPLOY_PROJECT_ID`, and pass `--project` directly. They do not inherit a default CLI project from this repository.
- Google Sheets, BigQuery, Resend, and image moderation require credentials/configuration not present in this checkout.
- Local emulator coverage includes Firestore and Storage Rules, callable/trigger integration,
  synthetic fixtures, and focused Hosting-backed browser journeys. Equivalent staging behavior
  remains unverified until an authorized non-production Firebase project is provided.
