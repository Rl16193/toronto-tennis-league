# Maintainability map

## Dependency map

```text
Route/page
  -> feature hook/controller
    -> pure domain rule or feature service
      -> repository/data access (where a meaningful boundary exists)
        -> Firebase SDK / Cloud Functions
```

The current application is partway through this shape. The tournament scoring and Round Robin
primitives now live in `src/features/tournament/domain/`; page compatibility exports keep existing
callers stable while further persistence extraction can happen without a rewrite. Signup field
validation is similarly isolated in `src/features/signup/signupForm.ts`. Event registration and
tournament-slot lookup now use `src/features/events/services/eventRepository.ts`, with the document
shape tested independently in `eventParticipant.ts`.
Shared tournament-match and leaderboard row types now live under feature-owned type modules rather
than making data-access code import from a page or hook. Tournament placement, zone normalization,
and skill-band rules are likewise owned by `src/features/tournament/domain/placement.ts`; page
modules retain compatibility exports only. Parsed court records are owned by
`src/features/courts/`, so check-in and photo-report features do not import court types from the
CourtMap page.
Organizer-approved tournament result persistence now crosses
`src/features/tournament/services/tournamentResultService.ts` into the idempotent
`functions/tournamentResults.js` transaction. The page hook constructs intent only; score
validation and statistics/points/advancement application no longer depend on its subscription or
presentation state.

## Quality commands

- `npm run typecheck` runs the TypeScript compiler without emitting files.
- The root `tsconfig.json` enables full TypeScript `strict` mode plus no-implicit-return and
  no-fallthrough checks. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` remain
  intentionally deferred because they require a broad legacy data-model migration.
- `npm run lint` runs ESLint over first-party React/TypeScript source, scripts, tests, and Functions.
  Existing warnings for legacy hook dependency choices, explicit `any`, and unused legacy values
  remain visible; new errors fail the command.
- `npm run format:check` checks the maintained slices and new tooling files. The legacy source tree
  is intentionally not mass-reformatted in a behavior refactor.
- `npm run test:rules` and `npm run test:storage` select temporary emulator ports and use local
  OpenJDK when it is installed outside the default PATH. The repository pins `firebase-tools` so
  the emulator wrapper does not download an unbounded CLI version at execution time.
- `npm run test:fixtures` starts temporary Auth/Firestore emulators and exercises the synthetic
  seed command; the full `npm run emulators` launcher retains conventional fixed ports for app
  development and adds the same local Java fallback.
- `npm run verify` runs the local type, lint, format, documentation, unit, Functions unit and
  emulator integration, Rules, Storage, fixture-smoke, isolated Chromium login/profile smoke,
  build, generated-artifact freshness, and working-tree/committed-range diff checks in one command.
  Run `npm run test:functions:integration` directly to debug reward, friendly, or tournament
  callable/trigger boundaries; use `npm run test:e2e` for the browser boundary.

## Architecture freshness

`npm run docs:verify` checks the primary architecture, domain, security, engineering, and recovery
documents and fails when a mapped architecture-sensitive change set has no directly relevant
documentation review. The mapping covers Firebase configuration/rules, callable and reward
boundaries, tournament/data-access modules, and migration tooling. Expand it when a new durable
boundary is introduced.

## Vendor boundary

`.agents/skills/gstack/` is tracked third-party agent tooling kept for reproducible local workflows.
`.gitattributes` marks it as vendored for repository language metrics; ESLint and application tests
also exclude it. Security review must still inspect the vendor tree when its source or lock changes.
The pinned source and update procedure remain in `docs/engineering/AGENT_SKILLS.md` and
`skills-lock.json`.

## Known debt

- Some route hooks still mix Firestore subscriptions and presentation state; extract only when a
  repository boundary centralizes paths, normalization, or transaction behavior.
- Tournament result application is Function-authoritative. Completed-result reset/cancellation and
  manual Round Robin group bonuses are deliberately disabled in the browser until bounded server
  operations exist; pending, points-free draw cancellation remains available.
- Functions remain JavaScript. Shared callable validation is centralized first; TypeScript
  migration should follow where integration coverage is strong.
- Signup intentionally has a pre-auth email-existence check so secondary-email migration remains
  usable. The callable requires App Check outside the Functions emulator; staging provider setup and
  abuse-rate verification remain external environment gates.
- Broader browser journeys remain open. The stable suite intentionally limits browser timing to
  login/profile bootstrap; reward, friendly, tournament scoring, and advancement are exercised at
  the callable/trigger emulator boundary instead of being duplicated in a brittle UI suite.
- `npm audit` remains non-zero through transitive development tooling. Dependency upgrades need a
  separate compatibility review; this block does not use an automatic mass-fix.
