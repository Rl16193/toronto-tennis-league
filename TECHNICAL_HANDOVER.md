# Technical Handover — Racquets & Strings

**Live site:** https://www.racquetsandstrings.ca
**Prepared for:** Anuj Raja, incoming technical lead
**Prepared by:** Rahul Lal (rahultirath.lal@gmail.com)
**Date:** 2026-08-12 (revision 3 — re-analysis after the zone-draws / Elements / server-side-points commits)

> **Source of truth.** This document describes the **local working tree**. Since revision 2 the
> 189-file backlog was committed (`11ce4c8`, `08d60cd`), but **`main` is still 3 commits ahead of
> GitHub** — nothing after `65bf934` has been pushed. GitHub is missing the zone-based draw engine,
> the Elements refactor, server-side points, Apple sign-in and the notifications overhaul.
> **`git push` before handover.** The remaining dirty files are documentation artifacts only.

Companion documents:
- `Technical_Handover_Anuj_Raja.xlsx` — the same content as a filterable 18-sheet workbook.
- `SECURITY_AND_MOBILE_READINESS.md` — security audit, mobile-app readiness, prioritised fix plan,
  tech-stack decision guide.
- In-repo: **`CLAUDE.md` (the engineering rulebook — read it first)**, `Tournament_Logic_Report.md`,
  `PROVIDER_GUIDE.md`, `DATA_MIGRATION_REPORT.md`, `FILE_MAP.md`, `WORKFLOWS.md`.

No passwords, API keys or secret values appear anywhere in this document — only variable **names**
and where they live. Costs are excluded at the owner's request.

---

## 1. System Overview

A community tennis platform for Toronto. Players find courts, join events and tournaments, play
ranked and casual matches, earn community points, and redeem them against coaching and stringing
offers. Marketing and discovery pages are public; everything player-specific requires sign-in.

| Feature | What it does | Code |
|---|---|---|
| **Events** | Creators publish events; players self-join with skill, division, availability and preferred-zone data | `src/features/events/` |
| **Tournaments** | Knockout brackets (8/16/32, auto-sized) and Round Robin. Score submission and confirmation, seeding, bracket editing, winner advancement, walkovers, byes | `src/pages/tournament/` |
| **Zone-based draws** *(new)* | Draws split by city zone (Downtown-Midtown, North York, Scarborough, Etobicoke-York). Zone geometry built from the Toronto Centreline dataset. Pre-zone groups map onto the default zone. Every destructive draw operation filters on zone | `src/utils/zones.ts`, `useTournament.ts` |
| **Round Robin** | Groups auto-formed by skill band × zone, sized 3–5 via `splitEvenly`. Creator renames/edits/dissolves groups and picks the knockout size (R4/R8/R16); group winners auto-seed. Late joiners accepted **after** generation, placed by an end-of-day script | `rrGeneration.ts`, `scripts/regroup-rr.js` |
| **League Ladder** | Players challenge, report, organizer confirms transactionally. Affects standings and `leaguePoints26` | `src/features/leagues/` |
| **Friendlies** | Non-competitive request/accept sessions. No points, no organizer step | `src/features/friendlies/` |
| **Court Map** | Public map: conditions, check-ins, waiting board/queue, player counts, City programs, court-overlap pills | `src/pages/CourtMap.tsx` |
| **Tasks & Points** | Tiered points for playing, check-ins, photo reports, board updates. Catalogue in `taskCatalog.ts`, **mirrored server-side in `functions/lib/points.js`**. A second engine pays collective bonuses. Claims are organizer-reviewed | `src/features/tasks/`, `functions/taskPoints.js`, `functions/groupAwards.js` |
| **Services** | Coach/stringer offers, browsable logged-out inside Marketplace. Redemptions, coupon lifecycle and group lessons run entirely server-side; redeemable balances computed server-side | `src/pages/services/`, `functions/rewards.js` |
| **Marketplace** | Peer gear listings (rent/sell) with photos. Posting publishes your contact details to buyers | `src/pages/marketplace/` |
| **Leaderboards** | Tournament + community standings; weekly rank snapshot with trend | `functions/rankSnapshot.js` |
| **Notifications** | In-app feed via 14 Firestore triggers + weekly reminders + scheduled prune | `functions/notifications.js` |
| **Contact sharing** | **No in-app messaging** — phone/email/WhatsApp shared only between players actually arranging a game | `functions/connections.js` |

