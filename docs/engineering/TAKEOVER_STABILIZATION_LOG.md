# Takeover stabilization log

Technical evidence record for the Racquets & Strings engineering takeover. This log records repository, architecture, safety, and validation work only.

## Baseline

- Repository: `tbtctennis/Racquets-And-Strings`
- Working path: `~/Developer/RandS-Tennis`
- Working branch: `dev-anuj`
- Initial application baseline: `29690a3812a1391bf5a471b7efa7dc41d610c146`
- Production-sensitive Firebase identifier observed in `.firebaserc`: `toronto-tennis-league`
- Branch policy: no work on `main`, no force-push, no production deployment

## Completed evidence

Entries below preserve historical observations from earlier stabilization passes. Current state is
defined by the repository verifier and the linked architecture, security, and local-development
documents; older entries are not current capability claims.

| Commit    | Issue / root cause                                                                                                  | Files or evidence                                                                                            | Validation                                                                                                                                     | Remaining risk                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `345f382` | Future Codex sessions lacked durable project and skill routing.                                                     | `AGENTS.md`, `skills-lock.json`, `.agents/skills/`                                                           | Installation and lock hashes reviewed.                                                                                                         | Upstream skill updates require deliberate review.                                                                                 |
| `5057d5e` | Architecture knowledge was distributed across source without a current-state record.                                | `docs/architecture/` Markdown and ADRs                                                                       | Source, rules, Functions, Firebase config, and package manifests inspected.                                                                    | Deployed Firebase state and staging isolation remain unverified.                                                                  |
| `087411d` | Technical visuals and security findings were not available as durable project artifacts.                            | Branded editable diagrams, SVG exports, `SECURITY_BASELINE.md`, skill inventory updates                      | All six HTML/SVG pairs checked; SVG XML validation passed; security review recorded.                                                           | PNG export needs the Playwright Python runtime; emulator rules tests are not configured.                                          |
| `230a291` | Rules authorization had no repeatable local harness.                                                                | `tests/rules/firestore.rules.test.mjs`, `package.json`, `.github/workflows/ci.yml`                           | Harness syntax, CI YAML, and lint checks passed; emulator execution still needs the Java prerequisite.                                         | Coverage is initial and Functions authorization tests are still absent.                                                           |
| `fe6ae63` | Hosting scripts could inherit the production-sensitive `.firebaserc` project.                                       | `scripts/deploy-hosting.mjs`, `package.json`, `README.md`                                                    | Missing-project and production-without-approval guard paths both refused safely; no deploy ran.                                                | Authorized staging project and production approval workflow remain external gates.                                                |
| `d636fb3` | Separate HTML/SVG diagram artifacts were difficult to view and maintain.                                            | `docs/architecture/diagrams/*.md`, architecture links, skill inventory                                       | Six Mermaid Markdown files, one block each; no HTML/SVG references remain.                                                                     | Mermaid rendering depends on the Markdown viewer; no separate export is maintained.                                               |
| Current   | Provider role fields were writable by the member owner even though redemptions access trusts them.                  | `firestore.rules`, `tests/rules/firestore.rules.test.mjs`                                                    | TypeScript, Rules test syntax, and diff checks passed; emulator startup reached the missing-Java failure.                                      | Rules assertions still need a Java-enabled emulator run.                                                                          |
| `e84d0f6` | GitHub CI failed at `Firestore Rules tests` because the workflow did not provision Java for the Firestore emulator. | `.github/workflows/ci.yml`                                                                                   | Public run `32209659003` confirmed typecheck/build passed and Rules tests failed; run `32210015729` passed after Temurin Java 21 was added.    | Local macOS Rules execution still needs a Java runtime.                                                                           |
| Current   | Emulator wiring had no reusable synthetic dataset or safe seed command.                                             | `tests/fixtures/local-fixtures.mjs`, `tests/fixtures/seed-emulator.mjs`, package scripts, README             | 32 Firestore documents and 4 Auth fixtures are defined; seed command refuses any project other than `rands-local` and any non-local Auth host. | Emulator suite must be running for seeding.                                                                                       |
| `0e4d311` | Storage Rules had a public catch-all read and no CI test coverage.                                                  | `storage.rules`, `tests/rules/storage.rules.test.mjs`, package scripts, `.github/workflows/ci.yml`           | Public run `32210506773` passed the Storage Rules suite; local emulator startup is still blocked by missing Java.                              | Deployed Storage Rules and intended public projection remain unverified until a non-production Firebase environment is available. |
| `8f85777` | The repository had no repeatable root or Functions unit-test command for high-value business logic.                 | `tests/unit/domain.test.mjs`, `functions/test/domain.test.js`, package manifests, `.github/workflows/ci.yml` | 6 root domain tests and 4 Functions tests pass locally; typecheck and diff checks pass.                                                        | Callable/trigger integration tests and broader Rules matrix remain open.                                                          |
| `4372baa` | Notification email delivery had no explicit local/staging boundary.                                                 | `functions/lib/emailDelivery.js`, `functions/lib/notify.js`, `docs/runbooks/RESEND_DOMAIN_VERIFICATION.md`   | 4 email-policy tests pass; emulators are blocked from sending and non-production requires an exact allowlist.                                  | Resend/DNS verification and authorized staging configuration remain external gates.                                               |

