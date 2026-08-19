# Firestore migration framework

Migrations are operational tools, not application startup code. The target project must always be
named explicitly; `.firebaserc` is never used as an implicit destination.

## Safety contract

- Start with `--dry-run` (the default) and review the full report before applying anything.
- Use `--project <id>` on every invocation. A service-account `--key` must belong to that project.
- Use `--limit` for bounded pages and `--resume <document-id>` to continue a document-ID cursor.
- Applying requires `--apply`; the example migration refuses to apply because it is synthetic.
- Production additionally requires `--allow-production`, `ALLOW_PRODUCTION_MIGRATION=true`, and
  `--confirm-production I_UNDERSTAND_PRODUCTION_MIGRATION` in an approved execution environment.
- Back up and validate in staging before production. Keep the migration's source SHA, target
  project, operator, dry-run report, apply report, and rollback plan outside the application data.

Example, with no Firebase access or writes:

```bash
node scripts/migrations/001-example.mjs --project rands-local --dry-run
node scripts/migrations/001-example.mjs --project rands-local --limit 1 --dry-run
node scripts/migrations/001-example.mjs --project rands-local --resume example-001 --dry-run
```

## Authoring a real migration

Copy `001-example.mjs`, import `createMigrationDb` and `scanCollection`, and keep the migration
bounded and idempotent. For each document, increment `scanned`, then `eligible`, `changed`,
`skipped`, or `failed` as appropriate. Never hide a failed write behind a best-effort catch. Use
Admin SDK transactions or batches with a clear maximum batch size, and record a deterministic
marker when a migration may be resumed safely.

## Legacy Admin scripts

The older operational scripts in `scripts/` use the same guard now. This includes contact,
cleanup, provider, reward, rank, connection, doubles, setup, zone, repair, and season-restore
scripts. Each requires `--project <id>` and `--key <service-account.json>`, defaults to dry-run,
and requires `--apply` for writes. Production additionally requires the confirmation triple
above. Do not restore direct `firebase-admin` initialization in an operational script.

## Rollback

Every migration must document whether rollback is possible. Prefer additive or reversible writes.
For destructive changes, require a verified backup or export and a tested restore path before an
apply mode is implemented. The `_archive_database_consolidation` collection is not a backup.
