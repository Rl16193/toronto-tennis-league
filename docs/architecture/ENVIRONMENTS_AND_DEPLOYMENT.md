# Environments and deployment

## Current state

The checkout contains one Firebase project alias:

```text
default -> toronto-tennis-league
```

`firebase.json` configures Firestore rules/indexes, Storage rules, Functions, and Hosting. It does not define an emulator suite or a staging project. The root package has `hosting:deploy` and `hosting:preview` commands, but both require an explicit project decision because the CLI’s active project is production-sensitive.

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

Production should be explicit, separately selected, and protected by a deploy guard. Staging and local environment variables must never silently reuse production credentials.

## Recovery readiness

No backup/export configuration, restore drill, staging project alias, or recovery runbook was found in the checkout. Treat production recovery as an open operational gate. Do not run destructive migrations until an export/restore procedure has been tested against a non-production copy.

## Evidence, risks, and open questions

- Evidence: `.firebaserc`, `firebase.json`, `package.json`, `src/lib/firebase.ts`, `.gitignore`.
- Risk: generic CLI commands can target `toronto-tennis-league`.
- Open: identify the authorized staging project, Firebase database location/edition, CI secret strategy, and production deploy approver.

Last verified source SHA: `29690a3812a1391bf5a471b7efa7dc41d610c146`.
