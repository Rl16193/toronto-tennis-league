# Current system architecture

The browser is the product client. Firebase Rules and Functions are the effective backend boundaries; the UI role selection is not an authorization boundary.

```mermaid
flowchart LR
    member["Member / Organizer / Provider / Admin"] --> browser["React SPA<br/>Vite + Firebase Web SDK"]

    subgraph firebase["Firebase project"]
        hosting["Firebase Hosting<br/>dist + SPA fallback"]
        auth["Firebase Auth"]
        firestore["Firestore<br/>Rules enforce client access"]
        storage["Cloud Storage<br/>Rules enforce file access"]
        functions["Cloud Functions<br/>us-central1"]
    end

    browser --> auth
    browser --> firestore
    browser --> storage
    browser --> functions
    hosting --> browser

    subgraph external["External services"]
        analytics["GA4 Analytics"]
        resend["Resend email"]
        sheets["Google Sheets"]
        bigquery["BigQuery"]
    end

    browser -. supported browsers .-> analytics
    functions --> resend
    functions -. scheduled metrics .-> sheets
    functions -. scheduled metrics .-> bigquery

    classDef client fill:#fff7ed,stroke:#c2410c,color:#431407
    classDef firebaseNode fill:#eff6ff,stroke:#2563eb,color:#172554
    classDef externalNode fill:#f0fdf4,stroke:#15803d,color:#14532d
    class browser,member client
    class hosting,auth,firestore,storage,functions firebaseNode
    class analytics,resend,sheets,bigquery externalNode
```

Current evidence: `src/lib/firebase.ts`, `src/App.tsx`, `functions/index.js`, `functions/lib/constants.js`, `firebase.json`, and `.firebaserc`.
