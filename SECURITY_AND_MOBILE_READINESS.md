# Security Audit & Mobile-App Readiness — Racquets & Strings

**Date:** 2026-08-12 (revision 2 — re-audit after the zone-draws / Elements / server-side-points commits)
**Scope:** the local working tree at commit `08d60cd` — `firestore.rules`, `storage.rules`,
`functions/`, `src/`, `scripts/`, `vite.config.ts`, `index.html`.
**Audience:** Rahul Lal (owner) and Anuj Raja (incoming technical lead).

**What changed since the last audit:** the 189-file backlog was committed (repo risk drops from
"uncommitted" to "unpushed" — `main` is 3 commits ahead of GitHub). `firestore.rules` and
`storage.rules` are **byte-identical** to the previous audit, so **every rules finding stands
unchanged**, including the confirmed `rr_drafts` bug — which CLAUDE.md now *documents* but the rules
still don't *fix*. New since last time: `functions/lib/points.js` adds a third hand-synced
duplication pair, `scripts/` grew to 14 production-writing admin scripts, and `rewards.js` was
reworked to compute redeemable balances server-side (a security **improvement** — clients can no
longer be trusted for balances).

---

## How to read this document

Part 1 — security audit: what is wrong, why it matters, how to fix it.
Part 2 — mobile-app readiness: what exists, what's missing, what blocks a store submission.
Part 3 — prioritised action plan.
Part 4 — tech-stack decision guide: the questions and insights for choosing a mobile direction.

| Level | Meaning |
|---|---|
| **P0 — Critical** | Actively exploitable or unrecoverable-loss risk. Fix this week |
| **P1 — High** | Real exposure or serious operational gap. Fix this month |
| **P2 — Medium** | Fix before scaling or a mobile launch |
| **P3 — Low** | Hygiene |

---

## ⚠️ Before acting on any finding

**Rules deploy manually** (`firebase deploy --only firestore:rules` / `--only storage`), so the repo
files may not match production. **Step one:** diff both rules files against Firebase Console →
Rules. Every finding below is written against the repo files; re-check any finding against whatever
is actually live.

---

# Part 1 — Security Audit

## Summary

| # | Finding | Severity | Change since last audit |
|---|---|---|---|
| S1 | `GEMINI_API_KEY` compiled into the public bundle | **P0** | **Unchanged — still exposed, still unused** |
| S2 | No backups; Firestore/Storage unrecoverable | **P0** | Unchanged; risk grew — now 14 production-writing scripts |
| S3 | `users` world-readable, blacklist not whitelist | **P0** | Unchanged |
| S4 | Unauthenticated, self-approving `courts` writes | **P1** | Unchanged |
| S5 | Unauthenticated, unrated `mailing_list` writes | **P1** | Unchanged |
| S6 | App Check not enabled | **P1** | Unchanged |
| S7 | Super admin is one hard-coded UID | **P1** | Unchanged |
| S8 | Local dev and scripts run against production | **P1** | Slightly worse — 14 scripts now |
| S9 | All Storage objects world-readable forever | **P2** | Unchanged |
| S10 | No account-deletion path | **P2** | Unchanged |
| S11 | Email addresses never verified | **P2** | Unchanged |
| S12 | Stale service-account key ships with functions deploys | **P2** | Unchanged |
| S13 | No error monitoring | **P2** | Unchanged |
| S14 | Hand-synced logic duplicated across runtimes | **P3** | **Worse — a third pair added (`lib/points.js`)** |
| B1 | **Confirmed bug:** `rr_drafts` subcollection unreachable | **P1** | **Documented in CLAUDE.md; rules still unfixed** |
| ✔ | Server-side redeemable balances (`rewards.js` + `lib/points.js`) | — | **Improvement** — clients can no longer forge balances |

---

## S1 — `GEMINI_API_KEY` in the public bundle · P0 · *unchanged*

`vite.config.ts` still contains:

```js
define: {
  'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
},
```

