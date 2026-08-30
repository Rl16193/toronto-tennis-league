# Architecture reference

This directory is the active, code-derived architecture record for Racquets & Strings. It describes the
`dev-anuj` checkout and distinguishes current behavior from target safety improvements. The
maintainability dependency map and quality-command contract live in
`docs/engineering/MAINTAINABILITY.md`.

## Reading order

1. [System architecture](SYSTEM_ARCHITECTURE.md)
2. [Data model](DATA_MODEL.md)
3. [Core data flow](DATA_FLOW.md)
4. [Authorization model](AUTHORIZATION_MODEL.md)
5. [Firestore schema assessment](FIRESTORE_SCHEMA_ASSESSMENT.md)
6. [Environments and delivery](ENVIRONMENTS_AND_DEPLOYMENT.md)
7. [Mobile path recommendation](MOBILE_PATH_RECOMMENDATION.md)
8. [ADR-001: role authorization](ADR-001-role-authorization-model.md)
9. [ADR-002: environment isolation](ADR-002-environment-isolation.md)
10. [Maintainability map](../engineering/MAINTAINABILITY.md)
11. [Tournament rules](../domain/TOURNAMENT_RULES.md)
12. [Round Robin rules](../domain/ROUND_ROBIN_RULES.md)
13. [Scoring and points](../domain/SCORING_AND_POINTS.md)
14. [Contact privacy](../domain/CONTACT_PRIVACY.md)
15. [Rewards rules](../domain/REWARDS_RULES.md)
16. [Local development and verification](../engineering/LOCAL_DEVELOPMENT.md)

## Diagram index

The diagrams are intentionally plain Markdown with Mermaid blocks so they render directly in GitHub, code review, and Markdown viewers without opening separate HTML/SVG files.

| Diagram                           | Markdown                                                               |
| --------------------------------- | ---------------------------------------------------------------------- |
| Current system architecture       | [Open Markdown diagram](diagrams/current-system-architecture.md)       |
| Target safe delivery architecture | [Open Markdown diagram](diagrams/target-safe-delivery-architecture.md) |
| Firestore data model              | [Open Markdown diagram](diagrams/firestore-data-model.md)              |
| Core data flow                    | [Open Markdown diagram](diagrams/core-data-flow.md)                    |
| Authorization boundaries          | [Open Markdown diagram](diagrams/authorization-boundaries.md)          |
| Current vs target modernization   | [Open Markdown diagram](diagrams/modernization-before-after.md)        |

## Evidence convention

Every document states current state, target state, evidence, risks, open questions, and the last
verified source SHA where applicable. Claims about deployed Firebase state, physical devices,
staging, backups, and production are intentionally left as unverified until exact evidence is
available.

## Evidence levels

Architecture and review claims use these levels independently:

| Level                 | Evidence this repository can provide                                                                                                     | Claim it cannot provide                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Local verification    | Clean install, static checks, unit tests, emulator Rules/Functions tests, synthetic fixtures, and local browser checks                   | Deployed configuration or production data shape |
| Source-level security | Reviewed Rules, Functions authorization/validation, migration guards, and positive/negative tests at one source SHA                      | That the reviewed source is deployed            |
| Staging verification  | Explicitly identified isolated Firebase project, deployed reviewed source, synthetic/scrubbed data, and recorded smoke/recovery evidence | Production parity without a separate comparison |
| Production deployment | Explicit approval, selected production project, deploy receipt, post-deploy checks, and recovery evidence                                | Inferred success from local or staging PASS     |

A repository-local review may PASS while staging or production remains an external gate. Review
reports must name the source SHA and evidence level instead of collapsing those claims into one
release-readiness statement.