---

## 2. Architecture & Tech Stack

**Frontend:** React 19 + TypeScript ~5.8, Vite 6, `react-router-dom` 7 with route-level code
splitting (`lazyWithRetry`). Tailwind CSS v4 via `@tailwindcss/vite` — **no `tailwind.config.js`**;
tokens live in `src/index.css`, and the app enforces a strict two-tier text-colour system
(`text-fg` / `text-fg/70` — see CLAUDE.md; never add a dimmer tier). Animation `motion/react`;
maps **MapLibre GL** (open source, not Google Maps), the largest chunk, lazy-loaded on `/courts`.

**The `*Elements.tsx` pattern** *(new)*: each page's small presentational parts live in **one**
Elements file — `FooterElements`, `TournamentElements`, `CourtMapElements`, `MarketplaceElements`,
`ServicesElements`, `EventsElements`. Rules: presentation only (props in, callbacks out); Firestore
access stays in hooks/services; large views (`MatchCard`, `BracketView`, `RRGroupCard`, …) stay
separate; `types.ts` files stay out of them.

**Backend:** serverless — **no custom API server**. The client talks to Firestore directly, so
**`firestore.rules` *is* the API boundary**. Privileged logic lives in Cloud Functions: Node 22,
`firebase-functions` v7 (2nd gen), **45 exports across 9 files**, plus `lib/` helpers.

**Server-side points** *(new)*: `functions/lib/points.js` holds the tier catalogue and RS-points
summing, shared by `taskPoints.js` (awards tiers) and `rewards.js` (computes redeemable balances).
It **mirrors `src/features/tasks/taskCatalog.ts` and is kept in sync by hand** — the same
duplication pattern as `scripts/regroup-rr.js` mirroring `rrGeneration.ts`. Every points change
touches both sides.

**Static checking:** `npm run lint` (`tsc --noEmit`). No ESLint, **no automated tests**. This is the
only gate before a deploy.

---

## 3. Hosting & Infrastructure

One Firebase project — **`toronto-tennis-league`**, Blaze plan.

| Component | Where | Notes |
|---|---|---|
| Frontend | Firebase Hosting | Serves `dist/`; SPA rewrite; `/assets/**` immutable 1 year; COOP header for OAuth popups |
| Backend | Cloud Functions 2nd gen | Node 22; region set per-file via a `REGION` constant |
| Database | Cloud Firestore | Rules + indexes deploy **manually** |
| Files | Firebase Storage | `avatars/`, `court_reports/`, `court_suggestions/`, `listings/`; every upload Vision-scanned |
| Auth | Firebase Authentication | Email/password + Google + Apple |
| Analytics | Google Analytics 4 | Router-level `logEvent` |

**Environments: production only.** No staging, no dev project, no emulator config. Local dev and all
14 admin scripts hit **production Firestore**. `index.html` carries a canonical-host guard
redirecting `.web.app`/`.firebaseapp.com` to `www.racquetsandstrings.ca` (preview channels exempt).

---

## 4. Domains & DNS

| Item | Value |
|---|---|
| Live domain | **www.racquetsandstrings.ca** (www canonical) |
| Registrar | **Hostinger** |
| DNS | *To be confirmed* — likely Hostinger |
| Pointing | A/AAAA → Firebase Hosting; Firebase auto-renews SSL off those records |
| Firebase defaults | `toronto-tennis-league.web.app` / `.firebaseapp.com` — always live; the latter is the OAuth domain and cannot be disabled |
| Support email | `tenniscommunity.tbtc@gmail.com` |

Open items: exact DNS records, apex redirect, SPF/DKIM/DMARC for Resend, renewal date.

---

## 5. Code Repositories

One monorepo: **https://github.com/Rl16193/toronto-tennis-league**, branch `main`. No branch
protection, no PR requirement, no CI.

> ⚠️ **`main` is 3 commits ahead of `origin/main`.** Push before handover.