## Current issue queue

1. Define explicit staging project selection and complete non-production smoke validation.
2. Add recovery runbook validation against a non-production copy.
3. Define an explicit, consent-based preference projection before enabling cross-member discovery.
4. Triage dependency audit warnings without broad or unsafe upgrades.

## Deployment guard evidence

`hosting:deploy` and `hosting:preview` now route through `scripts/deploy-hosting.mjs`. The guard requires an explicit `FIREBASE_DEPLOY_PROJECT_ID` and refuses `toronto-tennis-league` unless both `ALLOW_PRODUCTION_DEPLOY=true` and `FIREBASE_DEPLOY_CONFIRM=I_UNDERSTAND_PRODUCTION` are present. No deploy was run during this change.

## CI evidence

`.github/workflows/ci.yml` now runs on `dev-anuj` pushes and pull requests. It installs Node.js 22 and Temurin Java 21, runs `npm ci`, `npm run lint`, `npm run build`, root domain tests, Firestore and Storage Rules suites, Functions dependencies and unit tests, Functions syntax checks, and `git diff --check`. It intentionally does not deploy or authenticate to Firebase.

## Validation record

- `npm ci` completed for root and Functions dependencies.
- `npm run lint` passed.
- `npm test` passes 35 root unit tests.
- `cd functions && npm test` passes 27 Functions unit tests.
- `npm run build` passed; it emits the generated programs CSV and Vite `dist/` output.
- Architecture diagrams are now six Mermaid Markdown files under `docs/architecture/diagrams/`; the former HTML/SVG pairs and project-local diagram skill were removed.
- Emulator configuration is exercised only with synthetic project ID `rands-local`; local Java 21 and isolated-port launchers are documented and verified.
- Firestore Rules pass 29 tests and Storage Rules pass 5 tests. Synthetic fixture smoke testing seeds 4 Auth users and 32 Firestore documents.
- The `stats/{uid}` Rules boundary now preserves the document UID on member create/update; TypeScript, test-file syntax, and whitespace checks passed.
- Member preference writes now allow only documented self-service fields; provider identifiers and role flags remain super-admin-only. The test covers safe preference updates, role-field injection, and UID substitution.
- GitHub Actions run `32211081070` passed the final CI job: Java setup, web dependencies, typecheck, build, root domain tests, Firestore and Storage Rules tests, Functions dependencies/unit tests/syntax, and whitespace checks.
- The synthetic fixture module covers member, organizer, provider, multi-role, profile/contact, event/RR draft, match, task/reward, marketplace, notification, court, and aggregate documents. Production project IDs are rejected before emulator initialization.
- Storage reads are now explicit: LandingPage, Gallery, avatars, and listings are public; report/suggestion paths require authentication and owner scope. Anonymous report writes remain limited to the `court_reports/anon/` prefix.
- Email delivery is environment-gated: emulator delivery is blocked, non-production delivery requires `EMAIL_DELIVERY_ENABLED=true` plus an exact `EMAIL_ALLOWED_RECIPIENTS` entry, and production delivery is recognized only by the production project ID. Resend/DNS status remains unverified.
- Functions emulator integration passes 11 tests, and the browser suite passes 5 local-emulator journeys covering login, signup bootstrap, event join, tournament result application, and advancement.
- `npm audit --json` could not refresh in the original validation environment because the npm registry DNS lookup failed; install-time audit warnings remain untriaged.
- No production Firebase command was run. Staging, backup recovery, provider configuration, and production deployment remain explicit external gates.

## Handoff rule

Every later stabilization issue should add its evidence, validation, commit, and remaining risk here. Keep the record technical and avoid claiming external console, staging, production, backup, device, or deployment outcomes without direct evidence.

## Maintainability upgrade update — 2026-08-19

- The root package now exposes separate `typecheck`, real `lint`, `format:check`, `docs:verify`,
  `functions:syntax`, and `verify` commands. CI calls the same `npm run verify` entry point after
  installing the root and Functions packages.
- TypeScript full `strict` mode, no-implicit-return, and no-fallthrough checks pass. The legacy
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` migration remains open.
- The local Rules wrappers select temporary ports and use the installed Java 21 runtime. The
  Firestore suite passes 29 tests and the Storage suite passes 5 tests locally; this is source/rules
  evidence, not deployed Firebase evidence. The isolated fixture smoke test also starts temporary
  Auth/Firestore emulators and exercises the synthetic seed command.
- The full `npm run emulators` launcher keeps the conventional `firebase.json` ports for app
  development and adds the local Java 21 fallback. Alternate local ports are supported through a
  local ignored Firebase config plus matching Vite and Admin emulator host variables.
- The local seed command defines four synthetic Auth users alongside the Firestore fixture set and
  refuses non-local Auth targets. Emulator credentials are stored only in the synthetic fixture file.
- Tournament scoring/Round Robin primitives, signup validation, event participant access, and the
  Matches weekly pool now have smaller tested boundaries. The migration framework defaults to
  dry-run and requires an explicit project.
- The native mutating parallel runner did not create isolated worktrees and was stopped before
  further changes. Reviewed bounded changes were retained and integrated by the coordinator on
  `dev-anuj`; no temporary branch was pushed.
