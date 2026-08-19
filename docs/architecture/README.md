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

The committed visuals use the project-local `diagram-design` skill. Each source is standalone HTML with inline SVG; SVG exports are committed. PNG export is pending because the skill's required Playwright Python package is unavailable in the bundled runtime.

| Diagram | Source | Export status |
| --- | --- | --- |
| Current system architecture | [HTML](diagrams/current-system-architecture.html) · [SVG](diagrams/current-system-architecture.svg) | Complete; PNG blocked by the missing Playwright Python package |
| Target safe delivery architecture | [HTML](diagrams/target-safe-delivery-architecture.html) · [SVG](diagrams/target-safe-delivery-architecture.svg) | Complete; PNG blocked by the same prerequisite |
| Firestore data model | [HTML](diagrams/firestore-data-model.html) · [SVG](diagrams/firestore-data-model.svg) | Complete; PNG blocked by the same prerequisite |
| Core data flow | [HTML](diagrams/core-data-flow.html) · [SVG](diagrams/core-data-flow.svg) | Complete; PNG blocked by the same prerequisite |
| Authorization boundaries | [HTML](diagrams/authorization-boundaries.html) · [SVG](diagrams/authorization-boundaries.svg) | Complete; PNG blocked by the same prerequisite |
| Current vs target modernization | [HTML](diagrams/modernization-before-after.html) · [SVG](diagrams/modernization-before-after.svg) | Complete; PNG blocked by the same prerequisite |

## Evidence convention

Every document states current state, target state, evidence, risks, open questions, and the last verified source SHA. Claims about deployed Firebase state, physical devices, staging, backups, and production are intentionally left as unverified until exact evidence is available. The diagram skin is customized from the live site stylesheet after contrast checks.
