# ADR-002: Make environment selection explicit

- Status: accepted target direction; implementation pending
- Date: 2026-08-18

## Decision

Local development and QA must use emulators first, then a separately named staging Firebase project. Production (`toronto-tennis-league`) must require explicit selection and approval. Preview Hosting channels do not substitute for a staging project.

## Context

The current checkout has one `.firebaserc` default alias and no emulator or staging configuration. Generic deploy commands therefore have a credible path to production, and the repository cannot prove that QA is isolated.

## Consequences

- Environment configuration and deploy guards become part of the repository contract.
- Rules/functions tests can run without production credentials.
- Production operations require a separately documented, reviewable gate.
- A staging project and recovery workflow must be provisioned outside this code-only change before promotion claims can be made.

## Evidence and open questions

Evidence: `.firebaserc`, `firebase.json`, `package.json`, `src/lib/firebase.ts`. Open: authorized staging project ID, CI secret storage, database location/edition, and backup schedule.

Last verified source SHA: `323fc37`.
