# Founder Delivery Index

Single reference for the durable work delivered on the
[`dev-anuj`](https://github.com/tbtctennis/Racquets-And-Strings/tree/dev-anuj) development branch.
Update this file whenever a founder-relevant document, diagram, safety boundary, validation gate,
or major implementation entry point is added, renamed, or retired.

- **Last reviewed:** 2026-08-19
- **Delivery baseline:** `e960dae493b41326406fea5b2baace040d3f4631`
- **Delivery scale represented here:** 48 issue-sized commits and 195 changed first-party paths,
  including this index
- **Status:** Development delivery is on `dev-anuj`. Repository-local PASS remains gated on a clean
  full verification run and four independent approvals of the same final commit.

## Start here

| Founder question                           | Open this file                                                             | What it explains                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| What was delivered and what is still open? | [Takeover stabilization log](engineering/TAKEOVER_STABILIZATION_LOG.md)    | Chronological delivery evidence, validation history, safety boundaries, and external gates.  |
| How is the system organized?               | [Architecture index](architecture/README.md)                               | The map for architecture, data, authorization, environments, and diagrams.                   |
| What are the main security controls?       | [Security baseline](engineering/SECURITY_BASELINE.md)                      | Source-level controls, verified boundaries, known limitations, and staging/production gates. |
| Can a new engineer run this safely?        | [Local development guide](engineering/LOCAL_DEVELOPMENT.md)                | Install, emulator, synthetic-data, test, browser, port-conflict, and safety workflow.        |
| What can and cannot be deployed?           | [Environments and deployment](architecture/ENVIRONMENTS_AND_DEPLOYMENT.md) | Local, source-review, staging, and production evidence are kept distinct.                    |

## Visual architecture library

All diagrams are editable Mermaid Markdown and render directly on GitHub.

| Diagram                                                                                         | Founder use                                                                                     |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Current system architecture](architecture/diagrams/current-system-architecture.md)             | See the application, Firebase services, Functions, and external-service boundaries in one view. |
| [Core data flow](architecture/diagrams/core-data-flow.md)                                       | Follow important information from the browser through authorization and server processing.      |
| [Authorization boundaries](architecture/diagrams/authorization-boundaries.md)                   | Understand member, event-manager, administrator, and server responsibilities.                   |
| [Firestore data model](architecture/diagrams/firestore-data-model.md)                           | See the major data groups and relationships without reading source code.                        |
| [Modernization before and after](architecture/diagrams/modernization-before-after.md)           | Compare the earlier coupled design with the maintainable boundary-based design.                 |
| [Target safe-delivery architecture](architecture/diagrams/target-safe-delivery-architecture.md) | See the intended local-to-staging-to-production approval path.                                  |

## Architecture and product decisions

| File                                                                       | Decision or evidence                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [System architecture](architecture/SYSTEM_ARCHITECTURE.md)                 | Current application structure, runtime services, and ownership boundaries.             |
| [Data flow](architecture/DATA_FLOW.md)                                     | Trusted and untrusted data paths, including server-authoritative tournament results.   |
| [Data model](architecture/DATA_MODEL.md)                                   | Important collections, projections, and ownership relationships.                       |
| [Authorization model](architecture/AUTHORIZATION_MODEL.md)                 | Who may read or change each sensitive product area.                                    |
| [Role authorization ADR](architecture/ADR-001-role-authorization-model.md) | Records the decision that `event_creator` is event-scoped, not a global administrator. |
| [Environment isolation ADR](architecture/ADR-002-environment-isolation.md) | Records why production is never the default development target.                        |
| [Firestore schema assessment](architecture/FIRESTORE_SCHEMA_ASSESSMENT.md) | Data-shape risks, compatibility boundaries, and migration implications.                |
| [Mobile path recommendation](architecture/MOBILE_PATH_RECOMMENDATION.md)   | Product and engineering considerations for a future mobile surface.                    |

## Product and business rules

| File                                               | Business rule captured                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| [Tournament rules](domain/TOURNAMENT_RULES.md)     | Tournament formats, participants, draws, and operational behavior.     |
| [Scoring and points](domain/SCORING_AND_POINTS.md) | Established points, scoring, walkover, and no-show semantics.          |
| [Round Robin rules](domain/ROUND_ROBIN_RULES.md)   | Group formation, standings, progression, and safe redraw behavior.     |
| [Rewards rules](domain/REWARDS_RULES.md)           | Reward earning, redemption, cancellation, refund, and authority rules. |
| [Contact privacy](domain/CONTACT_PRIVACY.md)       | When contact information may be exposed and to whom.                   |

## Engineering quality and onboarding

| File                                                  | What it proves or supports                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Maintainability](engineering/MAINTAINABILITY.md)     | Strict TypeScript, smaller domain/service modules, normalization, and remaining cleanup. |
| [Security baseline](engineering/SECURITY_BASELINE.md) | Repository-local security evidence and unresolved external verification.                 |
| [Local development](engineering/LOCAL_DEVELOPMENT.md) | One safe setup-to-browser-test walkthrough using synthetic local data.                   |
| [Agent skills](engineering/AGENT_SKILLS.md)           | Approved specialist workflows for future engineering sessions.                           |
| [Repository README](../README.md)                     | Main developer entry point, commands, safety warnings, and documentation routing.        |

## Operational and recovery references

| File                                                                       | Operational purpose                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Firestore backup and recovery](runbooks/FIRESTORE_BACKUP_AND_RECOVERY.md) | Recovery expectations, evidence limits, rollback thinking, and non-production rehearsal requirements. |
| [Resend domain verification](runbooks/RESEND_DOMAIN_VERIFICATION.md)       | External email-provider and DNS steps that remain approval-gated.                                     |

## Major implementation entry points

