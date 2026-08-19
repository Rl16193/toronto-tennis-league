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

- The default Firebase project is production-sensitive and no staging project is represented in the checkout.
- `hosting:preview` is not automatically a non-production Firebase project; it inherits the active CLI project unless overridden.
- Google Sheets, BigQuery, Resend, and image moderation require credentials/configuration not present in this checkout.
- Callable/trigger integration coverage is still incomplete even though Firestore and Storage
  Rules harnesses are checked in and exercised locally.
