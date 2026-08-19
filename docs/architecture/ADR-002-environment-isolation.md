# ADR-002: Make environment selection explicit

- Status: accepted; local implementation complete, staging provisioning pending
- Date: 2026-08-18

## Decision

Local development and QA must use emulators first, then a separately named staging Firebase project. Production (`toronto-tennis-league`) must require explicit selection and approval. Preview Hosting channels do not substitute for a staging project.

## Context

The checkout retains no production `.firebaserc` default; it contains only a non-default `local ->
rands-local` alias. Local emulator commands select the synthetic project explicitly. Hosting
operations require an explicit target and approval guard. A staging project is still external to
this repository, so the checkout cannot claim deployed staging isolation.

## Consequences

- Environment configuration and deploy guards become part of the repository contract.
- Rules/functions tests can run without production credentials.
- Synthetic Auth and Firestore fixtures make local smoke setup repeatable without a Firebase project.
- Production operations require a separately documented, reviewable gate.
- A staging project and recovery workflow must be provisioned outside this code-only change before promotion claims can be made.

## Evidence and open questions

Evidence: `.firebaserc`, `firebase.json`, `package.json`, `src/lib/firebase.ts`. Open: authorized staging project ID, CI secret storage, database location/edition, and backup schedule.

Last verified source SHA: `27e7ea2`.
