# Authorization and role model

Diagram: [authorization boundaries](diagrams/authorization-boundaries.md).

## Current state

Firebase Auth supplies identity. Firestore Rules are the effective client authorization boundary; React private routes only control navigation. The current elevated check is `isGlobalEventCreator()`, which accepts a hardcoded super-admin UID or `preferences/{uid}.event_creator == true`. Provider-like access is inferred from `preferences.stringer_id` or `preferences.coach_id`; it is not a general role claim system.

## Current permission layers

| Layer | What it proves | What it does not prove |
| --- | --- | --- |
| UI role/view selection | Which experience the user sees | Backend authority or privilege |
| Firebase Auth UID | Which account made the request | Organizer/provider/admin role |
| Ownership checks | The document belongs to the caller | Broader operational authority |
| Connection/listing markers | A specific contact-sharing reason exists | Arbitrary access to other data |
| Firestore Rules | Whether a client read/write is allowed | Admin SDK trigger correctness |
| Callable/trigger Functions | Server-controlled transitions and projections | That the UI will call them correctly |

## Important current controls

- Contacts are not globally readable; access is owner, connected-opponent, organizer, global event creator, or listing-mediated.
- `connections` and `public_contacts` are write-denied to clients.
- `offers`, `redemptions`, `group_lessons`, aggregate stats, ranking history, and notifications creation are server-controlled.
- Match updates use state- and participant-specific field allowlists.
- Storage writes require an owner UID for member paths and image/type/size constraints; anonymous court reports use a fixed anonymous prefix.

## Target role model

Everyone remains a Member. Organizer, Provider, and Admin stack on top of membership and may coexist. The target should use server-managed claims or an equally authoritative role registry, with resource ownership for organizer event scope and explicit provider scope. UI role switching must never grant authority.

## Risks and open questions

- `event_creator` is a broad global privilege and does not yet express “only events I own/create.”
- The hardcoded super-admin UID is operationally brittle and requires a documented bootstrap/recovery process.
- Provider access is inferred from preference fields and is not consistently represented as a role boundary.
- Admin SDK functions bypass Firestore Rules, so trigger/callable authorization and input validation need separate tests.

Last verified source SHA: `ce46599`.