| Path | Contains |
|---|---|
| `src/` | 13 feature folders; pages + per-page Elements modules; `context/`, `lib/`, `utils/` (incl. `zones.ts` zone geometry) |
| `functions/` | 9 JS files, 45 exports; `lib/` (constants, emailTemplates, htmlToText, notify, **points**); `courts.json` |
| `scripts/` | **14 scripts.** Recurring: `regroup-rr.js` (EOD RR placement, `--dry-run`). In build: `build-programs-csv.mjs`. One-off migrations/backfills: `backfill-connections`, `backfill-contacts`, `backfill-doubles-partners`, `backfill-setup-complete`, `backfill-zone-change-requests`, `fix-offer-providers`, `fix-zephyr-doubles`, `geocode-pickleball`, `restore-2025-season`, `seed-rewards` (seeds the Services catalog — **bare** doc ids), `set-stringer`, `snapshot-ranks`. All Admin SDK → **production** |
| `data/` vs `public/` | The ~9 MB City programs export stays in `data/`; the build filters it to `public/programs-tennis.csv`. Everything in `public/` ships verbatim |
| `analysis/` | Local-only, gitignored — PII dumps. Never commit |

---

## 6. Pages & Routes

| Route | Access | What it provides |
|---|---|---|
| `/` | Public | Landing, community stats |
| `/login`, `/signup` | Public | Email+password, Google, Apple; email typo hints; signup pre-check |
| `/events` | Public (join needs login) | Browse/join events |
| `/tournament` | Private | Zone-based draw engine, scoring, group editing, knockouts, player management |
| `/leagues` | Public | Standings and leaderboards only |
| `/matches` | Private | Friendlies / Challenges hub. The three suggestion filters allocate by pool-constraint order — see CLAUDE.md before touching |
| `/tasks` | Private | Tasks, photo submissions, check-ins, claims, points |
| `/courts` | Public | Court map (heaviest route, own vendor chunk) |
| `/marketplace` | Public | Gear listings + the **Services tab**. Deliberately open logged-out so offers are browsable — balance reads 0, nothing redeemable |
| `/profile`, `/players/:userId`, `/history`, `/notifications` | Private | Profile, public player pages, history, feed |
| `/about`, `/how-it-works`, `/terms`, `/privacy`, `/contact` | Public | Static |
| `/friendlies`, `/challenges` → `/matches`; `*` → `/` | — | Redirects |

---

## 7. Database

Cloud Firestore — a NoSQL document store. "Primary key" below means the document ID; "foreign key"
means a field holding another document's ID. **Firestore enforces neither** — they are conventions
held up by code and rules, and **there are no cascading deletes**.

### The central relationship

`users`, `stats`, `preferences` and `contacts` share the **same document ID — the Firebase Auth
UID**. Every other collection points back through a uid-bearing field (`uid`, `player_1_uid`,
`player_2_uid`, `partner_uid`, `creator_id`, `submitted_by`, `reported_by`).

### Collections

