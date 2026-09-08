# START HERE — Aacharya Tuition Manager v3 + Parent Portal Extension 1.0

This ZIP is now **one GitHub repository** containing both applications:

- Main Tuition Manager: repository root
- Parent Portal Extension: `parent-portal-extension/`
- One Render Blueprint: `render.yaml`

## What was changed in v3

The core v3 manager was left intact except for:

1. `integration/parent-portal-bridge.js`
2. A small bridge mount in `server.js`
3. A non-blocking notification when an admission is accepted
4. Secure parent-safe read/payment integration endpoints
5. Parent Portal environment wiring in `render.yaml`

If the Parent Portal is temporarily unavailable, accepting admissions in the main manager still works.

## Easiest Render deployment

1. Extract this ZIP.
2. Upload/push the **contents of this folder** to the GitHub repository used for the tuition manager.
3. In Render, create/sync a **Blueprint** using the repository's root `render.yaml`.
4. When Render asks for values, enter only your main admin credentials:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
5. Render creates/updates:
   - `aacharya-tuition-manager`
   - `aacharya-parent-portal`
6. The Blueprint automatically wires:
   - main-manager URL ↔ parent-portal URL
   - the shared `PARENT_PORTAL_SECRET`
   - the same admin email/password for the extension admin

You do **not** need to manually copy the integration secret or service URLs when deploying with this Blueprint.

## URLs after deployment

Main public student intake:
`https://<main-service>.onrender.com/`

Main private admin:
`https://<main-service>.onrender.com/admin`

Parent Portal:
`https://<parent-service>.onrender.com/parent`

Parent invitation signup links are generated automatically after accepted admissions.

Parent Extension Admin:
`https://<parent-service>.onrender.com/extension-admin`

Use the **same admin email/password** as the main Tuition Manager.

## First use

1. Submit a test admission from the main public form.
2. In `/admin`, accept the admission.
3. Open the Parent Extension Admin page.
4. Check **Invitations** and copy the generated signup link.
5. Open the link and create a parent account.
6. In Extension Admin, create an Enrollment with course start/end dates.
7. Login to `/parent` and verify Classes, Attendance, Fees, Payments and Tests.

## Payment proof flow

Parent Portal → Fees & Payments → Record Payment → screenshot/PDF required → Pending Verification.

Extension Admin → Payment Proofs → View Proof → Approve.

On approval, the extension securely creates the official payment in v3. That payment then appears in the main Tuition Manager and its Excel master workbook.

## Storage requirement

Both services use `/var/data` and each has its own 1 GB persistent disk in the Blueprint. This requires a paid Render web-service plan. Without persistent storage, databases and uploaded payment-proof files can be lost after a restart/redeploy.

## Important

Do not commit passwords or manually place secrets in source files. Render stores generated/shared secrets in service environment variables.
