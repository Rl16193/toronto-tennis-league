# Tournament rules

These rules describe current behavior. They are deliberately short so a refactor can preserve
the invariant without copying the entire UI workflow into a second source of truth.

## Registration and placement

**Rule:** A player joins through an `event_participants` record. Draw placement is derived from the
event choice, division, skill group, and zone; UI selection is not an authorization boundary.

**Why:** A refresh or a different client must reconstruct the same draw from persisted records.

**Important exception:** Organizers may manually place or edit a player, but a player who has
already played a match in their current group cannot be moved out of that group.

**Code:** `src/pages/tournament/useTournament.ts`, `src/pages/tournament/rrGeneration.ts`.

**Regression test:** `tests/unit/domain.test.mjs`; Firestore ownership/participant checks in
`tests/rules/firestore.rules.test.mjs`.

## Removal from a draw

**Rule:** A player with any completed match in the event cannot be removed. Otherwise removal
purges their pending match documents and participant record in the whole event, and records the
withdrawal in the relevant Round Robin draft.

**Why:** One stale match or participant document can cause a later refresh to re-seat the player.
Completed matches remain immutable history because removing their participant would orphan an
authoritative result, points, and statistics.

**Important exception:** A sibling draw's withdrawal list is updated with an array union because
that draw is not loaded in the current client.

**Code:** `src/pages/tournament/useTournament.ts` (`handleEditRRGroup`).

**Regression test:** The write path is protected by the existing rules suite; add a focused domain
test before changing this removal workflow.
