# Security baseline

This is a code-derived baseline for the current `dev-anuj` checkout. It is a review artifact, not a production security certification. The assessment covers the Firestore and Storage rules, client write paths, Cloud Functions boundaries, tracked configuration, and available validation tooling.

## Assessment

```json
{
  "score": 3,
  "summary": "The repository has meaningful field-level Firestore protections, server-only collections, and an emulator-backed Rules harness, but the public-read surface, hard-coded/global organizer authority, split scoring authorities, and incomplete coverage keep the current baseline at moderate risk.",
  "findings": [
    {
      "check": "Scoring authority",
      "severity": "major",
      "issue": "Tournament client code writes leaguePoints26 and related match/stat updates while Cloud Functions also award task and friendly-match points. Organizer authorization permits the tournament client path, so scoring integrity is not owned by one server-side authority.",
      "recommendation": "Move tournament result confirmation and all league-point mutations behind callable or trigger-backed Functions. Keep client writes limited to permitted submissions and organizer intent records; make the server validate the result, event, participants, and idempotency key."
    },
    {
      "check": "Role authorization",
      "severity": "major",
      "issue": "Global organizer access is derived from preferences.event_creator plus a hard-coded super-admin UID. The same global role controls event writes and several administrative collections, which is broader than event-owner scope and couples authorization to mutable profile data.",
      "recommendation": "Replace the hard-coded/global preference check with custom claims or a server-managed role document, then enforce event-owner scope for event data and separate admin capabilities into explicit roles."
    },
    {
      "check": "Storage read exposure",
      "severity": "moderate",
      "issue": "The prior source rule allowed public reads through match /{allPaths=**}. The current checkout now names public prefixes explicitly and restricts report/suggestion reads, but deployed Rules remain unverified.",
      "recommendation": "Run the Storage Rules suite in CI and staging, then deploy only the reviewed source after confirming the intended public prefixes."
    },
    {
      "check": "Firestore data exposure",
      "severity": "moderate",
      "issue": "Several collections, including users, stats, preferences, tasks, listings, site_stats, group_lessons, and ranking history, are world-readable. This may be intentional for public rankings or listings, but the policy is broad and depends on document shape remaining safe.",
      "recommendation": "Split public projection documents from private profile/progress documents, document the public field contract, and add rules tests proving that private fields cannot be queried or exposed through these collections."
    },
    {
      "check": "Rules and environment validation",
      "severity": "moderate",
      "issue": "Firebase emulator configuration and initial Firestore/Storage Rules harnesses now exist, but local macOS execution still needs Java, callable/trigger integration authorization coverage is incomplete, and staging isolation is not established. npm audit refresh was also blocked by registry DNS resolution in this environment.",
      "recommendation": "Run the seeded emulator suite locally, extend Functions tests around callable authorization and idempotency, and establish a non-production Firebase project before production deployment work resumes."
    },
    {
      "check": "Tracked secrets",
      "severity": "minor",
      "issue": "The tracked-file scan found no private key, service-account credential, or Resend secret. A vendored gstack renderer contains a Firebase client API key from its upstream build; client keys are not service credentials, but the artifact should remain separately reviewed from application secrets. Repository history and external CI secrets were not exhaustively audited here.",
      "recommendation": "Keep credentials outside the repository, add secret scanning to CI, and review repository history plus Firebase/GitHub secret stores before any production handoff."
    }
  ]
}
```

## Evidence and limits

- Firestore field-level restrictions exist for contacts, tasks, notifications, connections, public contacts, offers, redemptions, and archive paths.
- Storage writes are authenticated and type/size constrained for named prefixes. The current source permits public reads only for LandingPage, Gallery, avatars, and listings; report/suggestion reads are owner/authentication constrained.
- `src/pages/tournament/useTournament.ts` contains direct `stats` writes for tournament points; Functions contain separate task/friendly-point award logic.
- Pure domain coverage now exercises Round Robin grouping/pairings, standings, scoring awards, safe rewrites, and the server reward-point calculator. Functions integration tests against the Admin SDK and callable runtime remain open.
- A tracked-file scan was performed for common credential patterns. It found no private key, service-account credential, or Resend secret in application files; the vendored gstack renderer includes an upstream Firebase client key, which is not a service credential. The scan did not prove that secrets are absent from Git history, deployment configuration, or third-party systems.
- `npm run lint`, `npm test`, `cd functions && npm test`, and `npm run build` pass locally. GitHub Actions run `32211081070` passed the complete CI job, including Java setup, both Rules suites, root domain tests, and Functions unit tests. Local Rules emulator execution remains blocked by the macOS Java prerequisite. `npm audit --json` could not refresh because `registry.npmjs.org` did not resolve from this environment.

## Required gates before production changes

1. Run the seeded emulator suite locally and review the Storage Rules suite in staging.
2. Define the authoritative server-side scoring and role model.
3. Narrow public Firestore/Storage reads and prove the intended public projection contract.
4. Re-run dependency and secret scans with network access, then review findings before deployment approval.
