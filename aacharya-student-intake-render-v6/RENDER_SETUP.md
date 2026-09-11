# Render Setup — Aacharya Tuition Manager V6

V6 runs the public form, admin manager and Parent Portal in **one** Node Web Service.

## Recommended: upgrade your existing service while preserving its disk

Keep the existing Render service and persistent disk. In Render change only the code/root directory to the new V6 GitHub folder.

### Build settings

- Runtime: **Node**
- Branch: `main`
- Root Directory: `aacharya-student-intake-render-v6`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

### Environment variables

Keep the existing values where already configured and add the V6 values:

```text
NODE_VERSION=24.20.0
NODE_ENV=production
DATA_DIR=/var/data
ADMIN_NAME=Aacharya Sudheer
ADMIN_EMAIL=<your admin email>
ADMIN_PASSWORD=<your strong admin password>
SESSION_SECRET=<long random secret>
ADMIN_SYNC_KEY=<long random secret>
PARENT_SESSION_SECRET=<different long random secret>
INVITE_VALID_DAYS=7
COURSE_GRACE_DAYS=7
CREDENTIAL_PURGE_DAYS=30
MAX_PROOF_BYTES=5242880
```

Do **not** put secrets in GitHub/public JavaScript.

### Persistent disk

Keep/mount the disk at:

```text
/var/data
```

V6 stores:

```text
/var/data/aacharya_tuition.sqlite
/var/data/Aacharya_Tuition_Master_v6.xlsx
/var/data/payment-proofs-v6/...
```

Using the same `/var/data` disk lets V6 open the existing V5.3 database and add its new tables without deleting the V5.3 tables.

## No separate parent service

V6 does not require these old cross-service settings:

```text
PARENT_PORTAL_URL
PARENT_PORTAL_SECRET
MAIN_MANAGER_URL
```

The old extension code remains in the package only as a preserved reference.

## Verify after deploy

Open:

```text
https://YOUR-SERVICE.onrender.com/api/health
```

Expected key values:

```json
{
  "ok": true,
  "version": "6.0.0",
  "excelFile": "Aacharya_Tuition_Master_v6.xlsx",
  "excelSheets": 36
}
```

Then test:

- `/admin`
- `/parent`
- accept a test admission and generate/copy its parent invite
- parent signup from the invitation
- add an enrollment
- submit a payment proof
- approve it in Admin → Parent Portal
- edit that payment with a reason and confirm its old value appears in Historical Payment Records
- download the V6 Excel workbook