| Collection | Primary key | Foreign keys | Written by | Access |
|---|---|---|---|---|
| `users` | uid | — | Signup, profile | **Public read.** Must never carry email/phone |
| `contacts` | uid | doc id → `users` | Signup, profile | PII — owner, organizer, connection, or public-contact holder. Denied reads are **normal** |
| `stats` | uid | doc id → `users` | `useTournament.ts`, `ladderService.ts`, functions | **Public read.** All camelCase. Owner self-edits only `skill_level`, `tournament_preference`, `name`, `uid`, `league` |
| `preferences` | uid | doc id → `users`; `coach_id`/`stringer_id` → provider | Signup, profile, super-admin | **Public read.** `event_creator` settable only by super-admin |
| `events` | auto id | `creator_id` → `users` | Creator form | Public read; creator writes. Carries format, division, skill groups, zones |
| `events/{id}/rr_drafts` | `drawKey` (subcollection) | parent → `events` | `useTournament.ts` | ⚠️ **Broken** — rules declare top-level `/rr_drafts` which never matches. Documented in CLAUDE.md, still unfixed |
| `event_participants` | auto id | `uid` → `users`; `event_id` → `events` | `useJoin.ts` or creator | This doc **routes a player into a draw** — removal must delete it too |
| `matches` | `{eventId}_{drawKey}_{matchId}` (draws); auto id otherwise | `event_id` → `events`; `player_*_uid`/`partner_uid` → `users`; `match_id` → `matches` | `useTournament.ts`, `ladderService.ts`, `rallyService.ts` | `category`: singles/doubles/rally/challenge/score_submission. Template ids repeat across **zone** draws — advancement must normalize zone and bracket. `completed_at` pinned to first scoring; stamps `rr_group_bonus_v2`, `doubles_partner_pts_v2` |
| `courts` | `{uid}_{suffix}` (check-ins); auto id | `uid` → `users` or `'no_account'`; `court_key` → reference data | check-in/photo services | `type`: check-in/attendance/condition/waiting_board/queue. Anonymous creates self-approve ⚠️. **Immutable** — hence Board Freshness is `onDocumentCreated` |
| `tasks` | uid (progress) / bare id (offers) | doc id → `users`; offers ← `redemptions.reward_id` | `useTasks.ts`, functions; offers seeded by `seed-rewards.mjs` | **Public read.** Offer ids must stay **bare** |
| `task_claims` | auto id | `uid` → `users` | `claimService.ts` | Create self as `pending`; organizer updates |
| `offers` | uid (provider) | doc id → `users` | `rewards.js` only | Owner/organizer read |
| `redemptions` | **the coupon code** | `uid` → `users`; `reward_id` → `tasks/{id}`; `stringer_id`/`coach_id` → provider | `rewards.js` only | Owner, organizer, or owning provider |
| `group_lessons` | month | roster → `users` | `rewards.js` | Public read |
| `listings` | auto id | `uid` → `users` | `listingService.ts` | Public read; owner writes |
| `connections` | `{uidA}__{uidB}` sorted | both halves → `users` | `connections.js` **only** | The two members only. `pairId()` twins in functions + rules must stay identical |
| `public_contacts` | uid | doc id → `users` | `connections.js` **only** | Signed-in read |
| `notifications` | auto id | `uid` → `users` | `notifications.js` **only** | Recipient only |
| `ranking_history/{uid}/entries` | auto id (subcoll.) | parent → `users` | `rankSnapshot.js` | Public read |
| `mailing_list` | auto id | — | Public form | ⚠️ Unauthenticated create, no rate limit |
| `site_stats` | named singletons | keys = **raw** `preferred_courts` strings | `courtCounts.js` | Public read |
| `_archive_database_consolidation` | `{source}/docs/{id}` | mirrors originals | Migration | Admin SDK only |

**Retired — do not reintroduce:** `tournament_matches`, `court_visits`, `court_attendance`,
`court_reports`, `court_suggestions`, `rallies`, `ladder_challenges`, `score_submissions`,
`task_progress`, `redeemable`, `rewards`, `group_awards`, `zone_sweeps`.

---

## 8. Cloud Functions

45 exports, 9 files, Node 22, 2nd gen.

| File | Exports | Type | Purpose |
|---|---|---|---|
| `accountLookup.js` | `checkSignupEmail` | Callable | Email-already-registered pre-check |
| `connections.js` | `onMatchConnection`, `onListingContact` | Triggers | Writes `connections/{pairId}` on **accepted** rallies/challenges and fixtures; maintains `public_contacts`. Open requests earn nothing (anti-harvesting) |
| `courtCounts.js` | `aggregateCourtCounts` | Scheduled 6h | Rebuilds `site_stats/court_counts` |
| `groupAwards.js` | 5 triggers | Triggers | Collective bonuses. Matchday query bounded ±36h (was quadratic). Board Freshness is `onDocumentCreated` — reports auto-approve and rules forbid updates, so the old update-trigger never fired |
| `index.js` | `moderateUploadedImage`, `sendWelcomeEmail`, `syncFirestoreAndSheets` | Storage trig / trig / sched | Vision SafeSearch on every upload; Resend welcome; **broken** Sheets sync |
| `notifications.js` | 14 triggers + 2 scheduled | — | The feed, weekly reminders, prune |
| `rankSnapshot.js` | `weeklyRankSnapshot` | Scheduled | `rankPosition`/`rankTrend` + history |
| `rewards.js` | 7 callables | Callable | All redemption logic server-side; **reworked (+421 lines)** — redeemable balance computed via `lib/points.js` (`earnedRsPoints`, the exact server twin of `taskPoints()` in `useTasks.ts`) |
| `taskPoints.js` | 7 triggers | Triggers | Per-player tiers/points from the shared catalogue |

