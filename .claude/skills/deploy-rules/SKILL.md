---
name: deploy-rules
description: Deploy Firestore and/or Storage security rules to the toronto-tennis-league Firebase project. Use when firestore.rules or storage.rules has changed — a git push does NOT deploy them.
disable-model-invocation: true
---

# deploy-rules

Deploys `firestore.rules` and `storage.rules`. **A git push does not deploy rules.** Neither does
`npm run hosting:deploy` — that ships `dist/` only. This skill is the only path that puts rule
changes into effect.

Project: `toronto-tennis-league` (from `.firebaserc`). Rule file paths come from `firebase.json`.

## 1. Find out what actually changed

```bash
git status --short firestore.rules storage.rules
```

If neither file is modified and neither differs from what is live, stop and say so — there is
nothing to deploy.

Then show the diff for each changed file:

```bash
git diff firestore.rules storage.rules
```

## 2. Confirm before deploying

These files are the authorization boundary for the whole app. A bad deploy can lock every user
out of their own data, or expose data that should be private. Walk the user through the diff and
get an explicit yes before running any deploy command.

Pay particular attention to changes that:

- widen a `read` rule (who can now see data that was previously restricted)
- touch the `stats` collection — owners may only update `skill_level`, `tournament_preference`,
  `name`, and `user_id`; every scoring field is organiser-only
- touch `event_creator` in `preferences`, which only the super-admin UID may set
- remove or loosen an `allow write` guard on `tournament_matches` or `event_participants`

## 3. Deploy

Only the file(s) that changed:

```bash
npx firebase-tools deploy --only firestore:rules
```

```bash
npx firebase-tools deploy --only storage
```

Both at once:

```bash
npx firebase-tools deploy --only firestore:rules,storage
```

## 4. Verify

The CLI prints a deploy summary — confirm it names the expected ruleset and reports success. If
it fails on a compile error, the previously deployed rules stay live; fix the file and redeploy.

For a belt-and-braces check, the live ruleset is visible in the Firebase Console under
Firestore → Rules and Storage → Rules. Storage rules can also be published by pasting into that
console page, which is the documented fallback if the CLI deploy is unavailable.
