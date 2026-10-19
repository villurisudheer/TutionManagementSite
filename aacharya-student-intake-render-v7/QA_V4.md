# QA — Aacharya Tuition Manager v4

## Application checks

- Main project JavaScript syntax: passed.
- Parent-extension JavaScript syntax: passed (extension retained from the supplied v3 project).
- Main end-to-end smoke test: passed.
- Login/logout: passed.
- Public intake submission and acceptance: passed.
- Student creation: passed.
- Class creation and duration calculation: passed.
- Attendance creation and attendance percentage: passed.
- Fee creation: passed.
- Payment creation with payer name/relation, receiver and transaction reference: passed.
- Test result and percentage calculation: passed.
- Dashboard API: passed.

## V4 Excel checks

- Workbook generated successfully as `Aacharya_Tuition_Master_v4.xlsx`.
- Workbook size in QA sample: approximately 244 KB.
- 27 worksheet names detected successfully.
- Workbook re-opened successfully using an independent XLSX parser.
- Executive Dashboard rendered successfully with V4 styling.
- Formula/error scan returned no `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?` or `#N/A` cells.
- Payment ledger includes `Paid By`, `Payer Relation`, `UTR / Transaction Reference` and `Received By`.
- Student Master exports all stored student/parent/contact fields.
- Student 360 includes finance, classes/hours, attendance and test analytics.
- Data Quality sheet is generated automatically.
- Detailed sheets include frozen headers, auto-filters, column sizing and status formatting.

## Workbook sheet count

27 sheets:

Workbook Guide, Executive Dashboard, Student Master, Student 360, Parent Directory, Academic Profiles, Class Register, Class Hours Summary, Monthly Class Hours, Attendance Register, Attendance Summary, Monthly Attendance, Fee Register, Payments Ledger, Student Finance, Outstanding Dues, Monthly Collections, Payment Methods, Test Register, Performance Summary, Subject Performance, Intake Submissions, Admissions Pipeline, Data Quality, Audit Log, System Settings, Data Dictionary.
