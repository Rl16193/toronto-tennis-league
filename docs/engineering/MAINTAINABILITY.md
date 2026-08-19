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

## Quality commands

- `npm run typecheck` runs the TypeScript compiler without emitting files.
- The root `tsconfig.json` enables full TypeScript `strict` mode plus no-implicit-return and
  no-fallthrough checks. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` remain
  intentionally deferred because they require a broad legacy data-model migration.
- `npm run lint` runs ESLint over first-party React/TypeScript source. Existing warnings for legacy
  hook dependency choices and explicit `any` remain visible; new errors fail the command.
- `npm run format:check` checks the maintained slices and new tooling files. The legacy source tree
  is intentionally not mass-reformatted in a behavior refactor.
- `npm run test:rules` and `npm run test:storage` select temporary emulator ports and use local
  OpenJDK when it is installed outside the default PATH.
- `npm run verify` runs the local type, lint, format, documentation, unit, Functions, Rules,
  Storage, build, and diff checks in one command.

## Architecture freshness

`npm run docs:verify` checks required architecture/runbook documents and fails when an
architecture-sensitive change set has no documentation review. The sensitive list is intentionally
small: Firebase project/rules configuration, callable authorization primitives, tournament domain
rules, and migration tooling. Expand the list when a new durable boundary is introduced.

## Vendor boundary

`.agents/skills/gstack/` is tracked third-party agent tooling kept for reproducible local workflows.
`.gitattributes` marks it as vendored for repository language metrics; ESLint and application tests
also exclude it. Security review must still inspect the vendor tree when its source or lock changes.
The pinned source and update procedure remain in `docs/engineering/AGENT_SKILLS.md` and
`skills-lock.json`.

## Known debt

- Some route hooks still mix Firestore subscriptions and presentation state; extract only when a
  repository boundary centralizes paths, normalization, or transaction behavior.
- Tournament score/stat writes still have both client and Function authorities; this requires a
  deliberate product/data decision before consolidation.
- Functions remain JavaScript. Shared callable validation is centralized first; TypeScript
  migration should follow where integration coverage is strong.
