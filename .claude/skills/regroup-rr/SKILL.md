---
name: regroup-rr
description: Place Round-Robin late joiners into groups using scripts/regroup-rr.js (Firebase Admin SDK). Always dry-runs first and shows the plan before writing. Use for the end-of-day RR regrouping pass.
disable-model-invocation: true
---

# regroup-rr

Runs the EOD pass that seats Round-Robin late joiners into groups. The script uses the **Admin
SDK**, so it bypasses Firestore security rules and writes straight to production. Never run it
live without a dry run first.

Unlike knockout draws, RR accepts registration after the draw is generated (`slotStatus` in
`useJoin.ts` is bypassed for RR), so joiners accumulate and need placing.

## Prerequisite

`serviceAccount.json` must be in the project root. It is gitignored and local-only. The script
exits 1 with `Key not found` if it is missing — that is a setup problem, not something to work
around.

## 1. Dry run — always first

```bash
node scripts/regroup-rr.js --key serviceAccount.json --dry-run
```

Prints `🔍 DRY RUN — no writes will be made` and reports what it *would* do. Nothing is written.

## 2. Read the plan before proceeding

Show the user the dry-run output and confirm it looks right. The placement rules the script
enforces:

- Groups with **4–5 players are locked**. So is any group with a played match — those are never
  touched, regardless of size.
- Only groups with **≤3 players** accept a joiner, and the joiner needs a matching skill band
  (zone preferred but not required).
- Overflow that fits nowhere forms new `(band, zone)` groups via `splitEvenly`.
- **Singles only.** Doubles RR draws are skipped — team placement is out of scope.

A run with no new joiners writes nothing; the script is idempotent. If the dry run reports no
changes, stop — there is nothing to do.

## 3. Live run

Only after the user confirms the plan:

```bash
npm run regroup:rr
```

That is `node scripts/regroup-rr.js --key serviceAccount.json`. It prints
`✏️  LIVE RUN — writing to Firestore`.

## Keeping the script correct

`scripts/regroup-rr.js` **duplicates** the pure helpers from `src/pages/tournament/rrGeneration.ts`
and `utils.ts` — `splitEvenly` and `skillBand` are copied verbatim because scripts are plain JS.
If grouping rules change on the app side, this script drifts silently and will seat players by the
old rules. Check both when either changes.
