# Target safe delivery architecture

The safe path makes environment selection explicit and puts evidence gates between local development, staging, and production.

```mermaid
flowchart LR
    developer["Developer"] --> local["Local emulator suite<br/>Auth · Firestore · Storage · Functions · Hosting"]
    local --> checks["Validation gates<br/>typecheck · build · rules tests · review"]
    checks --> staging["Dedicated staging Firebase project"]
    staging --> smoke["Staging smoke test<br/>seeded non-production data"]
    smoke --> approval["Explicit release approval"]
    approval --> production["Production Firebase project<br/>toronto-tennis-league"]

    guard["Deployment guard<br/>explicit project ID"] -. protects .-> staging
    guard -. protects .-> production
    evidence["Evidence record<br/>commit · checks · environment"] -. accompanies .-> approval

    classDef localNode fill:#eff6ff,stroke:#2563eb,color:#172554
    classDef gateNode fill:#fff7ed,stroke:#c2410c,color:#431407
    classDef stageNode fill:#f0fdf4,stroke:#15803d,color:#14532d
    classDef prodNode fill:#fef2f2,stroke:#b91c1c,color:#450a0a
    class developer,local localNode
    class checks,guard,evidence gateNode
    class staging,smoke stageNode
    class approval,production prodNode
```

The production project is intentionally shown as a distinct final destination. A Hosting preview channel alone does not create a separate database, Functions runtime, or Storage environment.
