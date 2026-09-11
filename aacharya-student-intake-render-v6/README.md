# Aacharya Tuition Manager V6

**Integrated Parent Portal + Enrollment Lifecycle + Historical Payments + True Alumni Archive + 36-sheet Excel**

V6 is an additive evolution of the V5.3 tuition manager. The V5.3 source remains a separate version; V6 is intended to live in the new GitHub folder `aacharya-student-intake-render-v6`.

## Architecture

V6 deliberately removes the operational need for a separate Parent Portal service:

```text
ONE RENDER WEB SERVICE
       │
       ├── /                 Public admission
       ├── /admin            Academy administration
       ├── /parent           Parent portal
       └── /parent/signup    Invitation signup
       │
       ├── ONE SQLite database in DATA_DIR
       ├── private payment proof files in DATA_DIR/payment-proofs-v6
       └── ONE Aacharya_Tuition_Master_v6.xlsx workbook
```

The prior `parent-portal-extension/` directory is preserved for backward reference but is not needed by the V6 deployment.

## Integrated Parent Portal

An accepted admission can generate a one-time parent invitation. Parent signup is invitation-only. Parent accounts are linked to students through a dedicated permission table, allowing one parent to manage multiple children while preventing access to unrelated students.

Parents can view linked children's classes, attendance, fees/payment totals, official payment history, recent tests and course enrollments. They can submit renewal requests and payment proof.

## Compulsory Payment Proof

A parent payment submission is rejected unless it includes a PNG, JPG/JPEG, WEBP or PDF proof. The default maximum is 5 MB.

A submitted proof is **not** automatically an official payment. It enters the admin verification queue as Pending. Admin can:

- open the private proof
- approve it
- reject it
- ask for a new proof

Only approval creates the official payment row and receipt. Proof files are served only through authenticated routes and are never embedded as binary images in Excel.

## Payment Editing and History

Admin may edit a current payment. `Reason for Edit` is compulsory. Before the current payment is updated, V6 snapshots the previous version into `payment_history`.

Therefore:

- the website/payment ledger shows only the latest current record
- the old value remains available in Historical Payment Records
- Excel `Payments Ledger` contains current values
- Excel `Historical Payments` contains superseded/deleted values
- edits to verified parent payments can be flagged `Edited after verification`

The original proof remains linked through the proof/payment metadata.

## Enrollment and Alumni Rules

V6 uses course enrollments with start, end and grace dates. Lifecycle status is calculated as Upcoming, Active, Grace or Ended.

A student is a **true alumnus only when**:

1. the student has at least one enrollment in history; and
2. there is no Upcoming, Active or Grace enrollment.

This means a student who joins again is immediately a current student and is excluded from `Old Records Alumni`. Their completed courses remain in `Course History`.

Legacy V5.3 students with no enrollment configured are treated as current/legacy, not auto-archived.

## Course End and Renewal

- During the final 7 days of an active course, the parent receives a course-ending notification.
- After the end date, the enrollment remains in Grace for the configured number of days (default 7).
- A parent can submit a renewal request.
- Admin can approve the request and create the next enrollment, or reject it with a note.
- If all linked children become alumni and no renewal is pending, the parent account is disabled.
- Disabled credentials are eligible for purge after the configured retention period (default 30 days); academy/student/financial history remains.

## Excel V6

V6 keeps all 27 V5.3 sheets and adds:

1. Parent Accounts
2. Parent Student Links
3. Enrollments
4. Course History
5. Old Records Alumni
6. Payment Proofs
7. Historical Payments
8. Renewal Requests
9. Portal Activity

Total: **36 sheets**.

The workbook continues using the V5.3 standards-compliant XLSX writer. See `V6_EXCEL_GUIDE.md` and `EXCEL_COMPATIBILITY.md`.

## UI

V6 retains the prior responsive/customizable UI and exact app icon. Parent pages also use the Academy Pop palette:

- Light: `#E6E0D1` off-white with red/blue accents
- Dark: `#000000` true black with navy/maroon accents

## Security Notes

- Admin routes use the existing admin session.
- Parent routes use a separate HttpOnly parent session cookie.
- Parent/student access is enforced in backend queries, not only hidden in the UI.
- Parent passwords use scrypt hashes.
- Payment proof files are private and require authenticated routes.
- Use strong Render secrets for `SESSION_SECRET`, `ADMIN_SYNC_KEY` and `PARENT_SESSION_SECRET`.

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Verification

```bash
npm test
```

The smoke test creates only temporary fake data and validates the integrated V6 lifecycle and workbook.
