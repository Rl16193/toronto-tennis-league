# Modernization before and after

The target preserves the product topology while making environments, authority, and evidence explicit.

```mermaid
flowchart LR
    subgraph current["Current checkout"]
        currentProject["One default Firebase project"]
        clientWrites["Some client-side score / stats writes"]
        broadRole["Global event-creator flag<br/>plus hardcoded UID"]
        manualChecks["Manual local validation"]
        currentProject --> clientWrites
        clientWrites --> broadRole
        broadRole --> manualChecks
    end

    current --> target

    subgraph target["Target controlled delivery"]
        environments["Explicit local / staging / production projects"]
        serverScore["One server-authoritative scoring path"]
        scopedRoles["Server-managed roles<br/>with resource scope"]
        evidence["Rules tests · CI · smoke evidence"]
        environments --> serverScore
        serverScore --> scopedRoles
        scopedRoles --> evidence
    end

    classDef currentNode fill:#fff7ed,stroke:#c2410c,color:#431407
    classDef targetNode fill:#f0fdf4,stroke:#15803d,color:#14532d
    class currentProject,clientWrites,broadRole,manualChecks currentNode
    class environments,serverScore,scopedRoles,evidence targetNode
```

This is a delivery and authorization target, not a claim that staging, complete rules coverage, or production deployment readiness already exists.