---

## 9. Authentication, Users & Roles

**Firebase Authentication** — email/password, Google, Apple. Email verification was **removed**;
`AuthContext` auto-marks signed-in users `isVerified: true` (also fires the welcome email — both
flags idempotent).

**OAuth lives in one hook** (`useOAuthSignIn.ts`): popup → redirect fallback, `getRedirectResult`
mount effect, profile bootstrap, credential-linking hand-off. Google/Apple are thin wrappers. **Add
providers by adding a wrapper**; both wrappers filter `getRedirectResult` on `providerId` — don't
simplify that away.

| Role | Set by | Powers |
|---|---|---|
| Player | default | Join, play, score, tasks, listings, redemptions |
| Creator/Organizer | `preferences.event_creator` (super-admin only) | Events, draws, players, confirmations, claims, mailing list |
| Per-event creator | `events.creator_id` | Same, scoped to one event |
| Super admin | hard-coded UID in rules | The only account that can grant creator status |
| Provider | `preferences.coach_id`/`stringer_id` (via `set-stringer.mjs`) | Reads own redemptions (`isProviderFor`). No dashboard yet — see `PROVIDER_GUIDE.md` |

**Participant draw visibility:** a participant sees the draw they are **actually placed in**
(`userDraw` scans generated matches for their uid) — deliberately not routed by skill. Pre-generation
it is `undefined` and they see every draw; that's intended.

**Contact visibility:** `contacts/{uid}` readable by owner, organizer, connection holder, or
public-contact holder. **A denied read is normal** — `.catch()` each read individually, never one
`Promise.all()` over the batch.

**Permissions are enforced in `firestore.rules`, not the UI.** Rules deploy manually and
separately — the deployed copy may differ from the repo file; diff against the Console first.

---

## 10. External Services

| Service | Status |
|---|---|
| Firebase (all products) | Live, Blaze |
| Google Analytics 4 | Live |
| Resend (transactional email) | Live — sending-domain verification *to confirm* |
| Google Cloud Vision (SafeSearch) | Live |
| Google Sheets sync | **Broken, unused** — still deployed, still ships a service-account key |
| Google Gemini | ⚠️ Key in the public bundle, **zero consumers** — remove and revoke |
| MapLibre | Live — confirm tile source |
| City of Toronto data | Programs CSV (manual refresh) + Centreline (zone geometry) |
| Apple Developer Program | *Confirm account + renewal* |
| Payments | **None** |
| Push notifications | **None** (no FCM, no service worker) |
| Error monitoring | **None** |

---

## 11. Deployment

```bash
npm run lint
```

```bash
npm run hosting:deploy
```

```bash
firebase deploy --only firestore:rules
```

```bash
firebase deploy --only storage
```

```bash
firebase deploy --only functions
```

Rules **do not ship** with git pushes or hosting deploys. `storage.rules` deploys **replace** the
console copy. There is **no CI/CD** — every deploy is manual from one laptop. Hosting rollback is
one click, **code only**; data has no rollback because there are no backups.

Recurring op: `npm run regroup:rr` (RR late-joiner placement, Admin SDK). **Always `--dry-run`
first** — it writes production.

> **First task at handover:** diff local `firestore.rules` and `storage.rules` against the deployed
> copies in the Console.

---

## 12. Environment & Configuration

Names only.

| Variable | Sensitivity |
|---|---|
| `VITE_FIREBASE_*` (7 vars) | Public by design — identifiers, not secrets |
| `APP_URL` | Confirm it's the live domain, not localhost |
| `GEMINI_API_KEY` | ⚠️ **Exposed in the client bundle, unused.** Remove + revoke |
| Resend API key | Sensitive — *locate at handover* |
| `serviceAccount.json` | **Highly sensitive** — bypasses all rules. Mint new, revoke old |
| `functions/service-account-key-gs.json` | Sensitive — uploaded with every functions deploy; delete with the broken sync |

Everything lives in **one `.env` on one laptop** — no vault, no CI variables. Move to a password
manager at handover.

---

## 13. Admin & Operations

