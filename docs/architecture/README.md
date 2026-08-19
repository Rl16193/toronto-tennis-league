# Architecture evidence

This directory is the code-derived architecture record for Racquets & Strings. It describes the checkout at source baseline `29690a3812a1391bf5a471b7efa7dc41d610c146` (the `dev-anuj` application tip) and distinguishes current behavior from target safety improvements.

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

## Diagram index

The diagrams are intentionally plain Markdown with Mermaid blocks so they render directly in GitHub, code review, and Markdown viewers without opening separate HTML/SVG files.

| Diagram | Markdown |
| --- | --- |
| Current system architecture | [Open Markdown diagram](diagrams/current-system-architecture.md) |
| Target safe delivery architecture | [Open Markdown diagram](diagrams/target-safe-delivery-architecture.md) |
| Firestore data model | [Open Markdown diagram](diagrams/firestore-data-model.md) |
| Core data flow | [Open Markdown diagram](diagrams/core-data-flow.md) |
| Authorization boundaries | [Open Markdown diagram](diagrams/authorization-boundaries.md) |
| Current vs target modernization | [Open Markdown diagram](diagrams/modernization-before-after.md) |

## Evidence convention

Every document states current state, target state, evidence, risks, open questions, and the last verified source SHA. Claims about deployed Firebase state, physical devices, staging, backups, and production are intentionally left as unverified until exact evidence is available.
