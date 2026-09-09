# Changelog

## v4.0.0 — Comprehensive Excel Intelligence

- Rebuilt the master Excel export as a styled 27-sheet operational workbook.
- Added Workbook Guide and Executive Dashboard sheets.
- Added Student 360, Parent Directory and Academic Profiles.
- Added class-hour summaries and monthly class-hour analytics.
- Added monthly attendance analytics.
- Added fee aging, effective fee status, student finance, outstanding dues, monthly collections and payment-method analysis.
- Expanded payment ledger to prominently include who paid, payer relation, receiver and transaction reference.
- Added student and subject test-performance analytics.
- Added Admissions Pipeline and automatic Data Quality checks.
- Added a Data Dictionary explaining important calculated fields.
- Added professional Excel styling, frozen headers, filters, alternating rows, status highlighting, currency/percentage formats and sheet tab colors.
- Renamed generated workbook to `Aacharya_Tuition_Master_v4.xlsx`.

## v3.0.0

- Converted the tuition manager from browser-local storage to a Render-hosted web application.
- Added private `/admin` manager and public `/` student/parent intake form.
- Added persistent SQLite storage under `DATA_DIR`.
- Added automatic master Excel workbook generation after every important mutation.
- Added detailed Students, Classes, Attendance, Fees, Payments, Tests, Intake, Settings and Audit data.
- Payments now record payer name/relation and received-by person.
- Added attendance counters and per-student attendance percentage.
- Added Finance Summary and Attendance Summary Excel sheets.
- Added old Windows-manager compatibility endpoint using `ADMIN_SYNC_KEY`.
- Removed external runtime dependencies; the app uses Node built-ins plus in-project HTTP/XLSX helpers.
- Added an end-to-end smoke test.

## v3.1.0 — Integrated Parent Portal Extension package
- Embedded Parent Portal Extension 1.0 in `parent-portal-extension/`.
- Added isolated parent integration bridge to the uploaded v3 manager.
- Added automatic invitation notification after accepted admissions.
- Added parent-safe child summary integration endpoint.
- Added idempotent verified parent-payment import into the main payment ledger.
- Added one combined Render Blueprint that auto-wires service URLs and the integration secret.
- Parent extension admin uses the same Render-managed admin credentials as the main manager.