`define` is a literal build-time text substitution — the key's value is written into JavaScript
every visitor downloads. A search of `src/` for `GEMINI_API_KEY`, `generativelanguage` and
`@google/genai` still returns **nothing**: the key is exposed for zero benefit. CLAUDE.md now
even names this as "a live instance to clean up" — it just hasn't been cleaned up.

**Fix:** delete the `define` block; remove the variable from `.env`; **revoke the key** in Google
AI Studio (removal from code does not invalidate already-harvested copies). If Gemini is wanted
later, call it from a Cloud Function.

## S2 — No backups · P0 · *unchanged, risk grew*

No scheduled Firestore export, no PITR, no Storage versioning, no Auth export. Meanwhile `scripts/`
now holds **14 Admin SDK scripts** that write production directly (`regroup-rr.js`,
`restore-2025-season.mjs`, `fix-zephyr-doubles.mjs`, five backfills, …). Each run is a
no-undo operation. CLAUDE.md itself now says: *"treat any destructive one-off as unrecoverable
until backups exist."*

**Fix:** enable PITR (one toggle), daily scheduled export to GCS, Storage object versioning,
periodic `firebase auth:export`. Then test a restore — an untested backup is a belief.

## S3 — `users` world-readable with a blacklist update rule · P0 · *unchanged*

`firestore.rules:89–99`: `allow read: if true`, and the update rule blocks only
`secondary_email`/`created_at` via `hasAny()`. A user can write **any other field** — including an
email or phone number — into a document readable by the whole internet. CLAUDE.md's own hard rule
("whitelist with `hasOnly()`, never blacklist") calls this pattern out; `contacts` and `tasks`
follow it, `users` still doesn't.

**Fix:** an `ownerUserFields()` whitelist (`name`, `bio`, `avatar`, `league`,
`profile_details_visible`, `lastActive`, `isVerified`, `welcomeEmailSent`) + `hasOnly()`. Then
decide whether public read is actually required (it currently serves logged-out leaderboards).

## S4 — Anonymous, self-approving court reports · P1 · *unchanged*

`firestore.rules:314–324`: condition/waiting-board/queue reports can be created with **no
authentication** (`uid: 'no_account'`) and the rule *requires* `status == 'approved'` — anonymous
submissions publish instantly, with photos via the matching anonymous Storage path
(`court_reports/anon/`). Deliberate product choice, but an open spam/defacement/cost vector.
Note the immutability constraint: `courts` allows no updates, which is why any review flow must be
designed around creates (the Board Freshness trigger already had to learn this).

**Fix:** anonymous submissions land as `pending` + organizer approval; signed-in ones may keep
auto-approving. App Check (S6) on top.

## S5 — Open `mailing_list` creates · P1 · *unchanged*

Unauthenticated create with only a length check. Floodable, and every write costs money.
**Fix:** App Check + double opt-in.

## S6 — No App Check · P1 · *unchanged*

Anyone can drive the Firestore REST API with the public web config and exercise every
`if true` / unauthenticated rule directly. **Fix:** App Check (reCAPTCHA Enterprise), monitor →
enforce, on Firestore, Storage and Functions. Pays twice: it's also the mobile app-attestation
mechanism if you ever ship native.

## S7 — Hard-coded super admin · P1 · *unchanged*

UID `7PvfzNtDmsOq5GLMieId7QRT7wH3` is the only account that can grant creator status; losing it
means editing and redeploying rules. **Fix:** custom claims + at least two admin accounts, keeping
the UID as a documented bootstrap escape hatch.

## S8 — Everything runs against production · P1 · *slightly worse*

One Firebase project. `npm run dev` and all 14 scripts touch production. CLAUDE.md now says this
plainly ("Production is the only environment"). **Fix:** Emulator Suite first (also enables rules
unit-testing), a staging project second, `--dry-run` always in the meantime.

## S9 — All Storage world-readable · P2 · *unchanged*

`match /{allPaths=**} { allow read: if true }`. Fine for listings and court photos; a conscious
decision needed for avatars. Changing the rule does not un-publish already-known URLs.

