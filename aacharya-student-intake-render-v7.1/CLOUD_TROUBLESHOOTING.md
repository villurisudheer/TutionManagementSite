# V7 startup troubleshooting — 7.1.1

The build and `npm ci --omit=dev` can succeed even when cloud configuration is incomplete. `.env not found. Continuing without it.` is normal on Render: add secrets under the service **Environment** settings. The port-scanning warning follows startup failure; the server already uses `process.env.PORT || 3000`.

## Required Render Environment settings

| Name | Value |
|---|---|
| NODE_ENV | production |
| STORAGE_MODE | supabase |
| SUPABASE_URL | Project URL, e.g. https://YOUR-PROJECT.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | Server-only legacy service_role JWT **or** new sb_secret_... key |
| ADMIN_EMAIL | Administrator email |
| ADMIN_PASSWORD | Private administrator password |
| SESSION_SECRET | Private random string, at least 24 characters |

Alternatively use SUPABASE_SECRET_KEY instead of SUPABASE_SERVICE_ROLE_KEY. Set one key variable; do not configure conflicting values. Do not use the public anon/publishable key. Do not paste keys in chat or commit them to GitHub.

Render's existing service does not necessarily receive configuration changes simply because you uploaded render.yaml. Check these settings directly, save them and redeploy. Keep Root Directory as your actual project folder, Build Command `npm ci --omit=dev`, Start Command `npm start`.

## Interpret the new log code

- CLOUD_CONFIG_MISSING: the next line lists the exact missing environment variable names; values are hidden.
- CLOUD_STORAGE_MODE / CLOUD_SECRET_SHORT / CLOUD_ADMIN_PASSWORD: correct that environment setting.
- CLOUD_URL_INVALID: copy the Supabase project HTTPS URL, not a dashboard URL; remove quotes and paths.
- CLOUD_KEY_PUBLIC / CLOUD_KEY_FORMAT / CLOUD_KEY_CONFLICT: correct the server key and variable selection.
- CLOUD_AUTH_REJECTED: key is rejected, revoked, or belongs to another project. Copy the matching server key.
- CLOUD_BUCKET_MISSING: run `cloud/supabase.sql` or create private bucket `aacharya-private`.
- CLOUD_BUCKET_PUBLIC: make the bucket private.
- CLOUD_SQL_MISSING: run `cloud/supabase.sql` successfully in the same Supabase project's SQL editor.
- CLOUD_NOT_INITIALIZED: SQL exists but no database snapshot has been imported yet. Follow the one-time import below.
- CLOUD_NETWORK / CLOUD_TIMEOUT / CLOUD_HTTP_UNAVAILABLE: check URL, paused project, quotas and network/service status.
- CLOUD_PRIVATE_FILE_MISSING / CLOUD_INTEGRITY: recover the complete verified backup, including private files. Do not initialize an empty academy.
- CLOUD_STARTUP_FAILED: note the named stage and run the read-only diagnosis; review migration/recovery guidance.

## One-time database import

On your computer with Node.js 24, in the project folder, create a private `.env` with the same cloud settings. Run:

```sh
npm ci
npm run cloud:diagnose
```

Diagnosis is read-only: it does not claim the writer, initialize the academy or migrate records. If it reports CLOUD_SQL_MISSING, run the supplied SQL in Supabase, then repeat.

If it reports CLOUD_NOT_INITIALIZED and you have existing data, extract a complete downloaded backup so its root contains `aacharya_tuition.sqlite` and private file directories, then run:

```sh
npm run cloud:import -- --from "C:/path/to/complete-backup"
npm run cloud:diagnose
```

For a genuinely new academy with no existing records only:

```sh
npm run cloud:import -- --new --confirm-empty
npm run cloud:diagnose
```

Do not use empty initialization merely to bypass missing data. Import refuses to overwrite an initialized cloud academy. After diagnosis succeeds, redeploy Render. If restore/migration/first-commit verification then fails, the new log names that stage.

If asking for help, share only the new `[Aacharya cloud]` lines, never keys or complete environment dumps.

## Fix details

7.1.0 hid all production startup errors behind one generic message. 7.1.1 adds controlled error codes, missing-variable names, stage and HTTP status without logging secret values/provider bodies. It also sends modern sb_secret_... keys on the apikey header only; legacy JWT service_role keys retain bearer authentication. Existing database snapshots, proof files, migrations and overwrite safeguards are unchanged.

References:
- https://render.com/docs/configure-environment-variables
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
