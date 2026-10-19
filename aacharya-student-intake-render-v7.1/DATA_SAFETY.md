# Combined edition cloud storage

For Render Free, follow CLOUD_SETUP.md. Remote committed snapshots and private files are authoritative; local backups and data paths are temporary. Use a complete backup download or cloud export for independent recovery. Startup never initializes an empty cloud database automatically.

The following original V7 guidance applies to local SQLite mode (`npm run start:local`) and documents preserved safeguards.

# Data Safety Center and recovery

V7 never automatically drops valuable tables, resets IDs, replaces a missing production database with an empty one, or silently deletes old financial/course information. The old SQL schema retains its existing foreign-key definitions for compatibility; normal V7 routes do not invoke destructive student/class/financial deletes.

## Before migration

1. Verify source SQLite integrity.
2. Create a timestamped `VACUUM INTO` snapshot, verify the snapshot, fsync it, rename it atomically and record its SHA-256 metadata.
3. Apply additive changes inside savepoints and record schema migration 7.
4. On migration failure, roll back the migration and stop the server. Keep the pre-migration snapshot.

The original database remains `DATA_DIR/aacharya_tuition.sqlite`. Changing folders must not change DATA_DIR. V7 preserves all original source tables/rows and adds columns, indexes, views and modules. The test fixture is never copied into production.

## What is protected

- Student archive retains attendance, classes, fees, payments, proofs, tests, parent links, notes and course history.
- Acceptance keeps the admission permanently and links it to a student. Repeat acceptance reuses the student. Missing links can be repaired. If an explicitly retained missing student ID is free, recovery reuses that ID; otherwise it creates a new row from retained admission details without overwriting another identity. Recovery cannot recreate fields never retained in the admission or another backup.
- Payment edits require a reason and preserve old values, version, editor/time and proof metadata. Replacement proof files remain available to admin. Cancellation/refund/reversal are recorded statuses, not deletions.
- Class cancellation and attendance archival preserve underlying rows. Cancelled classes are excluded from conducted attendance percentage.
- Manual parent disables persist, and unlinking a child preserves link history while immediately removing authorization.
- SQL transactions and retry keys protect acceptance, scheduling, import, proof approval, renewals and saves. Versioned edit requests reject stale data.

## Backup types

| Action | Contents |
|---|---|
| Create safety snapshot / database download | Consistent verified SQLite database, including every table |
| Download database + private files | Portable `.tar.gz` containing a verified database, current and historical `payment-proofs-v6/`, and `private-v7/` documents/photos |
| Emergency CSV | Flat table/record/field/value export for human recovery; not a database restore image |
| Master Excel | Readable operational/history workbook; not a full disaster-recovery backup |

**A SQLite-only backup does not contain proof image/PDF binaries.** Use the complete data download for off-service disaster recovery. The app never deletes old proof files when proofs are replaced.

Rolling database snapshots are taken after changed data, on startup/shutdown, manually, before repairs and before official payment edits. Default retention is 20; at least five rolling snapshots are retained. Pre-V7 migration snapshots are pinned and excluded from normal pruning. Maintain adequate disk space and retain off-service copies: backups on the same disk do not protect against loss of that disk.

`.aacharya-data-state.json` records counts and `.aacharya-high-water.json` retains the greatest observed counts for important tables. A decrease raises a diagnostic warning; it never deletes or modifies records to match a count. These metadata files are written atomically. They complement, but do not replace, database backups.

## Check and repair

Data Safety Center reports integrity, mount detection, database/WAL size, path, version/schema, last migration/Excel rebuild, free disk space, snapshots, broken admission/parent/payment/attendance/class relationships, missing proof/documents and foreign-key findings. Public `/api/health` returns safe summary fields without internal paths or secrets.

**Check relationships** is read-only. **Repair safe relationships** takes a snapshot and repairs only unambiguous admission/payment metadata links. Ambiguous or missing rows/files remain visible for review. It does not invent payment amounts or delete orphan records.

## Manual recovery only

There is no one-click destructive restore.

1. Stop academy writes and stop the service. Download/copy the entire current data directory to a separate safe location, including SQLite, WAL/SHM if present, proof files and backups.
2. Verify a candidate snapshot with `PRAGMA integrity_check` in a separate temporary location. Check student/admission/payment counts and latest transactions, not only file timestamps.
3. Reconcile transactions made after the candidate snapshot. Prefer targeted repair by an experienced SQLite administrator. Keep both copies and an audit record of decisions.
4. If a full replacement is truly required, have an administrator explicitly approve the exact database and complete private-file set after reviewing the differences. Work only with the stopped service and retain the displaced files separately.
5. Restart, run integrity/relationship checks, verify academy records, then rebuild Excel. Do not delete the preserved pre-recovery copy.

A startup safety stop is a reason to investigate DATA_DIR/mount health, not to enable a new database. An Excel failure leaves valid SQLite changes intact and is displayed in the safety diagnostics. A snapshot failure blocks a high-risk payment edit. Network errors do not clear frontend records or change server data.
