# Data model

## Current state

Firestore is a document model with several consolidated collections. The client and Functions use a shared `matches` collection distinguished by `category`, a shared `courts` collection distinguished by `type`, and a shared `tasks` collection containing progress, group-award, offer, and claim-related records. Tournament Round Robin drafts are nested under events.

Diagram: [Firestore data model](diagrams/firestore-data-model.md).

## Collection and access map

| Path                                    | Main purpose                                                                             | Current client access                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `users/{uid}`                           | Public profile identity/display data                                                     | Public read; owner create/update with protected fields                                          |
| `contacts/{uid}`                        | Email, phone, WhatsApp contact data                                                      | Owner, connected opponent, current lesson coach, or super-admin read; owner field-limited write |
| `stats/{uid}`                           | League points, wins/losses, match counters                                               | Public read; owner may edit only safe profile-summary fields; protected stats are server-only   |
| `preferences/{uid}`                     | Public member choices plus notification/availability preferences                         | Public read; owner-safe field writes; `event_creator` is not self-assignable                    |
| `providers/{providerId}`                | Server-issued provider identity, roles, and optional member link                         | Public read; Admin SDK/callable-owned write                                                     |
| `services/{serviceId}`                  | Active stringing/coaching/other service catalog entries                                  | Public read; owner-gated callable write                                                         |
| `bookings/{bookingId}`                  | Service booking lifecycle (`lead → in_progress → completed`, or `cancelled` from `lead`) | Member/provider/admin read; callable-only write                                                 |
| `events/{eventId}`                      | Events and tournament configuration                                                      | Public read; owner-scoped or explicitly assigned event-manager writes                           |
| `events/{eventId}/rr_drafts/{drawKey}`  | Organizer Round Robin draft state                                                        | Event creator read/write; assigned-organizer co-management awaits stakeholder confirmation      |
| `event_participants/{id}`               | Event membership, date, doubles/zone state                                               | Authenticated read; participant or event-scoped manager mutation                                |
| `matches/{id}`                          | Tournament fixtures, rallies, challenges, submissions                                    | Authenticated read; state-specific player/creator mutations                                     |
| `ranking_history/{uid}/entries/{id}`    | Historical ranking snapshots                                                             | Public read; server-only write                                                                  |
| `courts/{id}`                           | Check-ins, attendance, condition/queue/photo reports                                     | Authenticated read; constrained append-only creates; no update/delete                           |
| `tasks/{id}`                            | Per-user progress and server award ledger                                                | Public read; only the owner may edit allowlisted progress fields                                |
| `task_claims/{id}`                      | Volunteer/ambassador/host claims                                                         | Owner/event-manager/admin read; deterministic ambassador IDs; callable review                   |
| `offers/{uid}`                          | Reward balance/catalog projection                                                        | Owner or super-admin read; server-only write                                                    |
| `redemptions/{code}`                    | Reward redemption lifecycle                                                              | Owner/provider/admin read; server-only write                                                    |
| `listings/{id}`                         | Member marketplace listings                                                              | Public read; owner create/delete; owner or super-admin update                                   |
| `public_contacts/{uid}`                 | Listing-safe contact projection                                                          | Authenticated read; server-only allowlisted projection write                                    |
| `connections/{pair}`                    | Opponent/contact-access relationship                                                     | Participant read; server-only write                                                             |
| `notifications/{id}`                    | Per-user in-app notifications                                                            | Recipient read/update/delete; server-only create                                                |
| `mailing_list/{id}`                     | Public signup capture                                                                    | Anonymous constrained create; super-admin read/manage                                           |
| `site_stats/{id}`                       | Public site aggregates and group-award state                                             | Public read; server-only write                                                                  |
| `admin_stats/{id}`                      | Restricted operational metrics                                                           | Super-admin read; server-only write                                                             |
| `_archive_database_consolidation/{...}` | Migration/archive namespace                                                              | Denied to clients                                                                               |

## Key relationships

- `users`, `stats`, `preferences`, and `contacts` share the Firebase Auth UID as document ID.
- `event_participants.event_id` points to `events/{eventId}`; `matches.event_id` points to an event for tournament fixtures.
- `matches.player_1_uid` and `player_2_uid` identify opponents; accepted rallies/challenges and tournament fixtures create `connections/{sortedUid__sortedUid}`.
- `events/{eventId}/rr_drafts/{drawKey}` is the draft source for draw generation; generated fixtures land in `matches`.
- `tasks/{uid}` is the user progress projection; Functions write award ledger records with deterministic IDs under `tasks`.
- `providers/{providerId}.roles` identifies provider capability; event-specific organizer authority
  remains on `events.organizer_ids`. `member_uid` is an optional link used for provider queue
  ownership, never a client-writable role flag.
- `services/{serviceId}` is the catalog source. Existing `tasks` documents with `type: offer` are a
  read-only compatibility fallback until an authorized migration; `offers/{uid}` remains only the
  server-owned points-spent projection.
- Booking completion uses `completion_requested_at` as a timestamp while the player answers; it is
  not a fourth status. `group_lessons` and its contact projection are retired in favour of event
  add-on blocks.
- Storage paths under `avatars/{uid}`, `listings/{uid}`, `court_reports/{uid}`, and `court_suggestions/{uid}` are referenced by Firestore documents.

## Target state

Keep stable document IDs and append-only activity records while continuing to formalize field schemas and ownership in rules tests and typed contracts. Treat `stats`, reward ledgers, connection markers, public-contact markers, notifications, aggregate collections, and tournament outcomes as server-authoritative.

### Sprint D4 remodel review

The event roster now carries the event-scoped `zone`, optional doubles partner shape, and
`status: active|withdrawn` with withdrawal metadata. A withdrawal remains registered and
unplaced; the server callable records walkovers for unplayed fixtures and leaves completed
results unchanged. Participant creation is the only automatic seating trigger, and knockout
first-round seats remain `PLAYER_LOADING` until an organizer assigns them. `preferences` owns the
member's `preferred_zone_manual` and `available_to_play` flags, while `events` may persist both
`zone_draw_config` and the derived `zones` coverage. Round deadlines are keyed by draw and round,
excluding the Round Robin group stage.

The Rules boundary now uses explicit participant and preference field whitelists. Profile identity
does not carry `profile_details_visible`; league display is public. Validation for this remodel is
local-only. Production deployment and data mutation remain out of scope, and staging is deferred
until an authorized isolated project and verified recovery path exist.

## Evidence, risks, and open questions

- Evidence: `firestore.rules`, `storage.rules`, `src/features/**`, `src/pages/tournament/useTournament.ts`, `functions/**`.
- Public reads remain deliberate for profile identity, events, rankings, listings, group lessons, and aggregate site data. Private preferences and operational metrics are not publicly enumerable.
- Many documents have application-level validation but not complete rules-level type/length validation.
- The deployed schema and historical migration state were not available for this local audit; do not infer production document shape from one code path.

### Sprint D5 component and service review

The component primitives now have typed, accessible contracts for people, stat tiles, pills,
fields, empty/error states, switches, checkboxes, and progress rings. Providers, services, and
bookings have callable-owned lifecycle boundaries; provider role flags in `preferences` remain a
read-only compatibility fallback while the server-issued `providers` rows are bootstrapped. Task
claims route volunteer/host review to the event manager and ambassador claims auto-approve. The
retired monthly group-lesson collection and callables are no longer part of the client or Rules
surface. Validation is local-only; no production deployment or data mutation was performed, and
staging remains deferred until an authorized isolated project and verified recovery path exist.
