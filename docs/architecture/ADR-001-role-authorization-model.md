# ADR-001: Separate UI roles from server authorization

- Status: accepted target direction; partial foundation implemented
- Date: 2026-08-18

## Decision

Treat Member, Organizer, Provider, and Admin as server-authorized roles that stack on a Firebase Auth identity. UI role selection changes presentation only. Firestore Rules and callable/trigger Functions remain authoritative for identity, ownership, scope, and privileged mutations.

## Context

The current app uses a hardcoded super-admin UID, `preferences.event_creator`, and provider preference IDs. This supports current workflows but is broader and less recoverable than the target model, especially for organizer event ownership and provider-scoped operations.

## Consequences

- Future role changes need a server-managed source and audit trail.
- Organizer access can be limited to events the organizer owns, with Admin override.
- Provider workflows can be read-first and scope-specific.
- Rules and Functions tests become mandatory for role changes.

## Evidence and open questions

Evidence: `firestore.rules`, `functions/lib/notify.js`, `src/context/AuthContext.tsx`, and `src` role/view usage. The current foundation keeps role fields server-owned in Rules and protects non-production email delivery. Open: choose claims versus a role registry, define bootstrap/recovery, and migrate legacy `event_creator` safely.

Last verified source SHA: `27e7ea2`.
