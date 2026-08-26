# Core data flow

The main flows below show where the browser reads or initiates work and where Functions maintain protected projections.

```mermaid
flowchart TB
    subgraph signup["1 · Signup and profile bootstrap"]
        signupPage["Signup / provider sign-in"] --> lookup["checkSignupEmail"]
        lookup --> authState["AuthContext observes identity"]
        authState --> profile["ensureUserProfileDocuments"]
        profile --> memberDocs["users · stats · preferences · contacts"]
    end

    subgraph eventFlow["2 · Event join, draw, score, advancement"]
        memberReads["Member reads events"] --> join["Create event_participants"]
        join --> draw["Organizer configures event / RR draft"]
        draw --> fixtures["Generate matches"]
        fixtures --> score["Players report score"]
        score --> awards["Functions award points and notify"]
        awards --> ranking["stats and ranking_history projections"]
    end

    subgraph rewardFlow["3 · Tasks, points, rewards, redemption"]
        activity["Task claim / check-in / attendance / report"] --> trigger["Firestore trigger validates activity"]
        trigger --> ledger["Functions write progress and award ledger"]
        ledger --> offer["Client reads offers projection"]
        offer --> redeem["Callable redemption workflow"]
    end

    subgraph listingFlow["4 · Listing and contact reveal"]
        upload["Upload listing image"] --> listing["Create listing document"]
        listing --> moderation["moderateUploadedImage"]
        listing --> marker["Maintain public_contacts marker"]
        marker --> buyer["Signed-in buyer uses listing path"]
        buyer --> protectedContact["Rules protect contacts/{uid}"]
    end

    subgraph notifications["5 · Notifications and email"]
        transition["Protected state transition"] --> inApp["Recipient notification"]
        transition --> emailPrefs["Load opt-out and contact data"]
        emailPrefs --> resend["Resend transactional email"]
    end

    score -. triggers .-> transition
    trigger -. creates .-> transition

    classDef browserNode fill:#fff7ed,stroke:#c2410c,color:#431407
    classDef firebaseNode fill:#eff6ff,stroke:#2563eb,color:#172554
    classDef protectedNode fill:#fef2f2,stroke:#b91c1c,color:#450a0a
    class signupPage,memberReads,activity,upload,buyer browserNode
    class lookup,authState,profile,memberDocs,join,draw,fixtures,score,offer,listing,marker,protectedContact,inApp,emailPrefs firebaseNode
    class awards,ranking,trigger,ledger,redeem,moderation,transition,resend protectedNode
```

The remaining architectural risk is that some tournament score and advancement paths still write stats directly from client code instead of using one server-authoritative scoring path.
