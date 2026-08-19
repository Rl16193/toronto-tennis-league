# Local development and verification

This guide takes a new engineer from a clean checkout to a seeded application backed only by
synthetic local Firebase data. None of these commands require staging or production access.

## Install the toolchain

Install Node.js 22, npm, and Java 21. Confirm the active versions before installing dependencies:

```bash
node --version
npm --version
java -version
```

`node --version` must report major version 22. The Firestore emulator requires Java; CI uses
Temurin 21. On Apple Silicon macOS, the launcher also detects Homebrew `openjdk@21` at
`/opt/homebrew/opt/openjdk@21`.

From a clean checkout of `dev-anuj`, install both dependency sets from their lockfiles:

```bash
npm ci
npm --prefix functions ci
npx playwright install chromium
cp .env.example .env.local
```

On Linux, use `npx playwright install --with-deps chromium` if the host does not already provide
Playwright's system browser dependencies. This browser install is required because `npm run verify`
includes the isolated Chromium smoke suite.

Keep `VITE_USE_FIREBASE_EMULATORS=true` and `VITE_FIREBASE_PROJECT_ID=rands-local` in
`.env.local`. The template contains local placeholders, not deployable credentials. Never add a
service account, Resend key, production Firebase config, or real member data to this file.
`VITE_FIREBASE_APP_CHECK_SITE_KEY` stays blank locally because the emulator bypass is explicit. An
approved staging environment must supply its own reCAPTCHA Enterprise site key and verify App Check
before pre-auth account lookup is considered operational.

## Start and seed the local application

In terminal 1, start Auth, Firestore, Functions, Storage, and Hosting emulators:

```bash
npm run emulators
```

The launcher checks the configured ports before Firebase starts and always passes
`--project rands-local`. When all emulators report ready, seed deterministic local fixtures:

```bash
npm run seed:emulator
```

In terminal 2, start Vite and open `http://localhost:3000`:

```bash
npm run dev
```

Use any of these local-only accounts on `/login`:

| Role               | Email                          | Password                  |
| ------------------ | ------------------------------ | ------------------------- |
| Member             | `member-a@example.invalid`     | `local-member-a-123!`     |
| Event organizer    | `organizer-a@example.invalid`  | `local-organizer-a-123!`  |
| Provider           | `provider-a@example.invalid`   | `local-provider-a-123!`   |
| Multi-role fixture | `multi-role-a@example.invalid` | `local-multi-role-a-123!` |

The source of truth for credentials and seeded documents is
[`tests/fixtures/local-fixtures.mjs`](../../tests/fixtures/local-fixtures.mjs). The seed command
refuses a non-local Auth host or any project other than `rands-local`.

## Resolve occupied emulator ports

The standard ports are recorded in `firebase.json`: UI 4000, Hosting 5000, Functions 5001,
Firestore 8080, Auth 9099, and Storage 9199. The launcher names every conflict before exiting.

Either stop the conflicting local process or create an ignored, developer-specific config:

```bash
cp firebase.json firebase.local.json
# Edit only emulators.<service>.port values in firebase.local.json.
npm run emulators -- --config firebase.local.json
```

`firebase.local.json` is ignored by Git. An alternate config changes local ports only; the launcher
still forces `rands-local` and rejects arbitrary launcher flags. To run the browser application
against those ports, put the matching overrides in `.env.local` before starting Vite:

```dotenv
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_AUTH_EMULATOR_PORT=19099
VITE_FIRESTORE_EMULATOR_PORT=18080
VITE_FUNCTIONS_EMULATOR_PORT=15001
VITE_FIREBASE_STORAGE_EMULATOR_PORT=19199
```

Replace the example values with the ports selected in `firebase.local.json`. The CLI configuration
also controls Hosting and Emulator UI ports; those do not need Vite variables.

Rules tests and fixture smoke tests already allocate isolated temporary ports, so they do not need
the alternate full-suite config.

## Run the local quality gates

Use the smallest command while iterating, then run the aggregate gate before handing off a change:

```bash
npm test                       # root unit tests
npm --prefix functions test    # Functions helper unit tests
npm run test:rules             # Firestore Rules, temporary emulator
npm run test:storage           # Storage Rules, temporary emulator
npm run test:fixtures          # real Auth/Firestore seed boundary, temporary emulators
npm run test:functions:integration # reward, friendly, and tournament Functions emulator paths
npm run test:e2e                  # Hosting, signup/profile, event join, and tournament score journeys
npm run typecheck
npm run lint
npm run format:check           # every tracked first-party file, except generated/vendor paths
npm run docs:verify
npm run build
npm run verify                 # every reliable repository-local gate above
```

`test:e2e` starts isolated Auth, Firestore, Functions, and Storage emulator ports, seeds synthetic
accounts/documents, builds the browser bundle against those endpoints, starts the Firebase Hosting
emulator, and runs one-worker Chromium Hosting, signup/profile, event-join, and organizer
score/advancement journeys. It terminates the local processes after success or failure. Critical
reward, friendly, and tournament mutations also remain covered at the callable/trigger boundary by
`test:functions:integration`.

## Find the system contracts

- Start at the [architecture index](../architecture/README.md) for system, data-flow, data-model,
  authorization, and environment boundaries.
- Read [tournament rules](../domain/TOURNAMENT_RULES.md),
  [Round Robin rules](../domain/ROUND_ROBIN_RULES.md), and
  [scoring and points](../domain/SCORING_AND_POINTS.md) before changing match behavior.
- Use [data flow](../architecture/DATA_FLOW.md) and the
  [maintainability map](MAINTAINABILITY.md) to find repositories, domain modules, route
  orchestration, and server-authoritative writes.
- Review [security baseline](SECURITY_BASELINE.md), `firestore.rules`, and `storage.rules` before
  changing a read or write boundary.
- Follow the [migration framework](../../scripts/migrations/README.md). It is dry-run by default,
  requires an explicit project, and never makes production implicit.

## Know what has and has not been verified

| Level                 | Repository evidence                                                       | Claim boundary                                    |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| Local verification    | Unit tests, temporary Rules emulators, fixture smoke, build               | Reproducible from this checkout                   |
| Source-level security | Rules tests, server validation tests, security review                     | Proves checked-in policy, not deployed policy     |
| Staging verification  | No authorized staging project is configured                               | External gate; do not claim it from local results |
| Production deployment | Explicit approval, target, credentials, backup/recovery evidence required | Never run or infer from this guide                |

Do not run bare `firebase deploy`. Hosting wrappers require an explicit target, and Rules,
Functions, Storage promotion, backup recovery, DNS, secrets, and provider configuration remain
separate external approval gates.

## Troubleshooting

- **`java` is missing:** install Java 21, set `JAVA_HOME` if needed, and rerun `java -version`.
- **A port is unavailable:** use the named conflict from the launcher and the alternate local config
  procedure above.
- **The app reaches a non-local Firebase project:** stop immediately. Restore `.env.local` from
  `.env.example` and confirm `VITE_USE_FIREBASE_EMULATORS=true` plus project `rands-local`.
- **Fixture seeding refuses to run:** start the local Auth and Firestore emulators first and remove
  any environment value that points outside localhost.
- **Formatting reports an unexpected file:** add an ignore only when the path is generated or
  vendored. Fix first-party formatting instead of broadening exclusions.
