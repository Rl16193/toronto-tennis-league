# ADR-001: Separate event workflow roles from global administration

- Status: accepted; source migration in progress
- Date: 2026-08-18

## Decision

Treat Member, Event Creator, Provider, and Admin as separate server-authorized capabilities that
stack on a Firebase Auth identity. `event_creator` means permission to participate in an event
workflow; it is not global administration. Event creators may mutate only events they own or are
explicitly assigned to and the event-scoped resources required by those events. Admin-only
metrics, reward economics, role assignment, and other cross-event operations require a distinct
server-managed capability.

UI role selection changes presentation only. Firestore Rules and callable/trigger Functions remain
authoritative for identity, resource ownership, scope, and privileged mutations.

## Context

The baseline app uses a hardcoded super-admin UID, `preferences.event_creator`, and provider
preference IDs. That model made an event workflow flag a global authorization primitive and mixed
private role state into a broadly readable preferences document. It also allowed the same
capability to reach event, task, offer, stats, contact, and operational-metric paths. Those powers
do not follow from creating or operating one event.

## Consequences

- Role changes need a server-managed source and audit trail.
- Event access is limited to events the creator owns or is explicitly assigned to.
- Admin override is a separate capability, not an implication of `event_creator`.
- Provider workflows can be read-first and scope-specific.
- Rules and Functions tests become mandatory for role changes.
- Public profile/preference projections must not contain role flags, notification settings, private
  availability, or provider-administration identifiers.
- Reward balances, offer economics, tournament statistics, scoring, advancement, and redemption
  state remain server-authoritative. Clients submit intent; they do not apply protected outcomes.

## Compatibility and migration

Legacy reads may temporarily accept `preferences.event_creator` only as an input to an explicit,
event-scoped compatibility decision. They must not restore global access to unrelated events or
administrative collections. New writes must use the authoritative role/assignment and public
projection contracts.

If production-shaped documents require transformation, use a bounded, idempotent migration built
on `scripts/migrations/lib/cli.mjs`. It must default to dry-run, name the target project explicitly,
report eligible/changed/skipped/failed counts, and document its deterministic resume marker.
Before apply mode is implemented, document field-level rollback: retain the prior private document,
remove only migration-created projection/assignment fields, and restore the prior value only from a
verified export. Run and validate the migration against isolated staging first. This ADR does not
authorize or provide evidence of a staging or production migration.

## Evidence and open questions

Evidence: `firestore.rules`, `functions/lib/notify.js`, `src/context/AuthContext.tsx`, and `src`
role/view usage. Open until verified at an integrated source SHA: the authoritative assignment
representation, legacy compatibility window, and bounded migration implementation. External gates:
an authorized staging project, migration rehearsal, production backup evidence, and production
approval.
