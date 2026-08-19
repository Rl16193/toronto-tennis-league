# Contact privacy

## Read access

**Rule:** A contact document is readable by its owner, an authenticated opponent with a persisted
connection, a global event creator, or an authenticated user using an organizer/listing-mediated
contact path. Anonymous users cannot read contacts.

**Why:** The app shares contact details for real coordination, but a public member directory must
not become a phone-number directory.

**Important exception:** A public marketplace listing maintains `public_contacts/{uid}` through a
server trigger; the marker grants the listing-mediated path, not anonymous access.

**Code:** `firestore.rules`, `functions/connections.js`, `functions/index.js`.

**Regression test:** `tests/rules/firestore.rules.test.mjs` (`contacts become readable...`).

## Writes and sensitive fields

**Rule:** Only the owner can create or update their contact document, and only the allowlisted
contact fields may change. Server-owned connection markers and points remain outside client writes.

**Why:** Field-level rules prevent a legitimate profile edit from becoming a privilege-escalation
path.

**Important exception:** No client delete path exists for contacts.

**Code:** `firestore.rules` (`ownerContactFields`, `/contacts/{userId}`).

**Regression test:** `tests/rules/firestore.rules.test.mjs`.
