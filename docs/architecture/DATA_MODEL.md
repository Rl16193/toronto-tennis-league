# Data model

## Current state

Firestore is a document model with several consolidated collections. The client and Functions use a shared `matches` collection distinguished by `category`, a shared `courts` collection distinguished by `type`, and a shared `tasks` collection containing progress, group-award, offer, and claim-related records. Tournament Round Robin drafts are nested under events.

Diagram: [Firestore data model](diagrams/firestore-data-model.md).

## Collection and access map

| Path                                    | Main purpose                                            | Current client access                                                                           |
| --------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `users/{uid}`                           | Public profile identity/display data                    | Public read; owner create/update with protected fields                                          |
| `contacts/{uid}`                        | Email, phone, WhatsApp contact data                     | Owner, connected opponent, current lesson coach, or super-admin read; owner field-limited write |
| `stats/{uid}`                           | League points, wins/losses, match counters              | Public read; owner may edit only safe profile-summary fields; protected stats are server-only   |
| `preferences/{uid}`                     | Private notification, availability, and preference data | Owner or super-admin read; owner-safe field writes; `event_creator` is not self-assignable      |
| `events/{eventId}`                      | Events and tournament configuration                     | Public read; owner-scoped or explicitly assigned event-manager writes                           |
| `events/{eventId}/rr_drafts/{drawKey}`  | Organizer Round Robin draft state                       | Event creator read/write; assigned-organizer co-management awaits stakeholder confirmation      |
| `event_participants/{id}`               | Event membership, date, doubles/zone state              | Authenticated read; participant or event-scoped manager mutation                                |
| `matches/{id}`                          | Tournament fixtures, rallies, challenges, submissions   | Authenticated read; state-specific player/creator mutations                                     |
| `ranking_history/{uid}/entries/{id}`    | Historical ranking snapshots                            | Public read; server-only write                                                                  |
| `courts/{id}`                           | Check-ins, attendance, condition/queue/photo reports    | Authenticated read; constrained append-only creates; no update/delete                           |
| `tasks/{id}`                            | Per-user progress and server award ledger               | Public read; only the owner may edit allowlisted progress fields                                |
| `task_claims/{id}`                      | Volunteer/ambassador/host claims                        | Owner/admin read; deterministic ambassador IDs plus a server legacy-claim guard; admin review   |
| `offers/{uid}`                          | Reward balance/catalog projection                       | Owner or super-admin read; server-only write                                                    |
| `redemptions/{code}`                    | Reward redemption lifecycle                             | Owner/provider/admin read; server-only write                                                    |
| `listings/{id}`                         | Member marketplace listings                             | Public read; owner create/delete; owner or super-admin update                                   |
| `public_contacts/{uid}`                 | Listing-safe contact projection                         | Authenticated read; server-only allowlisted projection write                                    |
| `connections/{pair}`                    | Opponent/contact-access relationship                    | Participant read; server-only write                                                             |
| `notifications/{id}`                    | Per-user in-app notifications                           | Recipient read/update/delete; server-only create                                                |
| `group_lessons/{month}`                 | Monthly roster projection                               | Public read; server-only write                                                                  |
| `group_lesson_contact_access/current`   | Expiring coach-to-roster contact authorization          | No direct client access; server-maintained and evaluated only by Rules                          |
| `mailing_list/{id}`                     | Public signup capture                                   | Anonymous constrained create; super-admin read/manage                                           |
| `site_stats/{id}`                       | Public site aggregates and group-award state            | Public read; server-only write                                                                  |
| `admin_stats/{id}`                      | Restricted operational metrics                          | Super-admin read; server-only write                                                             |
| `_archive_database_consolidation/{...}` | Migration/archive namespace                             | Denied to clients                                                                               |

## Key relationships

- `users`, `stats`, `preferences`, and `contacts` share the Firebase Auth UID as document ID.
- `event_participants.event_id` points to `events/{eventId}`; `matches.event_id` points to an event for tournament fixtures.
- `matches.player_1_uid` and `player_2_uid` identify opponents; accepted rallies/challenges and tournament fixtures create `connections/{sortedUid__sortedUid}`.
- `events/{eventId}/rr_drafts/{drawKey}` is the draft source for draw generation; generated fixtures land in `matches`.
- `tasks/{uid}` is the user progress projection; Functions write award ledger records with deterministic IDs under `tasks`.
- Storage paths under `avatars/{uid}`, `listings/{uid}`, `court_reports/{uid}`, and `court_suggestions/{uid}` are referenced by Firestore documents.

## Target state

Keep stable document IDs and append-only activity records while continuing to formalize field schemas and ownership in rules tests and typed contracts. Treat `stats`, reward ledgers, connection markers, public-contact markers, notifications, aggregate collections, and tournament outcomes as server-authoritative.

## Evidence, risks, and open questions

- Evidence: `firestore.rules`, `storage.rules`, `src/features/**`, `src/pages/tournament/useTournament.ts`, `functions/**`.
- Public reads remain deliberate for profile identity, events, rankings, listings, group lessons, and aggregate site data. Private preferences and operational metrics are not publicly enumerable.
- Many documents have application-level validation but not complete rules-level type/length validation.
- The deployed schema and historical migration state were not available for this local audit; do not infer production document shape from one code path.
