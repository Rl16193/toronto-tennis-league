# Authorization boundaries

Identity, UI role state, Rules, and Functions provide different guarantees. Only the backend controls below should grant privileged authority.

```mermaid
flowchart LR
    subgraph untrusted["Untrusted client"]
        ui["React UI<br/>role/view selection"]
        authToken["Firebase Auth token<br/>identifies UID"]
        ui -. does not grant .-> authToken
    end

    subgraph clientBoundary["Client authorization boundary"]
        rules["Firestore / Storage Rules<br/>ownership · field diffs · privacy"]
        publicData["Allowed public and member data"]
    end

    subgraph privileged["Server-controlled boundary"]
        functions["Callable / trigger Functions<br/>validate transitions and inputs"]
        adminSdk["Admin SDK writes<br/>projections and ledgers"]
        restricted["Restricted data<br/>contacts · rewards · metrics"]
    end

    authToken --> rules
    ui --> rules
    rules --> publicData
    rules --> functions
    functions --> adminSdk
    adminSdk --> restricted

    roleRegistry["Target: server-managed claims<br/>or authoritative role registry"] -. replaces broad preference flags .-> functions
    ownerScope["Target: resource ownership<br/>event and provider scope"] -. narrows .-> rules

    classDef untrustedNode fill:#fff7ed,stroke:#c2410c,color:#431407
    classDef ruleNode fill:#eff6ff,stroke:#2563eb,color:#172554
    classDef serverNode fill:#fef2f2,stroke:#b91c1c,color:#450a0a
    classDef targetNode fill:#f0fdf4,stroke:#15803d,color:#14532d
    class ui,authToken untrustedNode
    class rules,publicData ruleNode
    class functions,adminSdk,restricted serverNode
    class roleRegistry,ownerScope targetNode
```

Current elevated access is `isGlobalEventCreator()`, which combines a hardcoded super-admin UID with `preferences/{uid}.event_creator`. Provider access is inferred from preference fields. These are migration targets, not proof that the UI role is authoritative.
