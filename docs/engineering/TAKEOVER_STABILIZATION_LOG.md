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

## Current issue queue

1. Add local Firebase Emulator Suite configuration and seeded rules tests.
2. Define explicit staging project selection and prevent routine commands from defaulting to production.
3. Add recovery runbook and distinguish code-verifiable backup tooling from console-only controls.
4. Add GitHub CI for typecheck, build, rules tests, Functions tests, and security checks.
5. Consolidate role authorization and tournament scoring behind server-authoritative paths.

## CI evidence

`.github/workflows/ci.yml` now runs on `dev-anuj` pushes and pull requests. It installs Node.js 22, runs `npm ci`, `npm run lint`, `npm run build`, installs Functions dependencies, checks Functions JavaScript syntax, and runs `git diff --check`. It intentionally does not deploy, authenticate to Firebase, or claim that rules/emulator tests exist.

## Validation record

- `npm ci` completed for root and Functions dependencies.
- `npm run lint` passed.
- `npm run build` passed; it emits the generated programs CSV and Vite `dist/` output.
- All committed diagram SVGs passed `xmllint --noout`.
- All committed diagram HTML files contain one SVG and match their SVG export geometry/content.
- Emulator configuration is present and the CLI was invoked with synthetic project ID `rands-local`; startup was blocked by the host’s missing Java runtime (`java -version` exit 1).
- Initial Firestore Rules tests cover preference role self-assignment, contact ownership/privacy, server-only connection markers, task point minting, member stats point writes, and admin metric access. They are wired into `npm run test:rules` and CI but could not execute locally until Java is installed.
- `npm audit --json` could not refresh in the original validation environment because the npm registry DNS lookup failed; install-time audit warnings remain untriaged.
- Firebase rules emulator tests were not run because no emulator/test harness is currently configured.

## Handoff rule

Every later stabilization issue should add its evidence, validation, commit, and remaining risk here. Keep the record technical and avoid claiming external console, staging, production, backup, device, or deployment outcomes without direct evidence.
