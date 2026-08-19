# Architecture evidence

This directory is the code-derived architecture record for Racquets & Strings. It describes the
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
