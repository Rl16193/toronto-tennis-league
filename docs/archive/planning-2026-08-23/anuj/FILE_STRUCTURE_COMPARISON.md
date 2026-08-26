# File Structure Comparison

This reference compares the tracked repository tree at:

- `origin/version-0`: `202f897fef351581e1177e7dab089c62d3e6c186`
- `origin/dev-anuj`: `ef5aef4b83c1f5253f85d61c899dc709326c4a3a`

Bundled `.agents/` and `.claude/` files are excluded from first-party counts because they are
developer tooling, not Racquets & Strings product implementation.

## Top-level structure

### Version 0

```text
Racquets-And-Strings/
├── .github/
├── data/
├── functions/              # Cloud Functions, no tracked Functions tests
├── public/
├── scripts/                # Build and data utilities
├── src/                    # React application
├── firestore.rules
├── storage.rules
├── package.json            # Build/dev; TypeScript used as lint
└── tsconfig.json           # Strict mode not enabled
```

### `dev-anuj`

```text
Racquets-And-Strings/
├── .github/workflows/ci.yml
├── docs/
│   ├── anuj/               # Founder technical index
│   ├── architecture/       # System, data, authorization, ADRs, diagrams
│   ├── domain/             # Tournament, scoring, rewards, privacy rules
│   ├── engineering/        # Security, maintainability, onboarding, handoff
│   └── runbooks/           # Recovery and external-provider procedures
├── functions/
│   ├── lib/                # Validation, idempotency, logging, state helpers
│   ├── test/               # Functions unit tests
│   └── tournamentResults.js
├── scripts/
│   ├── lib/                # Shared emulator launcher
│   ├── migrations/         # Dry-run-first migration framework
│   ├── run-browser-e2e.mjs
│   ├── run-functions-integration-test.mjs
│   ├── run-emulator-test.mjs
│   └── verify.mjs          # One local quality-gate orchestrator
├── src/
│   ├── features/
│   │   ├── events/services/
│   │   ├── signup/         # Profile document builder and persistence
│   │   └── tournament/
│   │       ├── domain/     # Placement, scoring, Round Robin, validation
│   │       └── services/   # Persistence, subscriptions, result callable
│   └── lib/firestoreNormalization.ts
├── tests/
│   ├── e2e/
│   ├── fixtures/
│   ├── integration/
│   ├── rules/
│   └── unit/
├── AGENTS.md
├── eslint.config.js
├── playwright.config.ts
├── .prettierrc.json
├── firestore.rules
├── storage.rules
└── package.json            # verify, test, emulator, format, docs, syntax gates
```

## File-count movement

| Area                  | Version 0 | `dev-anuj` | Net change | Meaning                                                                             |
| --------------------- | --------: | ---------: | ---------: | ----------------------------------------------------------------------------------- |
| `src/`                |       126 |        146 |        +20 | New domain, service, normalization, and persistence boundaries                      |
| `functions/`          |        22 |         38 |        +16 | Server authority, reusable validation/state helpers, and unit tests                 |
| `scripts/`            |        14 |         28 |        +14 | Verification, emulators, fixtures, browser tests, migrations, safer deploy handling |
| `tests/`              |         0 |         18 |        +18 | Root unit, Rules, integration, fixtures, and browser suites                         |
| `docs/`               |         0 |         29 |        +29 | Architecture, domain, engineering, founder, and recovery documentation              |
| `.github/`            |         1 |          2 |         +1 | Non-deploying CI verification workflow                                              |
| **First-party total** |   **184** |    **288** |   **+104** | Excludes `.agents/` and `.claude/` bundles                                          |

## New implementation boundaries

| New boundary              | Representative files                              | Why it matters                                                                  |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Firestore normalization   | `src/lib/firestoreNormalization.ts`               | Product logic no longer assumes every external document is valid                |
| Event data access         | `src/features/events/services/eventRepository.ts` | Firestore operations are separated from page presentation                       |
| Signup persistence        | `src/features/signup/profilePersistence.ts`       | Multi-document account bootstrap is focused and atomic                          |
| Tournament domain         | `src/features/tournament/domain/`                 | Scoring and placement rules can be tested without UI state                      |
| Tournament services       | `src/features/tournament/services/`               | Callable submission, persistence, and subscriptions have separate owners        |
| Server result transaction | `functions/tournamentResults.js`                  | Protected result, points, statistics, and advancement changes run server-side   |
| Server validation helpers | `functions/lib/`                                  | Authorization, idempotency, state, and error behavior are reusable and testable |
| Test architecture         | `tests/{unit,rules,integration,e2e}/`             | Failures can be isolated by layer instead of relying on manual browser checks   |
| Safe operations           | `scripts/migrations/` and emulator runners        | Local data and migrations avoid implicit production targeting                   |

## Quality-tooling change

### Version 0 scripts

Version 0 provided development, build, preview, hosting, clean, and a `lint` command that invoked
TypeScript. It had no tracked `test`, `verify`, Rules-test, emulator-fixture, integration-test,
browser-test, formatting, documentation-check, or Functions-syntax scripts.

### `dev-anuj` scripts

The development branch adds:

- `test`, `test:rules`, and `test:storage`;
- `test:fixtures`, `test:functions:integration`, and `test:e2e`;
- `typecheck` and real ESLint;
- `format` and `format:check`;
- `docs:verify` and `functions:syntax`;
- `dev:emulator`, `emulators`, and `seed:emulator`;
- `migrations:example`;
- `verify`, which composes the reliable repository-local gates.

## Change distribution

Across the 261 first-party changed paths:

| Change type | Paths |
| ----------- | ----: |
| Added       |   105 |
| Modified    |   155 |
| Deleted     |     1 |

By current top-level delivery area, the diff touches:

| Area                                       | Changed paths | Additions | Deletions |
| ------------------------------------------ | ------------: | --------: | --------: |
| Root configuration and dependency metadata |            20 |    11,768 |     3,207 |
| `.github/`                                 |             2 |        73 |         4 |
| `docs/`                                    |            29 |     1,885 |         0 |
| `functions/`                               |            36 |     2,709 |       958 |
| `scripts/`                                 |            28 |     1,945 |       486 |
| `src/`                                     |           128 |    11,684 |     5,488 |
| `tests/`                                   |            18 |     2,574 |         0 |

The root additions are dominated by the generated dependency lockfile. Excluding agent bundles and
dependency lockfiles leaves 21,640 additions and 7,459 deletions across 260 changed paths.

## Reproducible comparison commands

Run these from the repository root:

```bash
git rev-parse origin/version-0 origin/dev-anuj
git rev-list --count origin/version-0..origin/dev-anuj
git diff --name-status origin/version-0..origin/dev-anuj \
  -- . ':(exclude).agents/**' ':(exclude).claude/**'
git diff --numstat origin/version-0..origin/dev-anuj \
  -- . ':(exclude).agents/**' ':(exclude).claude/**' \
  ':(exclude)package-lock.json' ':(exclude)functions/package-lock.json'
```

This comparison is a repository snapshot. Refresh its SHAs and numbers after additional commits land
on `dev-anuj`.
