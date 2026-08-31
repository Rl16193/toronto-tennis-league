# Authorization and role model

Diagram: [authorization boundaries](diagrams/authorization-boundaries.md).

## Current state

Firebase Auth supplies identity. Firestore Rules are the effective client authorization boundary; React private routes only control navigation. Event creation remains a compatibility path for `preferences/{uid}.event_creator`; later event mutations require `creator_id`, explicit membership in `organizer_ids`, or the super-admin bootstrap. Provider access is now scoped to server-issued `providers` rows; legacy preference IDs are read-only compatibility fallbacks during cutover.

## Current permission layers

| Layer                      | What it proves                                | What it does not prove               |
| -------------------------- | --------------------------------------------- | ------------------------------------ |
| UI role/view selection     | Which experience the user sees                | Backend authority or privilege       |
| Firebase Auth UID          | Which account made the request                | Organizer/provider/admin role        |
| Ownership checks           | The document belongs to the caller            | Broader operational authority        |
| Connection/listing markers | A specific contact-sharing reason exists      | Arbitrary access to other data       |
| Firestore Rules            | Whether a client read/write is allowed        | Admin SDK trigger correctness        |
| Callable/trigger Functions | Server-controlled transitions and projections | That the UI will call them correctly |

## Important current controls

- Contacts are not globally readable; event creators do not gain unrelated contact access.
- `connections` and `public_contacts` are write-denied to clients.
- `providers`, `services`, `bookings`, `offers`, protected stats/reward fields, `redemptions`, aggregate stats, ranking history, and notifications creation are server-controlled.
- Reward redemption review is limited to the super-admin bootstrap; event creators cannot review,
  use, flag, or receive global coupon notifications unless they separately own the provider record.
- Preferences are publicly readable projections; writes remain owner-scoped and role fields cannot be self-assigned.
  `public_preferences` remains reserved deny-all.
- Tournament result, ladder challenge, and group-bonus mutations use callable Functions; client match
  writes remain limited to scheduling and other allowlisted fields.
- Storage writes require an owner UID for member paths and image/type/size constraints; anonymous court reports use a fixed anonymous prefix.

## Target role model

Everyone remains a Member. Organizer, Provider, and Admin stack on top of membership and may coexist. The target should use server-managed claims or an equally authoritative role registry, with resource ownership for organizer event scope and explicit provider scope. UI role switching must never grant authority.

## Risks and open questions

- Event assignment currently uses optional `events.organizer_ids`; a durable assignment UI/audit trail remains future work.
- Cross-member preference decoration fails closed until an approved event-scoped or consented projection exists.
- The hardcoded super-admin UID is operationally brittle and requires a documented bootstrap/recovery process. **Owner ruling 2026-08-31: it stays hardcoded** ([VISION.md](../planning/VISION.md) §10.6) — the brittleness is accepted and the recovery process is still owed. One consequence is load-bearing: the deployed rules must carry a UID that exists in the project they are deployed to, and a second Firebase project has its own Auth tenant, so staging otherwise has no super-admin at all.
- Provider access is inferred from preference fields and is not consistently represented as a role boundary.
- Admin SDK functions bypass Firestore Rules, so trigger/callable authorization and input validation need separate tests.
