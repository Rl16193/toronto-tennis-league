# Security baseline

This is a code-derived baseline for the current `dev-anuj` checkout. It is a review artifact, not a production security certification. The assessment covers the Firestore and Storage rules, client write paths, Cloud Functions boundaries, tracked configuration, and available validation tooling.

## Assessment

```json
{
  "score": 3,
  "summary": "The repository has meaningful field-level Firestore protections and server-only collections, but the public-read surface, hard-coded/global organizer authority, split scoring authorities, and missing emulator rule tests keep the current baseline at moderate risk.",
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
      "issue": "storage.rules allows public reads through match /{allPaths=**}. Any future object placed in the bucket inherits public readability, including paths that may later contain private material.",
      "recommendation": "Allow public reads only for intentionally public prefixes and require authentication or signed URLs for private/user-generated paths. Add emulator tests for every storage prefix before changing the rule."
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
      "issue": "The repository has no configured Firebase emulator block or rules/functions test harness, and staging isolation is not established. npm audit refresh was also blocked by registry DNS resolution in this environment.",
      "recommendation": "Add local emulator configuration, seeded rules tests, Functions unit tests for authorization and idempotency, and a non-production Firebase project before production deployment work resumes."
    },
    {
      "check": "Tracked secrets",
      "severity": "minor",
      "issue": "The tracked-file scan found no concrete secret values. Runtime credentials such as RESEND_API_KEY are referenced by name and must remain environment-provided; repository history and external CI secrets were not exhaustively audited here.",
      "recommendation": "Keep credentials outside the repository, add secret scanning to CI, and review repository history plus Firebase/GitHub secret stores before any production handoff."
    }
  ]
}
```

## Evidence and limits

- Firestore field-level restrictions exist for contacts, tasks, notifications, connections, public contacts, offers, redemptions, and archive paths.
- Storage writes are authenticated and type/size constrained for named prefixes, but the catch-all read rule remains public.
- `src/pages/tournament/useTournament.ts` contains direct `stats` writes for tournament points; Functions contain separate task/friendly-point award logic.
- A tracked-file scan was performed for common credential patterns. It did not prove that secrets are absent from Git history, deployment configuration, or third-party systems.
- `npm run lint` and `npm run build` passed at the current baseline. Rules emulator tests were not run because no emulator/test harness is configured. `npm audit --json` could not refresh because `registry.npmjs.org` did not resolve from this environment.

## Required gates before production changes

1. Establish a staging Firebase project and emulator-backed rules tests.
2. Define the authoritative server-side scoring and role model.
3. Narrow public Firestore/Storage reads and prove the intended public projection contract.
4. Re-run dependency and secret scans with network access, then review findings before deployment approval.
