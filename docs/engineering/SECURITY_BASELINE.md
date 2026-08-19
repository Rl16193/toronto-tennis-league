# Security baseline

This is a code-derived baseline for the current `dev-anuj` checkout. It is a review artifact, not a production security certification. The assessment covers the Firestore and Storage rules, client write paths, Cloud Functions boundaries, tracked configuration, and available validation tooling.

## Assessment

```json
{
  "score": 4,
  "summary": "Repository-local Rules separate event-workflow authority from global administration, deny direct protected reward/stat mutations, and close private preference enumeration. Server scoring integration and staging verification remain separate gates.",
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
      "issue": "event_creator now permits event creation only; event mutations are owner/explicit-assignee scoped. The hard-coded super-admin UID remains an operational bootstrap dependency.",
      "recommendation": "Move the remaining super-admin bootstrap to a recoverable server-managed role registry or custom claim before production role administration changes."
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
      "issue": "preferences are owner/super-admin readable and public_preferences is reserved deny-all. Cross-member preference decorations fail closed until a product-approved disclosure contract exists.",
      "recommendation": "Design an event-scoped or explicitly consented projection before restoring preference discovery. Never publish availability, notifications, scheduling, or role/provider fields."
    },
    {
      "check": "Rules and environment validation",
      "severity": "moderate",
      "issue": "Firebase emulator configuration and Firestore/Storage Rules harnesses now run locally with Java 21, but callable/trigger integration authorization coverage is incomplete and staging isolation is not established. The dependency audit remains non-zero and was not mass-fixed.",
      "recommendation": "Run the seeded emulator suite locally, extend Functions tests around callable authorization and idempotency, and establish a non-production Firebase project before production deployment work resumes."
    },
    {
      "check": "Pre-auth signup lookup",
      "severity": "moderate",
      "issue": "The signup flow intentionally returns whether an email exists. The deployed callable now requires App Check and returns only booleans; the local Functions emulator bypasses App Check for synthetic tests.",
      "recommendation": "Verify the web App Check provider and enforcement metrics in staging before production deployment; add throttling if abuse telemetry warrants it."
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

- Firestore field-level restrictions exist for contacts, tasks, notifications, connections, public contacts, offers, redemptions, private preferences, and archive paths.
- `event_creator` is event-workflow-only. It no longer grants direct stats/points, offer economics,
  admin metrics, unrelated contacts, listing moderation, mailing-list administration, or task-claim review.
- `public_preferences` is deny-all. Existing cross-member preference decoration falls back to
  missing data until an event-scoped or explicitly consented projection is approved.
- Storage writes are authenticated and type/size constrained for named prefixes. The current source permits public reads only for LandingPage, Gallery, avatars, and listings; report/suggestion reads are owner/authentication constrained.
- `src/pages/tournament/useTournament.ts` contains direct `stats` writes for tournament points; Functions contain separate task/friendly-point award logic.
- Pure domain coverage now exercises Round Robin grouping/pairings, standings, scoring awards, safe rewrites, and the server reward-point calculator. Functions integration tests against the Admin SDK and callable runtime remain open.
- Reward callable state transitions are explicit: only pending cancellation review can refund, disputed coupons cannot bypass review, operator notes are bounded, and operational identifiers are hashed in the touched logs. Full callable/trigger integration tests remain open.
- A tracked-file scan was performed for common credential patterns. It found no private key, service-account credential, or Resend secret in application files; the vendored gstack renderer includes an upstream Firebase client key, which is not a service credential. The scan did not prove that secrets are absent from Git history, deployment configuration, or third-party systems.
- `npm run verify` passes locally with strict typecheck, ESLint over source/scripts/tests/Functions, maintained-slice formatting, docs freshness, Functions syntax and 19 Functions unit tests, 19 root unit tests, 16 Firestore Rules tests, 4 Storage Rules tests, an isolated Auth/Firestore fixture smoke test, generated-CSV freshness, and the production build. The build still reports existing CSS-target and large-chunk warnings. `npm audit` reports non-zero dependency findings; no broad upgrade or automatic fix was applied.

## Required gates before production changes

1. Run the seeded emulator suite locally and review the Storage Rules suite in staging.
2. Define the authoritative server-side scoring and role model.
3. Narrow public Firestore/Storage reads and prove the intended public projection contract.
4. Re-run dependency and secret scans with network access, then review findings before deployment approval.
