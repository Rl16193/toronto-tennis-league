# Environments and deployment

Diagrams: [target safe delivery architecture](diagrams/target-safe-delivery-architecture.md) · [modernization before/after](diagrams/modernization-before-after.md).

## Current state

The checkout contains one non-default local Firebase project alias:

```text
local -> rands-local
```

`firebase.json` configures Firestore rules/indexes, Storage rules, Functions, Hosting, and local emulator ports. The checkout still has no staging project. The production-sensitive project is not configured as a CLI default. The root package has local emulator, synthetic seed, `hosting:deploy`, and `hosting:preview` commands; emulator commands explicitly select `rands-local`, while Hosting commands require an explicit project decision. `firebase-tools` is pinned in root `devDependencies` and invoked from `node_modules/.bin`.

The full-suite launcher preflights every configured emulator port and names conflicts before
Firebase starts. It accepts only `--config <local-file>` as an optional argument and continues to
force `rands-local`. An ignored `firebase.local.json` with alternate ports supports Firebase CLI,
Admin SDK, and isolated emulator work. For a complete browser workflow on alternate ports, mirror
the chosen Auth, Firestore, Functions, and Storage ports with the documented
`VITE_*_EMULATOR_PORT` values in `.env.local`; Hosting and Emulator UI ports need no Vite override.

The executable deployment guard is intentionally Hosting-only. This code-only checkout does not
provide a full Rules/Storage/Functions release command because no authorized staging project or
production change window is configured. Those surfaces remain external approval gates; adding a
wrapper without a real target would make a false safety promise.

## Current delivery path

```text
developer -> npm build -> dist -> explicitly selected Firebase Hosting project
```

This is not yet a safe promotion pipeline. A Hosting preview channel is a Hosting feature inside the selected Firebase project; it is not proof of a separate staging database or isolated Functions/Storage resources.

Repository-local PASS means the reviewed source and reliable local/emulator gates pass at one SHA.
It does not promote that SHA, confirm deployed Rules/Functions, prove staging parity, or authorize a
production operation. Staging PASS requires evidence from the explicitly named isolated project;
production PASS requires a separate approval, deploy receipt, post-deploy validation, and recovery
evidence.

## Target delivery path

```text
developer
  -> local emulator suite (Auth/Firestore/Storage/Functions/Hosting)
  -> validation gates (typecheck, unit tests, rules tests, build, review)
  -> staging Firebase project
  -> manual approval and smoke test
  -> production project
```

Production should be explicit, separately selected, and protected by a deploy guard. Staging and local environment variables must never silently reuse production credentials. Note that staging will nonetheless hold **real member contact data**, seeded unscrubbed by owner ruling 2026-08-31 ([VISION.md](../planning/VISION.md) §10.2), so credential isolation is not the same thing as data isolation here. Do not run a bare Firebase CLI deploy from this checkout; use an explicit-project, approval-gated workflow and review the affected rules/Functions first.

## Recovery readiness

No backup/export configuration, restore drill, or staging project alias was found in the checkout. The operational procedure is documented in [Firestore backup and recovery](../runbooks/FIRESTORE_BACKUP_AND_RECOVERY.md). Treat production recovery as an open operational gate. Do not run destructive migrations until an export/restore procedure has been tested against a non-production copy.

## Evidence, risks, and open questions

- Evidence: `.firebaserc`, `firebase.json`, `package.json`, `src/lib/firebase.ts`, `.gitignore`.
- Risk: an operator can still explicitly target a production project; deployment wrappers retain
  their separate project and approval checks.
- Local CLI evidence: root `devDependencies.firebase-tools` is pinned to `15.27.0`; emulator and Hosting scripts use that repository-local binary.
- Open: identify the authorized staging project, Firebase database location/edition, CI secret strategy, and production deploy approver.