## S10 — No account deletion · P2 · *unchanged*

`allow delete: if false` on all four identity collections, no `deleteAccount` callable, no
cascading deletes. A PIPEDA exposure now and a **hard app-store blocker** later (Apple requires
in-app account deletion; Google requires it plus a web route). **Fix:** a callable that anonymises
match history (results survive, identity stripped — deleting matches outright would corrupt other
players' standings), deletes PII docs and Storage prefixes, then the Auth user.

## S11 — Email never verified · P2 · *unchanged*

`AuthContext` auto-marks any signed-in user `isVerified: true`. Accounts can carry addresses their
owners don't control, in a product whose premise is putting players in contact. **Fix:** verify
properly (gating only trust-requiring actions), or rename the flag — it currently means "has
signed in".

## S12 — Stale Sheets service-account key ships on deploy · P2 · *unchanged*

`functions/index.js` still loads `service-account-key-gs.json` for the **broken** Sheets sync.
Gitignored, but `firebase deploy --only functions` uploads it anyway. **Fix:** delete the function,
the key file and the `googleapis` dependency; revoke the service account in GCP IAM.

## S13 — No error monitoring · P2 · *unchanged*

The codebase's deliberate error-swallowing patterns (individual contact `.catch()`es, the RR-draft
`null` on snapshot error, best-effort bonus commits, `useTasks` never retrying) are all defensible
UI decisions — and all invisible without a monitor. **B1 went unnoticed precisely this way.**
**Fix:** Sentry + a Cloud Monitoring alert on Function error rate; report swallowed errors even
when hiding them from users.

## S14 — Hand-synced duplication across runtimes · P3 · *worse*

Now **four** twin-pairs that silently diverge if edited alone:

1. `computeMatchPoints` (`useTournament.ts`) ↔ `computeGroupStandings` (`rrGeneration.ts`) — RR 3/1
   scoring, deliberately no walkover branch.
2. `scripts/regroup-rr.js` ↔ the pure helpers in `rrGeneration.ts`/`utils.ts`.
3. **New:** `functions/lib/points.js` ↔ `src/features/tasks/taskCatalog.ts` (tier catalogue), and
   `earnedRsPoints` ↔ `taskPoints()` in `useTasks.ts`. A tier edited on one side only means the
   client shows one balance and `rewards.js` enforces another.
4. `pairId()` in `functions/connections.js` ↔ `firestore.rules` — divergence breaks every contact
   read, presenting as a permissions bug.

Each pair is commented on both sides (good). Every points/tier/grouping change must touch both
sides in the same commit; longer-term, extract shared modules where the runtimes allow.

## B1 — `rr_drafts` unreachable · P1 · *documented, not fixed*

Unchanged from the last audit and now **acknowledged in CLAUDE.md's security-rules section** —
but `firestore.rules:434` still declares top-level `match /rr_drafts/{id}` while
`useTournament.ts:709` (and three write sites) use the `events/{eventId}/rr_drafts/{drawKey}`
**subcollection**. Rules don't cascade; every draft read/write is denied; the snapshot error path
silently nulls the draft.

**Fix:**

```
match /events/{eventId}/rr_drafts/{drawKey} {
  allow read: if isAuthenticated();
  allow write: if isAuthenticated() && isCreatorOfEvent(eventId);
}
```

Delete the dead top-level block, deploy, and verify a creator's group edit actually persists.
**Caveat:** check the deployed rules first — if the console already has the nested rule, this is
repo drift, which is worth knowing in itself.

## ✔ Improvement worth recording

`rewards.js` was reworked so a player's **redeemable balance is computed server-side**
(`earnedRsPoints` in `lib/points.js`) instead of trusting anything client-supplied, and every
redemption/coupon/group-lesson mutation remains a callable with client writes blocked in rules.
This is the correct architecture for anything money-adjacent — extend this pattern to future
privileged actions (see the admin-views warning in Part 4 of the handover).

---

# Part 2 — Mobile-App Readiness