**Today:** Firebase Console (de-facto admin tool, unguarded), the in-app creator UI
(`event_creator` flag), and 14 manual Admin SDK scripts. **No in-app admin dashboard.**

**Agreed target model** — four views switched by a **toggle in the same session, no separate
login**, driven by role flags on `preferences`:

| View | State |
|---|---|
| Player | Baseline — exists |
| Player overview | To build — owner-facing roster |
| Admin (owner) | To build — users, registrations, redemptions, moderation |
| Creator | Partly exists — formalise `event_creator` powers |
| Provider | Half-built — `coach_id`/`stringer_id` + `isProviderFor()` work; dashboard missing |

> ⚠️ **The toggle only changes what is rendered — it grants nothing.** Every privileged action must
> also be enforced in `firestore.rules` or a callable, or a devtools user bypasses the UI entirely.
> (Now also recorded in CLAUDE.md.)

---

## 14. Known Issues & Technical Debt

Full audit in `SECURITY_AND_MOBILE_READINESS.md`. Headlines:

- **Confirmed bug:** `rr_drafts` subcollection unreachable — rules declare it top-level. Now
  documented in CLAUDE.md, **still unfixed in the rules file**.
- **Security:** Gemini key in the bundle; `users` world-readable with a blacklist not a whitelist;
  unauthenticated self-approving court reports; open mailing list; no App Check; hard-coded super
  admin; world-readable Storage.
- **Infrastructure:** no backups, one environment, no CI, no tests, no monitoring, unpushed commits,
  one-laptop dependency.
- **Maintainability:** `useTournament.ts` ~2000 lines and growing; **three hand-synced duplication
  pairs** — `computeMatchPoints`↔`computeGroupStandings`, `regroup-rr.js`↔`rrGeneration.ts`, and
  *(new)* `functions/lib/points.js`↔`taskCatalog.ts` — plus `pairId()` twinned across
  functions and rules.
- **Correctness invariants** (all previously bitten, all documented with reasoning in CLAUDE.md's
  Defect Notes): transactional challenge confirms; the stamped RR +5 bonus; blank `winner_uid`
  rejection; pinned `completed_at`; zone-filtered destructive operations; zone-normalized winner
  advancement; disabled auto-dedupe; removal purging the whole event + `event_participants` in one
  batch.
- **Data integrity:** no referential integrity, no cascading deletes, no account deletion (also an
  app-store blocker).

---

## 15. Backups & Recovery

| Asset | Backup | Recovery |
|---|---|---|
| Firestore | **None** | Not recoverable |
| Storage | **None** | Not recoverable |
| Auth users | **None** | Not recoverable |
| Source | GitHub + local | Recoverable — but GitHub is 3 commits behind |
| Config | One laptop | Re-derivable / re-mintable |
| Site | Hosting history | One click — **code only** |

Enable scheduled Firestore export + PITR + Storage versioning — **the highest-priority action at
handover** — then write and test a DR runbook.

---

## 16. Costs

Excluded at the owner's request — being prepared separately.

---

## 17. Access Handover Checklist

**Critical:** Google account owning the project (add as **Owner**) · Firebase project · billing
account · GitHub repo · Hostinger · super-admin app account (UID `7Pvfz…`) · `.env` contents (via
password manager) · a **new** `serviceAccount.json` (revoke the old).

**High:** Resend · Apple Developer (annual renewal) · GA4 · support inbox
`tenniscommunity.tbtc@gmail.com`.

**Medium/low:** Instagram · Cloud Vision (covered by project) · Gemini (**revoke**) · the Sheets
sync sheet (only if reviving) · monitoring (none exists).

---

## 18. Architecture Diagram

