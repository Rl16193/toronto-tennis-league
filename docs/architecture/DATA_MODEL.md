# Data model

## Current state

Firestore is a document model with several consolidated collections. The client and Functions use a shared `matches` collection distinguished by `category`, a shared `courts` collection distinguished by `type`, and a shared `tasks` collection containing progress, group-award, offer, and claim-related records. Tournament Round Robin drafts are nested under events.

Diagram: [Firestore data model](diagrams/firestore-data-model.md).

## Collection and access map

| Path | Main purpose | Current client access |
| --- | --- | --- |
| `users/{uid}` | Public profile identity/display data | Public read; owner create/update with protected fields |
| `contacts/{uid}` | Email, phone, WhatsApp contact data | Owner, connected opponent, organizer, or listing-mediated read; owner field-limited write |
| `stats/{uid}` | League points, wins/losses, match counters | Public read; owner limited profile fields; global event creator/server paths can update |
| `preferences/{uid}` | Role-like flags and notification/preferences | Public read; owner cannot change `event_creator`; super-admin path can |
| `events/{eventId}` | Events and tournament configuration | Public read; global event creator write |
| `events/{eventId}/rr_drafts/{drawKey}` | Organizer Round Robin draft state | Authenticated read; event creator write |
| `event_participants/{id}` | Event membership, date, doubles/zone state | Authenticated read; owner or event creator mutation |
| `matches/{id}` | Tournament fixtures, rallies, challenges, submissions | Authenticated read; state-specific player/creator mutations |
| `ranking_history/{uid}/entries/{id}` | Historical ranking snapshots | Public read; server-only write |
| `courts/{id}` | Check-ins, attendance, condition/queue/photo reports | Authenticated read; constrained append-only creates; no update/delete |
| `tasks/{id}` | Per-user progress and server award ledger | Public read; owner-safe fields or global creator writes |
| `task_claims/{id}` | Volunteer/ambassador/host claims | Authenticated read; owner creates pending claim; organizer review |
| `offers/{uid}` | Reward balance/catalog projection | Owner or global event creator read; server-only write |
| `redemptions/{code}` | Reward redemption lifecycle | Owner/provider/admin read; server-only write |
| `listings/{id}` | Member marketplace listings | Public read; owner creates/edits/deletes; creator can update |
| `public_contacts/{uid}` | Listing contact-access marker | Authenticated read; server-only write |
| `connections/{pair}` | Opponent/contact-access relationship | Participant read; server-only write |
| `notifications/{id}` | Per-user in-app notifications | Recipient read/update/delete; server-only create |
| `group_lessons/{month}` | Monthly roster projection | Public read; server-only write |
| `mailing_list/{id}` | Public signup capture | Anonymous constrained create; organizer/admin read/manage |
| `site_stats/{id}` | Public site aggregates and group-award state | Public read; server-only write |
| `admin_stats/{id}` | Restricted operational metrics | Global event creator read; server-only write |
| `_archive_database_consolidation/{...}` | Migration/archive namespace | Denied to clients |

## Key relationships

- `users`, `stats`, `preferences`, and `contacts` share the Firebase Auth UID as document ID.
- `event_participants.event_id` points to `events/{eventId}`; `matches.event_id` points to an event for tournament fixtures.
- `matches.player_1_uid` and `player_2_uid` identify opponents; accepted rallies/challenges and tournament fixtures create `connections/{sortedUid__sortedUid}`.
- `events/{eventId}/rr_drafts/{drawKey}` is the draft source for draw generation; generated fixtures land in `matches`.
- `tasks/{uid}` is the user progress projection; Functions write award ledger records with deterministic IDs under `tasks`.
- Storage paths under `avatars/{uid}`, `listings/{uid}`, `court_reports/{uid}`, and `court_suggestions/{uid}` are referenced by Firestore documents.

## Target state

Keep stable document IDs and append-only activity records, but formalize field schemas and ownership in rules tests and typed contracts. Treat `stats`, reward ledgers, connection markers, public-contact markers, notifications, and aggregate collections as server-authoritative. Move remaining client-side scoring mutations behind tested server paths before expanding privileged roles.

## Evidence, risks, and open questions

- Evidence: `firestore.rules`, `storage.rules`, `src/features/**`, `src/pages/tournament/useTournament.ts`, `functions/**`.
- Rules use broad public reads for several collections; confirm each collection’s intended public surface and field sensitivity.
- Many documents have application-level validation but not complete rules-level type/length validation.
- The deployed schema and historical migration state were not available for this local audit; do not infer production document shape from one code path.

Last verified source SHA: `846dee90323dbd32d556e9254586cd7f9ebc03c7`.
