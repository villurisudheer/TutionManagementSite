# Startup fix (7.1.1)

If Render exits during startup, read CLOUD_TROUBLESHOOTING.md. New secret keys and legacy service_role keys are both supported. `npm run cloud:diagnose` provides a read-only configuration/storage/snapshot check.

# Render Free + Supabase

This release requires your own Supabase project. No live account, keys or deployment are included. Never send secrets in chat or commit `.env`.

## Preserve existing records first

If you have real V6.1/V7 data, download a complete backup from the old application. Extract it into a folder containing `aacharya_tuition.sqlite`, `payment-proofs-v6/` and `private-v7/` where present. Stop writes to the old service during the final transfer. A source-code ZIP contains no production records. Data already lost on ephemeral storage cannot be recreated from software.

## Set up Supabase

Create a project. Run `cloud/supabase.sql` in the SQL editor. The script adds private state/history tables and the private `aacharya-private` storage bucket. It is safe to rerun and does not replace academy records. Keep that bucket private.

From Project Settings → API, obtain the project HTTPS URL and **server secret key (`sb_secret_...`) or legacy service_role JWT key**. New secret keys use only the apikey header; legacy service_role JWTs also use bearer authentication. The public anon/publishable key is unsuitable. Copy `.env.example` to `.env` locally and fill:

- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
- ADMIN_EMAIL, a strong ADMIN_PASSWORD, SESSION_SECRET (random, at least 24 characters).
- NODE_ENV=production and STORAGE_MODE=supabase.

Imports preserve existing user password hashes. Use the existing administrator login after importing; changing the bootstrap environment password does not reset imported credentials.

## Initialize once from your computer, using Node.js 24

Run `npm ci` in the extracted project.

For existing records:

```sh
npm run cloud:import -- --from /absolute/path/to/complete-backup-folder
```

The source database is opened read-only and copied consistently. Integrity, row counts and referenced private files are verified before upload. Missing proof files block import. Repeated imports refuse to overwrite an initialized academy. Original files remain unchanged.

**Only for an academy with no existing records**, initialize explicitly:

```sh
npm run cloud:import -- --new --confirm-empty
```

Do not use empty initialization to bypass missing-data errors.

```sh
npm run cloud:check
```

## Configure the existing Render web service

Upload the complete project to a separate GitHub folder. Set Root Directory to that folder.

- Node.js 24; instance: Free.
- Build: `npm ci`; start: `npm start`; health path: `/api/health`.
- Environment: NODE_ENV=production, STORAGE_MODE=supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET.
- No persistent disk or DATA_DIR is required in cloud mode.
- Run one service instance. Do not operate the old local edition against the same academy during the switch.

Startup restores a verified remote SQLite snapshot and all private files into a temporary working directory. API responses are held until changes are committed remotely. A newer deployment fences the old writer. Failed persistence stops the process; restart restores confirmed remote data. Never run `node server.js` as the cloud start command.

## Backups and recovery

Admin Data Safety Center provides **Download database + private files** (complete tar.gz backup), database-only downloads, and cloud revision history. Local safety snapshots are temporary in cloud mode. Cloud history retains the original import plus the latest 20 committed revisions. Proof files are private immutable objects.

For a complete independent cloud export:

```sh
npm run cloud:export -- --output ./academy-backup-2026-10-19
npm run cloud:export -- --output ./older-backup --revision 1
```

Output must be a new folder. Keep independent downloaded copies. Database-only backups do not contain proof binaries. No one-click destructive restore exists: import a complete backup into a separate new Supabase project, validate it, then switch the service configuration.

## Architecture and limits

To preserve V7's proven SQLite queries, Supabase Postgres holds verified compressed SQLite snapshots rather than individual tuition tables. Supabase Storage holds private files. Every database-changing request uploads a compressed snapshot; each cold start downloads all private files. This is intended for a small academy, one active writer. Hard limits: 4 MiB compressed / 128 MiB uncompressed database, 10,000 private files, 50 MiB per file, 50 queued API requests. Large datasets, frequent practice saves and logins can consume bandwidth and become slow. Monitor usage; move to a native hosted database architecture before these limits. Unreferenced private objects are retained instead of automatically deleted.

Free plans have availability and quota limits. Render Free may sleep; Supabase Free may pause for low activity. A paused/unreachable project causes a safe startup/save failure. Resume it in the Supabase dashboard, check quotas, then redeploy. This code is locally tested; your real Render/Supabase account connection still requires deployment verification.

Official references:
- https://render.com/docs/free
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/storage/security/access-control
