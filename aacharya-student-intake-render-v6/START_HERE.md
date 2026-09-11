# Aacharya Tuition Manager V6 — Start Here

V6 is a **new sibling version** built from the V5.3 codebase. It does not require deleting the V5.3 folder from GitHub.

## What stays from V5.3

- Student admission form and admin manager
- Students, classes, attendance, fees, payments and tests
- V5.2 light/dark Academy Pop theme and responsive mobile/tablet/desktop modes
- Exact Aacharya app icon (`public/aacharya-app-icon.png`)
- SQLite data model and Render persistent-disk workflow
- The repaired V5.3 XLSX writer and all 27 existing workbook sheets
- The old `parent-portal-extension/` folder is retained in the package for backward reference; V6 does **not** need to run it.

## What V6 adds

- Integrated Parent Portal at `/parent` on the **same website/service**
- Invitation-only parent signup at `/parent/signup?invite=...`
- Multiple children per parent with backend permission checks
- Course enrollments, end-date warning, grace period and renewal requests
- Compulsory PNG/JPG/WEBP/PDF payment screenshot or receipt for parent submissions
- Admin proof verification before an official payment is created
- Admin payment editing with a compulsory reason
- Current website shows only the latest payment version; superseded versions remain in Historical Payments
- True-alumni-only archive logic; current/rejoined students are excluded from Old Records Alumni
- Course History preserves completed courses even after a student rejoins
- 9 new workbook sheets, making **36 sheets total**

## GitHub layout

Keep your existing version and add this as a new folder:

```text
TutionManagementSite/
├── aacharya-tuition-manager-render-v5.3/       ← keep this
└── aacharya-student-intake-render-v6/          ← add this V6 folder
```

The V5.3 baseline checksums used when starting V6 are included in `V5_3_BASELINE_SHA256.txt`.

## Existing Render service upgrade

If you want the same live service/data to run V6:

1. Upload/commit this whole folder to GitHub as `aacharya-student-intake-render-v6`.
2. In the existing Render Web Service, change **Root Directory** to:
   `aacharya-student-intake-render-v6`
3. Keep the same persistent disk mounted at `/var/data`.
4. Keep your existing `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET` and `ADMIN_SYNC_KEY`.
5. Add a new secret environment variable: `PARENT_SESSION_SECRET`.
6. Add the V6 lifecycle variables listed in `RENDER_SETUP.md`.
7. Redeploy.
8. Check `/api/health`; it should report version `6.0.0` and `excelSheets: 36`.

**Do not create a second Parent Portal Render service.** The parent portal is now integrated into the main V6 app.

## Main URLs

- Public admission form: `/`
- Admin: `/admin`
- Parent portal: `/parent`
- Parent invitation signup: `/parent/signup?invite=...`
- Health check: `/api/health`

## Excel

The live workbook is:

`Aacharya_Tuition_Master_v6.xlsx`

It contains the original 27 V5.3 sheets plus 9 V6 portal/history sheets. See `V6_EXCEL_GUIDE.md`.

## Test

From the V6 folder:

```bash
npm install
npm test
```

The V6 smoke test covers parent invitations, parent permissions, compulsory proof, payment verification, payment version history, alumni/rejoin rules, and the 36-sheet workbook.
