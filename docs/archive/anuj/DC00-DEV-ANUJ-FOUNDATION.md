# DC00 — Dev-Anuj foundation evidence

DC00 is the completed foundation program that preceded the formal DC01–DC05 delivery sprints. It
groups the work into auditable workstreams; it does not invent calendar sprints or unrecorded effort.

## Evidence boundary

- Branch: `dev-anuj`
- Inclusive commit window: `4aaf515^..21ddf73`
- First included commit: `4aaf515` on 2026-08-18 at 17:12 EDT
- Last included commit: `21ddf73` on 2026-08-25 at 14:51 EDT
- GitHub comparison:
  [`08d60cd...21ddf73`](https://github.com/tbtctennis/Racquets-And-Strings/compare/08d60cd60fb3b7f0ea8f499865e43e421f9878ca...21ddf73bb49ead5c6bd6e0213a15d19d8921a855)

## Reconciled scale

| Metric                 |    DC00 | Average DC01–DC05 | DC00 / later average |
| ---------------------- | ------: | ----------------: | -------------------: |
| Verified Git commits   |     121 |               3.2 |                37.8× |
| Changed-path footprint |   1,727 |              41.4 |                41.7× |
| First-party line churn |  38,530 |           1,510.6 |                25.5× |
| Total line churn       | 444,481 |           1,510.6 |               294.2× |

The total-churn figure includes the 1,351-path agent/tooling package with 380,105 additions, the
legacy `.claude` cleanup, and `package-lock.json`. The first-party metric excludes those three
categories and is the safer product-engineering comparison. The evidence therefore supports a
37.8-sprint commit-volume equivalent and a 25.5-sprint first-party-churn equivalent; it does not
support presenting one unqualified “50 sprints” claim.

## Completed workstreams

| Task ID | Source reference   | Completed workstream                                  | Evidence outcome                                                                                    |
| ------- | ------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| TSK0031 | `4aaf515`          | Profile zones and draw exports                        | Added zone selection, live-draw unplaced visibility, and per-round downloads.                       |
| TSK0032 | `4ac9562..345f382` | Repository and Codex operating system                 | Removed generated/legacy assistant artifacts and installed durable project instructions and skills. |
| TSK0033 | `5057d5e..dee7203` | Architecture, security, and takeover mapping          | Recorded current-state architecture, trust boundaries, onboarding, and stabilization evidence.      |
| TSK0034 | `196e22f..e84d0f6` | Firebase emulator and safe CI isolation               | Added explicit local isolation, project guards, validation workflow, and Java-backed Rules CI.      |
| TSK0035 | `230a291..ffd2f87` | Authorization Rules harness                           | Added synthetic fixtures and critical Firestore authorization coverage.                             |
| TSK0036 | `0e4d311..846dee9` | Storage and non-production email safety               | Narrowed Storage reads and prevented unsafe non-production email delivery.                          |
| TSK0037 | `8f85777..ca41ca3` | Functions validation and domain tests                 | Centralized callable validation and expanded Functions, domain, and Rules coverage.                 |
| TSK0038 | `6dc575f..2eb1993` | Tournament, event, match, and model boundaries        | Extracted scoring primitives, repositories, weekly-pool state, signup rules, and shared models.     |
| TSK0039 | `1391d07..52218fe` | Strict quality, migration, and environment gates      | Pinned tools and enforced type, lint, format, emulator, migration, and project checks.              |
| TSK0040 | `8dbd926..6ac2b3c` | Reward, result, payout, and migration safety          | Enforced legal transitions, protected outcomes, and retry-safe payouts.                             |
| TSK0041 | `1cfb0b8..794d77a` | Firestore normalization and signup persistence        | Normalized document reads and extracted signup persistence from the screen.                         |
| TSK0042 | `04308d5..1dcd54b` | Functions integration and Rules matrices              | Proved callable/emulator behavior and expanded authorization-boundary tests.                        |
| TSK0043 | `cb0d2f4..5e67fd4` | Server-authoritative tournament results               | Applied results transactionally and removed client-controlled reversal/submission paths.            |
| TSK0044 | `6a65c3a..8489100` | Deterministic browser smoke infrastructure            | Isolated ports, awaited callable readiness, and verified the Hosting boundary.                      |
| TSK0045 | `2e37b1a..335cb04` | Rewards, workflows, profiles, and advancement         | Separated reward authority and closed workflow/profile/advancement gaps.                            |
| TSK0046 | `50791ea..3c939b0` | Critical end-to-end journeys                          | Covered signup, join, scoring, advancement, and browser review evidence.                            |
| TSK0047 | `00cda6f..787cb72` | Contact, signup, schedule, draw, and stats boundaries | Protected contact projections and constrained schedule, stats, draw, and trust paths.               |
| TSK0048 | `d533357..3f40773` | Engineering and founder handoff                       | Added the development handoff, founder index, technical overview, and structure comparison.         |
| TSK0049 | `1d1659d..9c81f00` | Role and workflow conflict remediation                | Aligned OAuth, offers, round robin, task review, lessons, ambassador claims, and contact privacy.   |
| TSK0050 | `e460ce1..21ddf73` | Planning and source reconciliation                    | Produced the five-sprint plan and linked every ruling to source evidence.                           |

## Closed defect families

The delivery workbook assigns `BUG0020`–`BUG0034` to 15 completed defect families covering stats
ownership, provider-role elevation, Storage access, email safety, reward transitions, operational
guards, raw Firestore reads, signup persistence, event authority, client result paths, official
match/reward authority, workflow state, profile/contact/signup trust, browser determinism, and the
August 23 role/workflow conflicts.

## Validation evidence

The workbook records `VAL0030`–`VAL0044`: Git reconciliation, first-party scope reconciliation,
root and Functions unit coverage, Firestore and Storage Rules matrices, Functions emulator
integration, browser smoke, critical end-to-end journeys, static gates, and documentation evidence.
Current verifier attention, same-SHA reviews, staging, recovery, providers, deployment, and
production remain explicit backlog or external gates; no PASS or production claim is inferred.

Open work is maintained only in the [master backlog](../../BACKLOG.md), with future product work in
the [future-work register](../../FUTURE-WORK.md).
