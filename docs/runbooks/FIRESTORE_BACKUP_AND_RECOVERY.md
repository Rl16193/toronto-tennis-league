# Firestore backup and recovery runbook

This runbook separates repository-verifiable preparation from Firebase/GCP console actions that require authorized access. It is a procedure template, not evidence that backups or PITR are enabled.

## Scope

- Firebase project currently named by the repository alias: `toronto-tennis-league`.
- Treat that project as production-sensitive.
- Do not test restore, export, import, or migration commands against production without explicit approval and a reviewed change window.

## Current repository evidence

- No backup/export configuration, restore drill, staging project alias, or recovery script was found in the checkout.
- `firebase.json` configures Firestore rules and indexes but no backup policy.
- `.firebaserc` has only `default -> toronto-tennis-league`; this is not sufficient environment isolation.
- Firestore rules include an Admin SDK-only archive path, but that path is not a backup system and must not be treated as recovery evidence.

## Required authorized console work

1. Confirm the production project ID, billing account, database location, database edition, and the operators authorized to restore data.
2. In Google Cloud Console, open **Firestore → Backups** for the confirmed project and record whether scheduled backups and retention are configured.
3. In Google Cloud Console, open **Firestore → Disaster recovery** and record whether Point-in-Time Recovery (PITR) is enabled, the retention window, and the earliest recoverable timestamp.
4. Confirm that backup storage, IAM access, and audit logging are controlled by the project owner rather than personal local credentials.
5. Create or confirm an isolated staging project before any restore drill. Never restore production data into the developer’s default project.

## Recovery drill

Run only against an isolated non-production project populated with synthetic or approved scrubbed data.

1. Export or restore a bounded dataset using the authorized Google Cloud/Firebase procedure.
2. Record the source timestamp, destination project, operator, command or console action, and resulting export/restore identifier outside the application repository if it contains sensitive operational details.
3. Validate document counts, representative rules reads/writes, Functions triggers, indexes, Storage references, and application smoke flows.
4. Compare the recovered dataset against the expected fixture and record any loss, ordering, timestamp, or reference differences.
5. Keep the last known-good recovery artifact and document rollback/cleanup steps.

## Production recovery checklist

- [ ] Incident owner and restore approver identified.
- [ ] Target project is confirmed and isolated from production until approval.
- [ ] Recovery timestamp or backup artifact selected.
- [ ] Export/restore permissions verified.
- [ ] Restore performed without overwriting the source database.
- [ ] Rules, indexes, Functions, Storage references, and critical user flows validated.
- [ ] Data-loss boundary and recovery result recorded.
- [ ] Production cutover or rollback explicitly approved.

## Open engineering work

- Add an isolated staging alias and environment-specific Firebase CLI commands.
- Add synthetic fixtures and a repeatable restore validation script.
- Document data retention and PII handling requirements before exporting any real dataset.
- Reconcile the archive collection with the actual recovery strategy; it is not a substitute for managed backups.
