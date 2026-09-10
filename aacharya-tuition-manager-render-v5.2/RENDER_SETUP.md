# Render Setup — Integrated v5.2 + Parent Portal Extension 1.0

## New deployment (simplest)

Use the root `render.yaml` as a Render Blueprint. It defines both services:

1. `aacharya-tuition-manager`
2. `aacharya-parent-portal`

During the initial Blueprint setup, enter:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

The Blueprint automatically:

- generates session secrets
- generates the Parent Portal integration secret
- passes that secret securely to the main manager
- passes each Render service URL to the other service
- uses the same admin email/password for `/admin` and `/extension-admin`
- mounts a separate persistent disk at `/var/data` for each service

## If your existing v5 service already contains real data

Do **not** delete the existing service or its disk.

1. Push this integrated project to the same GitHub repository your current v5 service already deploys from.
2. Let the current main service redeploy; it will gain the Parent Portal bridge without replacing its existing database.
3. Then create the Parent Portal as a second Render Web Service from the same repository with:
   - Root Directory: `parent-portal-extension`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Persistent disk mount: `/var/data`
4. Parent service environment:
   - `NODE_VERSION=24.20.0`
   - `NODE_ENV=production`
   - `DATA_DIR=/var/data`
   - `PUBLIC_BASE_URL=<the parent portal Render URL>`
   - `EXTENSION_ADMIN_NAME=Aacharya Sudheer`
   - `EXTENSION_ADMIN_EMAIL=<same email as main admin>`
   - `EXTENSION_ADMIN_PASSWORD=<same password as main admin>`
   - `EXTENSION_SESSION_SECRET=<long random secret>`
   - `MAIN_MANAGER_URL=<your existing main manager Render URL>`
   - `PARENT_PORTAL_SECRET=<long random integration secret>`
   - `INVITE_VALID_DAYS=7`
   - `COURSE_GRACE_DAYS=7`
   - `CREDENTIAL_PURGE_DAYS=30`
   - `MAX_PROOF_BYTES=5242880`
5. Main service environment — add only:
   - `PARENT_PORTAL_URL=<parent portal Render URL>`
   - `PARENT_PORTAL_SECRET=<same integration secret as above>`
6. Redeploy both services.

## Check after deployment

Main manager health:
`https://<main>.onrender.com/api/health`

Parent extension health:
`https://<parent>.onrender.com/api/health`

Main admin:
`https://<main>.onrender.com/admin`

Parent portal:
`https://<parent>.onrender.com/parent`

Parent extension admin:
`https://<parent>.onrender.com/extension-admin`

## First integration test

1. Submit a student admission on the main public form.
2. Accept it in the main `/admin` page.
3. Open `/extension-admin` on the Parent Portal service.
4. The student should appear and an invitation should exist.
5. Copy/regenerate the invitation and create a parent account.
6. Create an enrollment with start/end dates.
7. In the Parent Portal, submit a payment with a screenshot/PDF.
8. In Extension Admin, approve the proof.
9. Confirm the payment appears in the main v5 Payments section and in `Aacharya_Tuition_Master_v5.xlsx`.
