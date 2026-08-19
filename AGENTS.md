# Racquets & Strings — Codex project contract

## Project identity

- Repository: `tbtctennis/Racquets-And-Strings`
- Expected macOS path: `~/Developer/RandS-Tennis`
- Production Firebase project: `toronto-tennis-league` (sensitive; do not target it for routine development or QA).

## Branch and change policy

- Work only on `dev-anuj` for this engineering block.
- Do not change `main`, merge to `main`, force-push, or rewrite public history.
- Keep commits issue-sized and reviewable; push completed commits to `origin/dev-anuj`.
- Preserve unknown user work. Never reset or delete it without explicit approval.

## Environment safety

- Use local emulators first, staging second, and production only after explicit approval.
- Inspect the active Firebase project before any Firebase CLI operation.
- Do not run generic deploy commands from this checkout: `firebase.json` currently points at the production project and no staging project is configured.
- Do not perform destructive Firestore migrations, production deploys, DNS changes, or provider configuration changes in this project block.

## Verified stack

- React 19, TypeScript 5.8, Vite 6, React Router 7, Tailwind CSS 4.
- Firebase Web SDK 12: Auth, Firestore, Storage, Functions, Analytics.
- Cloud Functions v2 on Node 22; callable, Firestore, Storage, and scheduled functions.
- Resend-backed email functions and GA4 analytics when supported by the browser.

## Verified commands

```bash
npm ci
npm run dev       # Vite on port 3000
npm run typecheck # TypeScript strict no-emit check
npm run lint      # ESLint source, scripts, tests, and Functions checks
npm run format:check
npm run docs:verify
npm run verify    # all configured local quality gates
npm run build     # generates programs CSV, then Vite build
npm test          # pure tournament/domain tests
npm run preview
npm run dev:emulator # local Auth/Firestore/Functions/Storage/Hosting suite
npm run emulators # local Firebase suite; requires Java for Firestore
npm run seed:emulator # synthetic Firestore fixtures; emulator must already be running
npm run test:rules # Firestore Rules tests through a temporary local emulator
npm run test:storage # Storage Rules tests through a temporary local emulator
cd functions && npm test # pure Functions helper tests
```

The root and Functions packages now have pure unit-test commands. Emulator wiring and initial Firestore/Storage Rules harnesses exist, but local execution still requires Java and callable/trigger integration coverage remains incomplete. Treat staging and full authorization coverage as stabilization work, not as completed capabilities.

GitHub CI is defined at `.github/workflows/ci.yml` and runs dependency installation followed by
`npm run verify`, including typecheck, ESLint, formatting, documentation freshness, root and
Functions tests, Firestore and Storage Rules tests, Functions syntax checks, build, and whitespace
checks. It does not deploy or access Firebase.

## Architecture pointers

- Architecture index: `docs/architecture/README.md`
- Skills inventory: `docs/engineering/AGENT_SKILLS.md`
- Diagrams: `docs/architecture/diagrams/`
- Firebase boundaries: `firestore.rules`, `storage.rules`, `firebase.json`, `.firebaserc`

## Skill routing

- Architecture diagrams are maintained as Mermaid Markdown under `docs/architecture/diagrams/`.
- Firebase/Auth/Firestore/Hosting/rules work → the relevant existing `.agents/skills/firebase-*` skill; use `firebase-security-rules-auditor` for rules review.
- Architecture planning → `.agents/skills/gstack/plan-eng-review/SKILL.md`.
- Bug investigation → `.agents/skills/gstack/investigate/SKILL.md`.
- Code review → `.agents/skills/gstack/review/SKILL.md`.
- QA → `.agents/skills/gstack/qa-only/SKILL.md` or `qa/SKILL.md` when a safe local/staging environment exists.
- Documentation → `.agents/skills/gstack/document-generate/SKILL.md` and `document-release/SKILL.md`.
- Security → `.agents/skills/gstack/cso/SKILL.md` plus the Firebase rules auditor.

Inspect the relevant `SKILL.md` before using a workflow. Do not use gstack ship/deploy workflows to merge into `main` or deploy production.

## Current behavioral invariants

- Everyone is authenticated through Firebase Auth for private workflows; UI route guards are not the authorization boundary.
- Contact data is intentionally narrower than public profile data: access is owner-, connection-, organizer-, or listing-mediated by Firestore Rules.
- `connections`, `public_contacts`, offers, redemptions, notifications, ranking history, and aggregate metrics are server-authoritative or read-restricted paths.
- Points and reward counters are intended to be awarded by Functions. Tournament code still contains direct client-side stats writes, so any scoring change requires a rules/code reconciliation review.
- Event creator status is currently represented through `preferences.event_creator` plus one hardcoded super-admin UID; it is not a general custom-claims role system.
- Round Robin drafts live at `events/{eventId}/rr_drafts/{drawKey}` and are governed separately from top-level collections.

## Working rule

Read current code and rules before changing behavior. If documentation conflicts with code, record the conflict and resolve it deliberately in the architecture evidence.
