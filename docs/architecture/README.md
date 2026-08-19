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

The committed visuals use the project-local `diagram-design` skill. Each source is standalone HTML with inline SVG; SVG and PNG are exported companions where the local export toolchain is available.

| Diagram | Source | Export status |
| --- | --- | --- |
| Current system architecture | [HTML](diagrams/current-system-architecture.html) · [SVG](diagrams/current-system-architecture.svg) · [PNG](diagrams/current-system-architecture.png) | Pending first diagram style-gate decision and export |
| Target safe delivery architecture | [HTML](diagrams/target-safe-delivery-architecture.html) · [SVG](diagrams/target-safe-delivery-architecture.svg) · [PNG](diagrams/target-safe-delivery-architecture.png) | Pending style-gate decision and export |
| Firestore data model | [HTML](diagrams/firestore-data-model.html) · [SVG](diagrams/firestore-data-model.svg) · [PNG](diagrams/firestore-data-model.png) | Pending style-gate decision and export |
| Core data flow | [HTML](diagrams/core-data-flow.html) · [SVG](diagrams/core-data-flow.svg) · [PNG](diagrams/core-data-flow.png) | Pending style-gate decision and export |
| Authorization boundaries | [HTML](diagrams/authorization-boundaries.html) · [SVG](diagrams/authorization-boundaries.svg) · [PNG](diagrams/authorization-boundaries.png) | Pending style-gate decision and export |
| Current vs target modernization | [HTML](diagrams/modernization-before-after.html) · [SVG](diagrams/modernization-before-after.svg) · [PNG](diagrams/modernization-before-after.png) | Pending style-gate decision and export |

## Evidence convention

Every document states current state, target state, evidence, risks, open questions, and the last verified source SHA. Claims about deployed Firebase state, physical devices, staging, backups, and production are intentionally left as unverified until exact evidence is available.