```
                          ┌───────────────────────────────────────┐
                          │                USERS                  │
                          │  Players · Creators/Organizers ·      │
                          │  Providers (coaches, stringers) ·     │
                          │  Super admin   — browser + mobile web │
                          └────────────────────┬──────────────────┘
                                               │ HTTPS
                                               ▼
                 ┌─────────────────────────────────────────────────────┐
                 │  DOMAIN + DNS                                       │
                 │  www.racquetsandstrings.ca                          │
                 │  Registrar & DNS: Hostinger                         │
                 │  A/AAAA → Firebase Hosting; SSL auto-renewed        │
                 │  .web.app / .firebaseapp.com → JS redirect to www   │
                 └───────────────────────┬─────────────────────────────┘
                                         ▼
                 ┌─────────────────────────────────────────────────────┐
                 │  FRONTEND — Firebase Hosting (global CDN)           │
                 │  React 19 + TypeScript + Vite 6 SPA                 │
                 │  Tailwind v4 · Router 7 · MapLibre · motion         │
                 │  Zone engine (utils/zones.ts) · *Elements modules   │
                 │  Route code-splitting; vendor chunks                │
                 └──┬──────────────┬───────────────┬──────────────────┘
                    │              │               │
       Firebase SDK │   callable   │               │  DIRECT reads/writes
         (auth)     │   functions  │               │  (no server in between)
                    ▼              ▼               ▼
     ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐
     │ FIREBASE AUTH  │  │ CLOUD FUNCTIONS  │  │     CLOUD FIRESTORE      │
     │ email+password │  │ Node 22 · 2nd gen│  │ users · stats ·          │
     │ Google OAuth   │  │ 45 exports       │  │ preferences · contacts   │
     │ Apple OAuth    │  │ 26 triggers      │  │ events (+rr_drafts sub)  │
     │                │  │  8 callables     │  │ event_participants       │
     │ uid is the     │  │  6 scheduled     │  │ matches (zone-aware)     │
     │ universal key: │  │  1 storage trig  │  │ courts · tasks           │
     │ users/stats/   │  │                  │  │ task_claims · offers     │
     │ preferences/   │  │ lib/points.js =  │  │ redemptions · listings   │
     │ contacts all   │  │ server twin of   │  │ group_lessons · notifs   │
     │ share it       │  │ taskCatalog.ts   │  │ connections ·            │
     └───────┬────────┘  └──┬────────────┬──┘  │ public_contacts ·        │
             │              │            │     │ mailing_list ·           │
             └──────────────┘            │     │ ranking_history ·        │
                                         │     │ site_stats               │
                 Admin-SDK writes        │     └────────────┬─────────────┘
                 (14 scripts/, bypass    │                  ▲
                  ALL rules, hit PROD)   │          firestore.rules
                                         │          = THE API BOUNDARY
                                         ▼
                          ┌──────────────────────────────────┐
                          │  FIREBASE STORAGE                │
                          │  avatars/ · court_reports/ ·     │
                          │  court_suggestions/ · listings/  │
                          │  (world-readable by URL)         │
                          └────────────────┬─────────────────┘
                                           │ on upload
                                           ▼
                          ┌──────────────────────────────────┐
                          │ Google Cloud Vision SafeSearch   │
                          └──────────────────────────────────┘

     ┌────────────────────────────────────────────────────────────────┐
     │                    THIRD-PARTY SERVICES                        │
     │  Resend ............ transactional email                       │
     │  Google Analytics 4  page views / analytics                    │
     │  Cloud Vision ...... image safety moderation                   │
     │  MapLibre tiles .... court map rendering                       │
     │  Toronto open data   programs CSV + Centreline (zones)         │
     │  Google Sheets ..... BROKEN / disabled                         │
     │  Payments .......... NONE                                      │
     │  Push notifications  NONE (no FCM, no service worker)          │
     └────────────────────────────────────────────────────────────────┘

     OUT-OF-BAND / MANUAL PATHS  (no automation exists today)
     ─────────────────────────────────────────────────────────
     Developer laptop  (single point of failure)
       ├── npm run lint ............... tsc --noEmit, the ONLY pre-deploy check
       ├── npm run hosting:deploy ..... build + deploy frontend
       ├── firebase deploy --only functions
       ├── firebase deploy --only firestore:rules   ← MANUAL, easy to forget
       ├── firebase deploy --only storage           ← MANUAL, replaces console copy
       ├── node scripts/*  (14 Admin SDK scripts → PRODUCTION; --dry-run first)
       └── Firebase Console ........... manual data edits, user management, logs

     ONE ENVIRONMENT: PRODUCTION.  NO CI/CD.  NO STAGING.  NO BACKUPS.
     main IS 3 COMMITS AHEAD OF GITHUB — PUSH BEFORE HANDOVER.
```
