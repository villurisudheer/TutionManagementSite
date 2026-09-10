> **Integrated build:** Start with `START_HERE.md`. This repository now contains the v5 Tuition Manager plus Parent Portal Extension 1.0.

# Aacharya Tuition Manager v5.3 — Render + Comprehensive Excel Intelligence

A customizable light/dark tuition-management web app for **AACHARYA LEARNING ACADEMY**. It runs as one Render Web Service and includes:

- Private admin tuition manager at `/admin`
- Public student/parent information form at `/`
- Students with detailed student + parent information
- Classes with automatic duration calculation
- Attendance counter and per-student percentage
- Fee records
- Payments with **who paid**, relation, method, transaction reference, billing period, and **who received the payment**
- Tests/results with automatic percentage and grade
- Admissions inbox: Accept / Reject public form submissions
- Audit log in Excel
- A master `.xlsx` workbook that is rebuilt after every important data change
- **Light / Dark / Follow-device themes** with one-click theme toggle
- **Automatic Mobile / Tablet / Desktop layouts** plus manual layout override
- Per-device customization for accent colour, text size, information density, corner style, contrast, motion, and background-image darkness
- Mobile card-style student/class/test lists instead of tiny desktop tables


## V5 adaptive interface

V5.3 keeps the comprehensive workbook and adds a new responsive presentation layer. Desktop uses a permanent left navigation rail and wide data tables; tablet uses a touch-friendly horizontal navigation bar and balanced multi-column cards; mobile switches to a compact section selector and converts the major data tables into readable stacked cards.

Appearance preferences are stored in the current browser so a phone can use different settings from a computer. Available controls include theme, accent colour, layout mode, density, text size, corner style, contrast, motion and background overlay strength.

## V5 comprehensive Excel workbook

V5 replaces the earlier plain export with a styled **27-sheet academy workbook**. It includes an Executive Dashboard, Student 360, parent directory, academic profiles, class-hour analytics, monthly attendance, detailed fee aging, payer/receiver payment ledger, outstanding dues, monthly collections, payment-method analysis, performance analytics, admissions pipeline, data-quality checks, audit history, settings and a data dictionary.

Detailed registers retain the underlying source fields while analytics sheets add derived metrics. Tables use frozen headers, filters, professional formatting, Indian-currency formatting and status highlighting. The workbook is regenerated automatically after important database changes.

## Excel reliability fix in V5.3

V5.3 replaces the earlier hand-built XLSX package writer with a stricter standards-compliant writer. The previous file could be accepted by permissive parsers but still trigger a repair/corruption warning in Microsoft Excel or Google Sheets. The new writer corrects worksheet XML element ordering, uses shared strings, emits a standard theme/styles relationship, writes valid ZIP timestamps with DEFLATE compression, strips XML-invalid control characters, enforces Excel cell-text limits, and runs a package integrity validator during `npm test`.

The application database is unchanged. This is an export-layer repair, so existing tuition data remains compatible.

## Excel workbook

The server stores a live master workbook at:

`DATA_DIR/Aacharya_Tuition_Master_v5_3.xlsx`

On Render with the recommended persistent disk:

`/var/data/Aacharya_Tuition_Master_v5_3.xlsx`

The workbook contains **27 sheets**. See `V5_EXCEL_GUIDE.md` for the full sheet-by-sheet description. The major groups are dashboards/guide, student master information, parent/academic directories, class-hour analytics, attendance analytics, detailed fees/payments/dues/collections, test performance, admissions, data quality, audit/settings and a data dictionary.

The **Payments Ledger** prominently includes payer name, payer relation, payment method, transaction/UTR reference, billing period, receipt number, and the person who received the payment.

The admin can download the current workbook from **Settings & Excel → Download Aacharya_Tuition_Master_v5_3.xlsx**.

## Local run

Requires Node.js 24.x.

```bash
npm install
npm start
```

Open:

- Student form: `http://localhost:3000/`
- Admin manager: `http://localhost:3000/admin`

Default local login if environment variables are not set:

- Email: `admin@example.com`
- Password: `ChangeMe123!`

For real deployment, set your own password.

## Render deployment — easiest method

### Option A: Blueprint

1. Put this folder at the **root of a GitHub repository**.
2. Keep `render.yaml` at the GitHub repository root.
3. In Render, choose **New → Blueprint** and connect the repository.
4. Render asks you to enter values for:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `ADMIN_SYNC_KEY`
5. Deploy.
6. Open the Render URL for the public student form.
7. Add `/admin` to the same URL for your private manager.

Example:

- Public: `https://your-service.onrender.com/`
- Admin: `https://your-service.onrender.com/admin`

### Option B: Existing repository subfolder

If this project is inside a larger GitHub repository, set **Root Directory** in Render to this folder, then use:

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/api/health`

## IMPORTANT — persistent storage

The app uses SQLite for the live application data and automatically creates the Excel workbook from that data. Both files need persistent storage.

Recommended Render persistent-disk mount path:

`/var/data`

The included `render.yaml` attaches a 1 GB disk and sets `DATA_DIR=/var/data`.

Without persistent storage, the web service can still run, but application data and the generated Excel workbook can be lost after redeploys/restarts.

## Environment variables

```text
NODE_VERSION=24.14.1
NODE_ENV=production
DATA_DIR=/var/data
ADMIN_NAME=Aacharya Sudheer
ADMIN_EMAIL=your-private-admin-email
ADMIN_PASSWORD=your-private-admin-password
SESSION_SECRET=long-random-secret
ADMIN_SYNC_KEY=long-random-sync-key
```

`ADMIN_SYNC_KEY` is kept for compatibility with the earlier standalone Windows manager's Render-import feature. Students never need this key.

## Public student form privacy

The public page only collects tuition-related information. It does not expose the admin dashboard or other students' data. Do not ask students to submit passwords, banking credentials, government ID numbers, or other unnecessary sensitive information.

## Test

```bash
npm test
```

The smoke test checks login, public intake, student creation, fees, payment payer/receiver details, attendance, test percentage, Excel workbook creation, Excel sheet names, and logout.

---

# Integrated Parent Portal Extension 1.0

This repository now also contains `parent-portal-extension/` and a combined Render Blueprint.

The main v5 application only gains an isolated bridge module and admission hook. Parent accounts, invitations, enrollment lifecycle, renewal requests, notifications, and payment-proof uploads remain inside the extension.

The root `render.yaml` automatically connects the two Render services using Render service environment references. `PARENT_PORTAL_SECRET` is generated by Render and passed to the main manager without being committed to GitHub.

See `START_HERE.md` for the shortest deployment procedure.

### V5.1 academy icon
The supplied `aacharya-app-icon.png` is used unchanged for browser tabs, bookmarks, Apple touch icons, and web-app manifest icon metadata across the main manager and student form. The Parent Portal extension uses the same supplied PNG.
