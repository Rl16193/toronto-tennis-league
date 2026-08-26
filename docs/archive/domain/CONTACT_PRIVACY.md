# Contact privacy

## Read access

**Rule:** A contact document is readable by its owner, an authenticated opponent with a persisted
connection, the assigned coach for a player currently enrolled in the monthly group lesson, or the
super-admin. Anonymous users cannot read contacts.

**Why:** The app shares contact details for real coordination, but a public member directory must
not become a phone-number directory.

**Important exceptions:** Event creators do not receive general contact access. A marketplace
listing exposes only an allowlisted projection through `public_contacts/{uid}` to authenticated
members; it does not unlock the private `contacts/{uid}` document. Group-lesson access uses a
server-owned marker that expires at the next Toronto month boundary and contains only the current
roster.

**Code:** `firestore.rules`, `functions/connections.js`, `functions/rewards.js`,
`functions/index.js`.

**Regression tests:** `tests/rules/firestore.rules.test.mjs` (`contacts become readable...` and
`only the active group lesson coach...`).

## Writes and sensitive fields

**Rule:** Only the owner can create or update their contact document, and only the allowlisted
contact fields may change. Server-owned connection markers and points remain outside client writes.

**Why:** Field-level rules prevent a legitimate profile edit from becoming a privilege-escalation
path.

**Important exception:** No client delete path exists for contacts.

**Code:** `firestore.rules` (`ownerContactFields`, `/contacts/{userId}`).

**Regression test:** `tests/rules/firestore.rules.test.mjs`.
