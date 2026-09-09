> **Integrated build:** Start with `START_HERE.md`. This repository now contains the v4 Tuition Manager plus Parent Portal Extension 1.0.

# Aacharya Tuition Manager v4 — Render + Comprehensive Excel Intelligence

A real dark-mode tuition-management web app for **AACHARYA LEARNING ACADEMY**. It runs as one Render Web Service and includes:

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


## V4 comprehensive Excel workbook

V4 replaces the earlier plain export with a styled **27-sheet academy workbook**. It includes an Executive Dashboard, Student 360, parent directory, academic profiles, class-hour analytics, monthly attendance, detailed fee aging, payer/receiver payment ledger, outstanding dues, monthly collections, payment-method analysis, performance analytics, admissions pipeline, data-quality checks, audit history, settings and a data dictionary.

Detailed registers retain the underlying source fields while analytics sheets add derived metrics. Tables use frozen headers, filters, professional formatting, Indian-currency formatting and status highlighting. The workbook is regenerated automatically after important database changes.

## Excel workbook

The server stores a live master workbook at:

`DATA_DIR/Aacharya_Tuition_Master_v4.xlsx`

On Render with the recommended persistent disk:

`/var/data/Aacharya_Tuition_Master_v4.xlsx`

The workbook contains **27 sheets**. See `V4_EXCEL_GUIDE.md` for the full sheet-by-sheet description. The major groups are dashboards/guide, student master information, parent/academic directories, class-hour analytics, attendance analytics, detailed fees/payments/dues/collections, test performance, admissions, data quality, audit/settings and a data dictionary.

The **Payments Ledger** prominently includes payer name, payer relation, payment method, transaction/UTR reference, billing period, receipt number, and the person who received the payment.

The admin can download the current workbook from **Settings & Excel → Download Aacharya_Tuition_Master_v4.xlsx**.

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

The main v4 application only gains an isolated bridge module and admission hook. Parent accounts, invitations, enrollment lifecycle, renewal requests, notifications, and payment-proof uploads remain inside the extension.

The root `render.yaml` automatically connects the two Render services using Render service environment references. `PARENT_PORTAL_SECRET` is generated by Render and passed to the main manager without being committed to GitHub.

See `START_HERE.md` for the shortest deployment procedure.
