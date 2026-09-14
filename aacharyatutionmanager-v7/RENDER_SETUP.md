# Render upgrade — preserve the existing service and disk

Use the existing web service. The intended repository structure is:

```text
TutionManagementSite/
  aacharya-student-intake-render-v6.1/
  aacharya-student-intake-render-v7/
```

| Setting | V7 value |
|---|---|
| Root Directory | `aacharya-student-intake-render-v7` |
| Runtime | Node |
| Node version | `24.19.0`, or compatible Node 24 patch |
| Build | `npm ci --omit=dev` |
| Start | `npm start` |
| Health check | `/api/health` |
| DATA_DIR | `/var/data` |
| Persistent disk | Keep the existing disk mounted at `/var/data` |
| NODE_ENV | `production` |
| PORT | Supplied by Render; fallback is 3000 |

Keep your existing service name, URL, disk, environment values and secrets. Root Directory changes which source folder is deployed; it does not require moving the SQLite database. No separate Parent Portal service is needed.

V7 requires private `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` (24+ characters) at production startup. Its first migration creates a hashed admin database account from those existing credentials. Later credential changes use Accounts & security. Parent passwords are preserved from V6.1. Old browser sessions require signing in again after the upgrade.

`render.yaml` is a reference for configuration/new services. For this upgrade, change the existing service in the Render dashboard. Do not create another service or disk just to switch source folders. If you manage the existing service through a Blueprint, preserve its actual service name and disk definition before syncing. The template intentionally retains the baseline service name rather than choosing a new identity.

The persistent disk must be available to the running web service. Only files under its mount path persist. This SQLite application is intended for one service instance; do not share a live SQLite file between multiple services. Render documents disk behavior and restrictions in [Persistent Disks](https://render.com/docs/disks).

The template uses the documented `rootDir`, build/start and disk fields. Refer to [Blueprint YAML Reference](https://render.com/docs/blueprint-spec) and [Node version selection](https://render.com/docs/node-version) if your Render account uses different service settings.

## After deployment

Open `/api/health`; expect version `7.0.0`, schema 7, `dbIntegrity: ok`, and no orphaned accepted admissions. Then sign in at `/admin` and inspect the detailed Data Safety Center. A missing `/var/data` mount in production creates an obvious warning; a missing existing database stops startup instead of creating an empty substitute.

Verify your academy's real counts and latest records, create a complete data backup, and check a generated workbook. This release was tested locally from an extracted package; it was not deployed into your Render account or tested against your live disk.

## Rollback

Keep V6.1 source untouched. Do not casually run old software against newly created V7 financial statuses: the old application does not understand every V7 rule. If rollback is necessary, stop writes and preserve a **complete V7 backup** first. Review any post-upgrade changes, the pinned pre-V7 snapshot, and the manual recovery procedure in DATA_SAFETY.md. Never overwrite the live database merely to change source versions.