## Where you are today

A **responsive mobile web app** — a good one — but not an installable PWA and not a native app.
Nothing in this section changed materially since the last audit.

### Working in your favour

- App-shaped UI: `BottomNav`, FAB, sheets, segmented controls.
- Safe-area handling (`env(safe-area-inset-bottom)` in `BottomNav.tsx`, `Fab.tsx`).
- Correct viewport meta; pre-paint themed splash with light/dark handled before first paint.
- Route-level code splitting; the heavy map isolated to `/courts`.
- **Geolocation already shipped** (check-ins with a 400 m radius enforced in rules).
- **Sign in with Apple already implemented** — an Apple requirement for iOS apps offering
  third-party login, usually a late-stage blocker, already cleared.

### Gaps, in impact order

| # | Gap | Impact |
|---|---|---|
| M1 | **No web app manifest** | Not installable — the single line between "website" and "app" |
| M2 | **No service worker** | Nothing works offline — at a tennis court with poor signal, a real scenario |
| M3 | **No push notifications** (no FCM, no SW) | Challenges/invitations can't reach a player who isn't in the app; email via Resend is the only out-of-app channel |
| M4 | **No account deletion** (S10) | **Hard blocker** for both stores |
| M5 | Bundle weight (map 1.05 MB, firebase 0.8 MB, react 0.56 MB raw) | Slow first load on mobile data; vendor chunks already help repeat visits |
| M6 | One `Logo.png` as favicon + touch icon; no sizes, no maskable variant | Poor home-screen icon quality |
| M7 | No `theme-color` meta | Browser chrome doesn't match the app |
| M8 | No offline/error empty-states for failed reads | Blank sections on flaky connections |
| M9 | No store assets (privacy labels, data-safety form, screenshots) | Needed pre-submission; answers depend on Part 1 decisions |

### The cheapest meaningful step

M1 + M6 + M7 ≈ **half a day** → an installable PWA. M2 via `vite-plugin-pwa` ≈ another day → offline
shell. No store account, no review cycle, no new codebase. **Do this before any native decision** —
the install/usage data it produces is the evidence the native decision needs.

### What native would actually buy

1. **Reliable push on iOS** (web push exists on iOS but requires the PWA installed first, and is
   the weak spot; Android web push is fine).
2. Store presence — discovery and legitimacy.
3. Background location (passive check-ins), if ever wanted.
4. Smoother camera flows for photo reports.

If none of those four justifies a second platform's permanent cost, native isn't needed yet.

---

# Part 3 — Prioritised Action Plan

### This week (P0)

1. **`git push`** — main is 3 commits ahead; until pushed, GitHub is missing most of the current
   system.
2. **Diff deployed rules (Firestore + Storage) against the repo.**
3. **Enable PITR + daily Firestore export + Storage versioning.** (S2)
4. **Remove the Gemini `define`; delete and revoke the key.** (S1)
5. **`hasOnly()` whitelist on `users` update; deploy.** (S3)

### This month (P1)

6. **Fix the `rr_drafts` rule** (nested path); verify a draft write lands. (B1)
7. **App Check** — monitor, then enforce. (S6)
8. **Anonymous court reports → `pending` + review.** (S4)
9. **Mailing list double opt-in.** (S5)
10. **Custom-claim admin + second admin account.** (S7)
11. **Emulator Suite for local dev.** (S8)
12. **CI: lint on PRs + branch protection on `main`.**
13. **Sentry + Function error-rate alert.** (S13)
14. **Delete the Sheets sync, its key, and `googleapis`; revoke the service account.** (S12)

### This quarter (P2)

15. **Account-deletion callable** (anonymise history, delete PII, Storage prefixes, Auth user). (S10)
16. **Per-prefix Storage read rules** — decide on avatars. (S9)
17. **Resolve `isVerified`** — verify or rename. (S11)
18. **PWA baseline** — manifest, icon set, `theme-color`, service worker. (M1/M2/M6/M7)
19. **DR runbook + tested restore.**
20. **Build the role views** (player overview / admin / creator / provider) with a matching rules
    clause or callable for **every** privileged action — the toggle renders, the rules decide.