These are the small set of source files a founder can give to an engineer when asking how the
highest-risk workflows were implemented.

| Business capability         | Primary files                                                                                                                                                                                                                                                            | Outcome                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Tournament result authority | [`functions/tournamentResults.js`](../functions/tournamentResults.js), [`functions/lib/tournamentResult.js`](../functions/lib/tournamentResult.js), [`tournamentResultService.ts`](../src/features/tournament/services/tournamentResultService.ts)                       | Results, advancement, points, statistics, and duplicate handling are applied transactionally by the server.      |
| Tournament maintainability  | [`scoreSubmission.ts`](../src/features/tournament/domain/scoreSubmission.ts), [`tournamentPersistence.ts`](../src/features/tournament/services/tournamentPersistence.ts), [`tournamentSubscriptions.ts`](../src/features/tournament/services/tournamentSubscriptions.ts) | Validation, persistence, and subscriptions no longer require understanding the full tournament route.            |
| Firestore trust boundaries  | [`firestoreNormalization.ts`](../src/lib/firestoreNormalization.ts)                                                                                                                                                                                                      | External event, match, participant, profile, preference, contact, and Round Robin data is normalized before use. |
| Signup persistence          | [`profilePersistence.ts`](../src/features/signup/profilePersistence.ts), [`signupProfileDocuments.ts`](../src/features/signup/signupProfileDocuments.ts)                                                                                                                 | Multi-document profile bootstrap is atomic and separated from the signup screen.                                 |
| Rewards and redemptions     | [`functions/rewards.js`](../functions/rewards.js), [`functions/lib/redemptionState.js`](../functions/lib/redemptionState.js), [`functions/lib/redemptionLock.js`](../functions/lib/redemptionLock.js)                                                                    | Balances, duplicate prevention, refund, and cancellation remain server-authoritative.                            |
| Friendly match points       | [`functions/friendlyPoints.js`](../functions/friendlyPoints.js), [`functions/lib/friendlyResult.js`](../functions/lib/friendlyResult.js)                                                                                                                                 | Points require a valid participant result and a genuine confirmation transition.                                 |
| Pre-auth account lookup     | [`functions/accountLookup.js`](../functions/accountLookup.js)                                                                                                                                                                                                            | Deployed lookup requires App Check while local emulator development remains possible.                            |
| Event access                | [`eventRepository.ts`](../src/features/events/services/eventRepository.ts), [`eventService.ts`](../src/features/events/services/eventService.ts)                                                                                                                         | Event and participant access is concentrated behind explicit repository/service boundaries.                      |

## Security and platform enforcement files

| File                                                      | Why it matters                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`firestore.rules`](../firestore.rules)                   | Enforces data access, event scope, private projections, protected statistics, and client intent boundaries. |
| [`storage.rules`](../storage.rules)                       | Enforces public, authenticated, and owner-only storage paths plus type and size limits.                     |
| [`firebase.json`](../firebase.json)                       | Defines emulator and Firebase surfaces; production remains an explicit external gate.                       |
| [`.firebaserc`](../.firebaserc)                           | Makes Firebase project selection visible; no routine production default is introduced.                      |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Runs the same reliable repository verifier in CI without deploying.                                         |
| [`package.json`](../package.json)                         | Holds the canonical install, verify, emulator, Rules, integration, and browser-test commands.               |

## Test and validation evidence

| Coverage area                  | Evidence files                                                                                                                                 |                  Current reliable count |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------: |
| Root domain and boundary tests | [`tests/unit/`](../tests/unit/)                                                                                                                |                                      35 |
| Functions unit tests           | [`functions/test/`](../functions/test/)                                                                                                        |                                      27 |
| Firestore Rules                | [`firestore.rules.test.mjs`](../tests/rules/firestore.rules.test.mjs), [`firestore.matrix.test.mjs`](../tests/rules/firestore.matrix.test.mjs) |                                      29 |
| Storage Rules                  | [`storage.rules.test.mjs`](../tests/rules/storage.rules.test.mjs)                                                                              |                                       5 |
| Functions emulator integration | [`functions.emulator.test.mjs`](../tests/integration/functions.emulator.test.mjs)                                                              |                                      11 |
| Browser journeys               | [`local-emulator.spec.ts`](../tests/e2e/local-emulator.spec.ts)                                                                                |                                       5 |
| Synthetic data                 | [`local-fixtures.mjs`](../tests/fixtures/local-fixtures.mjs)                                                                                   | 4 Auth users and 32 Firestore documents |

The canonical orchestration is [`scripts/verify.mjs`](../scripts/verify.mjs). Emulator launchers use
isolated ports and synthetic project `rands-local`; browser build and result artifacts are isolated
per run.

## Open items and future work

1. Complete one uninterrupted `npm ci`, Functions install, and `npm run verify` on an exact clean
   final commit.
2. Obtain fresh staff-engineering, security, QA, and onboarding approvals on that same commit.
3. Verify App Check, key user journeys, and environment configuration in an approved staging
   project.
4. Rehearse backup and recovery against a non-production copy.
5. Define an explicit consent model before enabling any cross-member preference projection.
6. Triage dependency audit warnings without broad or breaking upgrades.
7. Add bounded server workflows before re-enabling completed-result corrections or manual Round
   Robin bonus operations.

No staging, production, DNS, provider, credential, deployment, or production-data operation is
claimed by this index.

## Update rule for this index

- Keep this as the single founder-facing file inventory.
- Link only durable tracked files available on `dev-anuj`; do not list local-only review artifacts.
- Add a short founder-oriented purpose for every new link.
- Remove or replace links when files are renamed or retired.
- Refresh counts only from current verifier output.
- Never mark a review category PASS unless all four independent reviewers approve the same final
  clean commit.
