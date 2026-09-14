# Aacharya Tuition Manager V7

This is a complete sibling upgrade of the supplied V6.1 project. Do not replace or delete the V6.1 folder.

## Upgrade your existing Render service

1. In V6.1, download a database backup. Retain the existing `/var/data` disk and its contents.
2. Extract this ZIP and add `aacharya-student-intake-render-v7` beside `aacharya-student-intake-render-v6.1` in your GitHub repository. Upload the complete folder.
3. In the **existing** Render web service, change **Root Directory** to `aacharya-student-intake-render-v7`. Keep the same service, database, environment variables and persistent disk mounted at `/var/data`.
4. Set Node to `24.19.0` (or a compatible Node 24 patch), Build Command to `npm ci --omit=dev`, Start Command to `npm start`, and `DATA_DIR=/var/data`. Keep your private `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `SESSION_SECRET`; the secret must be at least 24 characters. Keep other existing secrets private.
5. Deploy. V7 checks SQLite integrity and creates a verified, timestamped snapshot before its first migration. A migration error stops startup.
6. Sign in at `/admin`. Open **Data Safety Center**. Confirm the persistent disk is detected, database integrity is `ok`, accepted admissions remain linked, and record counts match your academy data. Download **database + private files** for a complete off-service backup.

**Never set `INIT_NEW_DATABASE=true` during an upgrade to work around a missing database.** Fix the disk/path instead. See DATA_SAFETY.md.

The first V7 admin account is imported from your existing admin environment credentials. After migration, account passwords are stored as secure hashes in the database and are changed in **Accounts & security**, rather than by changing environment variables.

Main pages: `/` admission form, `/admin`, `/parent`, `/parent/signup?invite=…`, `/teacher`, `/student`. Parent signup remains invitation-only. Create teacher/student logins from **Accounts & security**, linked to the correct teacher/student record.

Read RENDER_SETUP.md for exact deployment details, DATA_SAFETY.md for recovery, V7_FEATURE_GUIDE.md for daily use, V7_EXCEL_GUIDE.md for reporting, and QA_V7.md for the tested scope and validation limits.