21. **Smoke tests** for score submission and draw generation (both zone paths).

### Ongoing (P3)

22. Keep the four duplication pairs in sync — every points/tier/grouping change touches both sides
    in one commit. (S14)
23. Split `useTournament.ts` only when a change forces it.
24. Open GitHub Issues; start logging user reports.

---

# Part 4 — Tech-Stack Decision Guide

## Two separate questions

- **A: How do users get the app on their phone?** (web → PWA → Capacitor → native)
- **B: Does the backend stay on Firebase?**

They are independent. B has a clear default; answer it first.

## B — stay on Firebase

Nothing in this codebase argues for migration. Firestore's model fits the access patterns (live
subscriptions to draws/matches); Blaze scales far past current size; 45 functions + a substantial
rules file are real accumulated investment. The one structural weakness — rules-as-API — is being
fixed *within* Firebase: `rewards.js` moving balance computation server-side is exactly the right
pattern, and the planned admin views should follow it (callables for privileged writes).

**Revisit only if:** you need relational reporting/joins, transactional payments across entities,
or Firestore read costs come to dominate the bill. None applies today.

## A — the mobile path

| Option | What | Effort | Ongoing |
|---|---|---|---|
| 1. Responsive web | Today | — | None |
| 2. **PWA** | Manifest + SW on the existing app | 1–2 days | ~Zero |
| 3. **Capacitor** | Native shell around the same React code; real stores, native push | 2–4 weeks | Store listings, reviews, releases |
| 4. React Native / Flutter | Separate native codebase | 3–6 months | A second codebase, forever |

**Insights:**

- **Option 4 is almost certainly wrong here.** One part-time lead, a mature mobile-shaped React
  UI, and no native-performance requirement anywhere in a tennis-league feature set. Everything
  would be built twice, forever.
- **Option 3 is the strong candidate if stores or iOS push become must-haves** — it reuses the code, the
  Firebase SDK, the rules, the functions, and the already-done safe-area/bottom-nav work.
- **Option 2 is correct regardless** — it's a Capacitor prerequisite anyway and produces the
  demand evidence for free.

### Questions to answer before committing

**Demand** — (1) Are members asking, or is this anticipatory? (2) What's the mobile share in GA4 —
check before deciding. (3) Would a home-screen install satisfy the request, or is it specifically
"find it in the App Store"?

**Notifications (usually the real driver)** — (4) Which notification must reach someone *outside*
the app: challenge received, match scheduled, score confirmation? (5) Is Resend email enough for
those? (6) What's the iOS/Android split? Majority-iPhone pushes toward Capacitor.

**Capacity (the decider)** — (7) Is Anuj full-time, part-time or occasional? A store presence is a
subscription, not a launch: OS updates, SDK deprecations, review rejections. (8) Who releases when
he's away? (9) Budget for Apple Developer (annual) + Google Play (one-off)?

**Launch gate** — (10) Account deletion: who builds it, when? (11) Does `/privacy` accurately
describe collection, including check-in geolocation? (12) Is the 400 m location permission explained
in-app at the point of asking? Store review will probe both.

### Recommended sequence

1. **Now:** PWA baseline (1–2 days).
2. **4–8 weeks:** measure installs, offline sessions, and whether "we need an app" requests persist.
3. **In parallel:** account deletion + App Check (required for any store route; worthwhile
   regardless).
4. **Then decide:** iOS push blocking → Capacitor; healthy installs and quiet users → you already
   shipped the app.

## Where the real risk is

Not the stack. React 19 + Vite + Tailwind v4 + Firebase is current, coherent and well-suited. The
risk is **operational**: one environment, no backups, no CI, no tests, no monitoring, one laptop
holding every credential, and now three unpushed commits standing between GitHub and reality. A new
lead's first month is worth far more spent on Part 3's P0/P1 items than on any stack change.
