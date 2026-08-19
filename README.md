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

Fill `.env.local` with the Firebase Web configuration for a non-production project. Vite exposes only variables prefixed with `VITE_`; do not place service-account credentials, Resend secrets, or other private keys in this file. The Functions `RESEND_API_KEY` is a server-managed Firebase secret, not a client environment variable.

## Local development

```bash
npm run dev
```

The Vite server uses port `3000`. The current checkout does not yet contain Firebase Emulator Suite configuration or a rules test harness, so do not assume `firebase emulators:start` is a safe or complete workflow until the environment-isolation work is finished.

## Validation commands

```bash
npm run lint       # TypeScript no-emit check
npm run build      # Generates the programs CSV, then creates dist/
npm run preview    # Serves the built dist/ locally
```

Functions currently have no package test script. Project architecture and security validation gaps are tracked in [docs/engineering/SECURITY_BASELINE.md](docs/engineering/SECURITY_BASELINE.md).

## Firebase and deployment safety

`.firebaserc` currently names `toronto-tennis-league`, which is production-sensitive. Routine development and QA must not use that project. The existing `hosting:deploy` and `hosting:preview` scripts have not yet been environment-guarded; do not run them as part of local development or deploy to Firebase from this checkout without an explicit reviewed environment plan.

The next environment work is to establish:

1. local Firebase emulators;
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
- [Security baseline](docs/engineering/SECURITY_BASELINE.md)
- [Takeover stabilization log](docs/engineering/TAKEOVER_STABILIZATION_LOG.md)

Use the project-local skills under `.agents/skills/` for Firebase work, architecture diagrams, security review, investigation, QA, and documentation. Keep commits issue-sized and push completed work only to `origin/dev-anuj`.

## Common troubleshooting

- **Firebase configuration is incomplete:** confirm all required `VITE_FIREBASE_*` values exist in `.env.local`, then restart Vite.
- **Functions dependency/runtime warnings:** use Node.js 22 and reinstall from `functions/package-lock.json` with `npm ci`.
- **Build output changes:** `npm run build` regenerates `public/programs-tennis.csv` before Vite builds `dist/`; review generated changes before committing.
- **Rules or production behavior questions:** inspect the current rules and architecture documents; do not validate against the production project by default.
