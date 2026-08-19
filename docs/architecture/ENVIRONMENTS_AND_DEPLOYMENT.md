# Environments and deployment

Diagrams: [target safe delivery architecture](diagrams/target-safe-delivery-architecture.md) · [modernization before/after](diagrams/modernization-before-after.md).

## Current state

The checkout contains one Firebase project alias:

```text
default -> toronto-tennis-league
```

`firebase.json` configures Firestore rules/indexes, Storage rules, Functions, Hosting, and local emulator ports. The checkout still has no staging project. The root package has local emulator, synthetic seed, `hosting:deploy`, and `hosting:preview` commands; Hosting commands require an explicit project decision because the CLI’s active project is production-sensitive. `firebase-tools` is pinned in root `devDependencies` and invoked from `node_modules/.bin`.

## Current delivery path

```text
developer -> npm build -> dist -> Firebase Hosting project selected by CLI
```

This is not yet a safe promotion pipeline. A Hosting preview channel is a Hosting feature inside the selected Firebase project; it is not proof of a separate staging database or isolated Functions/Storage resources.

## Target delivery path

```text
developer
  -> local emulator suite (Auth/Firestore/Storage/Functions/Hosting)
  -> validation gates (typecheck, unit tests, rules tests, build, review)
  -> staging Firebase project
  -> manual approval and smoke test
  -> production project
```

Production should be explicit, separately selected, and protected by a deploy guard. Staging and local environment variables must never silently reuse production credentials. Do not run a bare Firebase CLI deploy from this checkout; use an explicit-project, approval-gated workflow and review the affected rules/Functions first.

## Recovery readiness

No backup/export configuration, restore drill, or staging project alias was found in the checkout. The operational procedure is documented in [Firestore backup and recovery](../runbooks/FIRESTORE_BACKUP_AND_RECOVERY.md). Treat production recovery as an open operational gate. Do not run destructive migrations until an export/restore procedure has been tested against a non-production copy.

## Evidence, risks, and open questions

- Evidence: `.firebaserc`, `firebase.json`, `package.json`, `src/lib/firebase.ts`, `.gitignore`.
- Risk: generic CLI commands can target `toronto-tennis-league`.
- Local CLI evidence: root `devDependencies.firebase-tools` is pinned to `15.27.0`; emulator and Hosting scripts use that repository-local binary.
- Open: identify the authorized staging project, Firebase database location/edition, CI secret strategy, and production deploy approver.

Last verified source SHA: `846dee90323dbd32d556e9254586cd7f9ebc03c7`.
