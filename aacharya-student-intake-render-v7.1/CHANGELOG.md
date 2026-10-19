# 7.1.1 startup fix

- Report specific safe startup codes, missing environment names, HTTP status and setup stage.
- Support new Supabase secret keys via apikey only; preserve legacy service_role JWT behavior.
- Add read-only cloud:diagnose and CLOUD_TROUBLESHOOTING.md.
- Preserve snapshot/private-file storage and all existing data safeguards.

# 7.1.0 combined edition

- Add Supabase snapshot persistence and private file storage for one Render Free service.
- Add guarded one-time import, complete export, cloud history, writer fencing and confirmed-save responses.
- Integrate original Chemistry Lab with account-isolated progress and immutable completed results.
- Integrate V2 monthly fee review into the existing fee ledger; block duplicate and stale charges.
- Preserve original V7 modules, logo and all 44 workbook sheets.

# V7 — 7.0.0

- Preserved the supplied 69-file V6.1 baseline and recorded SHA-256 manifest; built V7 in a separate sibling folder.
- Added verified pre-migration snapshots, additive schema migration tracking, request savepoints, idempotency keys, stale-edit checks, complete private-data backups and count-decrease diagnostics.
- Added teacher/student accounts and portals, teachers/subjects/batches, per-class attendance, recurring/shared-session scheduling, assignments, announcements, notifications, rich student profiles, reports, import and global search.
- Hardened parent invitation/link scope, manual disable persistence and session revocation. Removed automatic credential purge behavior; retained historical account records.
- Made proof approval transactional/idempotent, enforced private proof access and file signatures, preserved replacement files, versioned official payment edits and financial status history.
- Preserved true alumni/re-enrollment/course history rules. Added safe enrollment date/hold/renewal operations.
- Unified fee allocation between reports and website; excluded cancelled financial records from current totals; retained alumni financial liabilities.
- Retained the exact PNG and unchanged safe XLSX writer; preserved all original 36 worksheet names and added eight useful V7 sheets.
- Added independently tested UI/device behavior, professional dialogs/toasts/print, secure icon-only PWA caching and release QA tools.
- Fixed path-boundary checks, async HTTP error handling, parent form lifetime errors, archived student data safety, batch-hour duplication, reschedule conflict checks, legacy remote proof bypass and old-session reuse.

The sections below are retained historical release notes; START_HERE.md and the V7 guides supersede older deployment/version instructions.

---

# Changelog

## V6.1.0 — Data Reliability Fix

Bug-fix sibling release; V6 source remains separate.

### Fixed / hardened

- Admission acceptance is transactional and idempotent.
- Accepted admissions remain in Admissions and retain their linked student.
- Startup repair relinks/recreates broken accepted admission/student relationships.
- Student removal is now Archive, preventing cascade loss of classes, attendance, fees and tests.
- Archived students can be reactivated.
- Existing student search is cleared after admission acceptance so a newly accepted student is not hidden by stale filtering.
- SQLite durability uses WAL, FULL synchronous writes, busy timeout and explicit checkpoints.
- Rolling SQLite safety snapshots are created under `DATA_DIR/backups`.
- Admin Data Safety panel exposes integrity, counts, backups, storage mount status and admission repair tools.
- Production warning is shown when a persistent `/var/data` mount is not detected.

### Preserved

- Integrated Parent Portal and all V6 workflows.
- Compulsory parent payment proof.
- Historical payment versions.
- True-alumni-only Old Records logic.
- Existing themes, exact logo/icon, responsive UI and 36-sheet Excel workbook.

## V6.0.0 — Integrated Parent Portal Edition

Built as a new sibling version from the V5.3 codebase so the prior V5.3 project can remain untouched in GitHub.

### Added

- Same-app Parent Portal (`/parent`) and invitation signup (`/parent/signup`)
- Dedicated parent accounts and parent/student permission links
- Multiple-child parent support
- Course enrollments with Upcoming/Active/Grace/Ended lifecycle
- 7-day course-ending warning and grace notifications
- Renewal requests with admin approval/rejection
- Compulsory parent payment screenshot/receipt (PNG/JPG/WEBP/PDF)
- Private proof storage under the main persistent `DATA_DIR`
- Admin payment-proof verification and official payment creation
- Payment resubmission history
- Admin payment editing with compulsory edit reason
- Current payment version metadata and historical payment snapshots
- True-alumni-only archive logic with automatic rejoin exclusion
- 9 new V6 workbook sheets; 36 total
- Integrated parent portal admin section
- V6 smoke test

### Preserved

- V5.3 student/class/attendance/fee/payment/test tables and functionality
- V5.3 reliable XLSX writer
- Existing 27 workbook sheets
- V5.2 theme/customization and adaptive layouts
- Exact Aacharya app icon
- Old `parent-portal-extension/` files for backward reference (not used by V6 deployment)
