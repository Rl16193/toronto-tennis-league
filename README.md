# Racquets & Strings

Racquets & Strings is a React/Vite tennis-league platform backed by Firebase. The current application includes member profiles, events and tournaments, matches and rankings, tasks and rewards, marketplace listings, court data, notifications, and provider-related service flows.

This repository is technical project documentation and application source. The canonical working branch for this engineering block is `dev-anuj`; do not develop on or merge into `main`.

## Verified stack

- React 19 + TypeScript 5.8
- Vite 6 + Tailwind CSS 4
- Firebase Web SDK 12
- Firebase Auth, Firestore, Storage, Hosting, and Cloud Functions
- Cloud Functions on Node.js 22, region `us-central1`
- Resend is used by server-side notification code

## Prerequisites

- Node.js 22 and npm
- A Java runtime on `PATH` for the Firestore Emulator Suite
- Access to a non-production Firebase configuration for local development
- Git access to `tbtctennis/Racquets-And-Strings`

The Functions package declares Node.js 22. Use that runtime for both root and Functions dependency installation to avoid version drift.

## First-time setup

```bash
git clone https://github.com/tbtctennis/Racquets-And-Strings.git ~/Developer/RandS-Tennis
cd ~/Developer/RandS-Tennis
git checkout dev-anuj
npm ci
cd functions && npm ci
cd ..
cp .env.example .env.local
```

The template defaults to local emulators with a synthetic `rands-local` project ID. Vite exposes only variables prefixed with `VITE_`; do not place service-account credentials, Resend secrets, or other private keys in this file. The Functions `RESEND_API_KEY` is a server-managed Firebase secret, not a client environment variable.

## Local development

Start the Emulator Suite in one terminal and the Vite app in another:

```bash
npm run emulators
# in a second terminal, after the emulator suite is ready:
npm run seed:emulator
npm run dev
```

The Vite server uses port `3000`; the full Emulator Suite uses the ports declared in `firebase.json`.
Firestore and Storage Rules test commands use temporary emulator configurations and select an
available local port, which avoids collisions with unrelated services. Java is still required by
the Firestore Emulator Suite.

`npm run seed:emulator` writes only deterministic synthetic data to the local Firestore emulator (`rands-local`) and refuses any other project ID. The fixture set covers member, organizer, provider, multi-role, event, Round Robin draft, match, task/reward, marketplace, notification, court, and aggregate paths.

GitHub CI runs on pushes and pull requests targeting `dev-anuj`, installs Node 22 and Java 21, and
runs the same `npm run verify` quality gates plus a separate Functions dependency install. It does
not deploy or connect to Firebase.

## Validation commands

```bash
npm run typecheck     # Full TypeScript strict check, no emit
npm run lint          # ESLint React/TypeScript checks
npm run format:check  # Maintained-slice formatting check
npm test              # Pure domain and data-contract tests
npm run test:rules    # Firestore Rules suite in a temporary local emulator
npm run test:storage  # Storage Rules suite in a temporary local emulator
npm run build         # Generates the programs CSV, then creates dist/
npm run verify        # All local quality gates in one command
npm run preview       # Serves the built dist/ locally
npm run seed:emulator # Seeds synthetic local Firestore data; emulator must be running
cd functions && npm test # Pure Functions helper tests
```

Project architecture and security validation gaps are tracked in [docs/engineering/SECURITY_BASELINE.md](docs/engineering/SECURITY_BASELINE.md). Email delivery safety and DNS verification steps are tracked in [docs/runbooks/RESEND_DOMAIN_VERIFICATION.md](docs/runbooks/RESEND_DOMAIN_VERIFICATION.md).

## Firebase and deployment safety

`.firebaserc` currently names `toronto-tennis-league`, which is production-sensitive. Routine development and QA must not use that project. `hosting:deploy` and `hosting:preview` now require `FIREBASE_DEPLOY_PROJECT_ID`; production also requires two explicit approval environment variables. Do not run a production action from this checkout without an approved environment plan.

For an isolated staging project, use the project ID supplied by the environment owner:

```bash
FIREBASE_DEPLOY_PROJECT_ID=<staging-project-id> npm run hosting:preview
```

The guard script is `scripts/deploy-hosting.mjs`. It never infers the deployment project from `.firebaserc`.

The next environment work is to establish:

1. local Firebase emulators; **implemented in this commit**;
2. an isolated staging project and explicit project selection;
3. rules/Functions tests;
4. approval-gated production deployment documentation.

## Architecture and engineering guidance

- [Architecture index](docs/architecture/README.md)
- [System architecture](docs/architecture/SYSTEM_ARCHITECTURE.md)
- [Data model](docs/architecture/DATA_MODEL.md)
- [Data flow](docs/architecture/DATA_FLOW.md)
- [Authorization model](docs/architecture/AUTHORIZATION_MODEL.md)
- [Environment and delivery boundaries](docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md)
- [Agent skills inventory](docs/engineering/AGENT_SKILLS.md)
- [Maintainability map and quality commands](docs/engineering/MAINTAINABILITY.md)
- [Security baseline](docs/engineering/SECURITY_BASELINE.md)
- [Takeover stabilization log](docs/engineering/TAKEOVER_STABILIZATION_LOG.md)
- [Firestore backup and recovery runbook](docs/runbooks/FIRESTORE_BACKUP_AND_RECOVERY.md)
- [Domain rules](docs/domain/TOURNAMENT_RULES.md)

Use the project-local skills under `.agents/skills/` for Firebase work, architecture diagrams, security review, investigation, QA, and documentation. Keep commits issue-sized and push completed work only to `origin/dev-anuj`.

## Common troubleshooting

- **Firebase configuration is incomplete:** confirm all required `VITE_FIREBASE_*` values exist in `.env.local`, then restart Vite.
- **Functions dependency/runtime warnings:** use Node.js 22 and reinstall from `functions/package-lock.json` with `npm ci`.
- **Build output changes:** `npm run build` regenerates `public/programs-tennis.csv` before Vite builds `dist/`; review generated changes before committing.
- **Rules or production behavior questions:** inspect the current rules and architecture documents; do not validate against the production project by default.
