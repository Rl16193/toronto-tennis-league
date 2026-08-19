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

| Commit | Issue / root cause | Files or evidence | Validation | Remaining risk |
| --- | --- | --- | --- | --- |
| `345f382` | Future Codex sessions lacked durable project and skill routing. | `AGENTS.md`, `skills-lock.json`, `.agents/skills/` | Installation and lock hashes reviewed. | Upstream skill updates require deliberate review. |
| `5057d5e` | Architecture knowledge was distributed across source without a current-state record. | `docs/architecture/` Markdown and ADRs | Source, rules, Functions, Firebase config, and package manifests inspected. | Deployed Firebase state and staging isolation remain unverified. |
| `087411d` | Technical visuals and security findings were not available as durable project artifacts. | Branded editable diagrams, SVG exports, `SECURITY_BASELINE.md`, skill inventory updates | All six HTML/SVG pairs checked; SVG XML validation passed; security review recorded. | PNG export needs the Playwright Python runtime; emulator rules tests are not configured. |
| `230a291` | Rules authorization had no repeatable local harness. | `tests/rules/firestore.rules.test.mjs`, `package.json`, `.github/workflows/ci.yml` | Harness syntax, CI YAML, and lint checks passed; emulator execution still needs the Java prerequisite. | Coverage is initial and Functions authorization tests are still absent. |
| `fe6ae63` | Hosting scripts could inherit the production-sensitive `.firebaserc` project. | `scripts/deploy-hosting.mjs`, `package.json`, `README.md` | Missing-project and production-without-approval guard paths both refused safely; no deploy ran. | Authorized staging project and production approval workflow remain external gates. |
| `d636fb3` | Separate HTML/SVG diagram artifacts were difficult to view and maintain. | `docs/architecture/diagrams/*.md`, architecture links, skill inventory | Six Mermaid Markdown files, one block each; no HTML/SVG references remain. | Mermaid rendering depends on the Markdown viewer; no separate export is maintained. |
| Current | Provider role fields were writable by the member owner even though redemptions access trusts them. | `firestore.rules`, `tests/rules/firestore.rules.test.mjs` | TypeScript, Rules test syntax, and diff checks passed; emulator startup reached the missing-Java failure. | Rules assertions still need a Java-enabled emulator run. |
| `e84d0f6` | GitHub CI failed at `Firestore Rules tests` because the workflow did not provision Java for the Firestore emulator. | `.github/workflows/ci.yml` | Public run `32209659003` confirmed typecheck/build passed and Rules tests failed; run `32210015729` passed after Temurin Java 21 was added. | Local macOS Rules execution still needs a Java runtime. |
| Current | Emulator wiring had no reusable synthetic dataset or safe seed command. | `tests/fixtures/local-fixtures.mjs`, `tests/fixtures/seed-emulator.mjs`, package scripts, README | 25 fixture documents validated; seed command refuses any project other than `rands-local`. | Emulator must be running and local Java remains required for full smoke execution. |

## Current issue queue

1. Install/authorize the local Java prerequisite and execute the Rules harness.
2. Define explicit staging project selection and complete non-production smoke validation.
3. Add recovery runbook validation against a non-production copy.
4. Expand CI with Functions authorization tests and security checks.
5. Consolidate role authorization and tournament scoring behind server-authoritative paths.

## Deployment guard evidence

`hosting:deploy` and `hosting:preview` now route through `scripts/deploy-hosting.mjs`. The guard requires an explicit `FIREBASE_DEPLOY_PROJECT_ID` and refuses `toronto-tennis-league` unless both `ALLOW_PRODUCTION_DEPLOY=true` and `FIREBASE_DEPLOY_CONFIRM=I_UNDERSTAND_PRODUCTION` are present. No deploy was run during this change.

## CI evidence

`.github/workflows/ci.yml` now runs on `dev-anuj` pushes and pull requests. It installs Node.js 22 and Temurin Java 21, runs `npm ci`, `npm run lint`, `npm run build`, runs the Firestore Rules suite, installs Functions dependencies, checks Functions JavaScript syntax, and runs `git diff --check`. It intentionally does not deploy or authenticate to Firebase.

## Validation record

- `npm ci` completed for root and Functions dependencies.
- `npm run lint` passed.
- `npm run build` passed; it emits the generated programs CSV and Vite `dist/` output.
- Architecture diagrams are now six Mermaid Markdown files under `docs/architecture/diagrams/`; the former HTML/SVG pairs and project-local diagram skill were removed.
- Emulator configuration is present and the CLI was invoked with synthetic project ID `rands-local`; startup was previously blocked by the host’s missing Java runtime (`java -version` exit 1). A later rules-test invocation also hung during CLI package resolution and was stopped without connecting to Firebase.
- Initial Firestore Rules tests cover preference role self-assignment, contact ownership/privacy, server-only connection markers, task point minting, member stats point writes, UID substitution on member stats, and admin metric access. They are wired into `npm run test:rules` and CI but have not passed locally because the emulator prerequisite is unresolved.
- The `stats/{uid}` Rules boundary now preserves the document UID on member create/update; TypeScript, test-file syntax, and whitespace checks passed.
- Member preference writes now allow only documented self-service fields; provider identifiers and role flags remain super-admin-only. The test covers safe preference updates, role-field injection, and UID substitution.
- GitHub Actions run `32210015729` passed the complete validation job: Java setup, web dependencies, typecheck, build, Firestore Rules tests, Functions dependencies, Functions syntax, and whitespace checks.
- The synthetic fixture module covers member, organizer, provider, multi-role, profile/contact, event/RR draft, match, task/reward, marketplace, notification, court, and aggregate documents. Production project IDs are rejected before emulator initialization.
- `npm audit --json` could not refresh in the original validation environment because the npm registry DNS lookup failed; install-time audit warnings remain untriaged.
- Firebase Rules emulator tests remain unverified locally because Java/CLI resolution is unresolved; no production Firebase command was run.

## Handoff rule

Every later stabilization issue should add its evidence, validation, commit, and remaining risk here. Keep the record technical and avoid claiming external console, staging, production, backup, device, or deployment outcomes without direct evidence.
