# V6 Excel Guide

Workbook: `Aacharya_Tuition_Master_v6.xlsx`

V6 preserves all **27 V5.3 sheets** and appends **9 V6 sheets**, for **36 total**.

## Existing V5.3 sheets preserved

Workbook Guide, Executive Dashboard, Student Master, Student 360, Parent Directory, Academic Profiles, Class Register, Class Hours Summary, Monthly Class Hours, Attendance Register, Attendance Summary, Monthly Attendance, Fee Register, Payments Ledger, Student Finance, Outstanding Dues, Monthly Collections, Payment Methods, Test Register, Performance Summary, Subject Performance, Intake Submissions, Admissions Pipeline, Data Quality, Audit Log, System Settings, Data Dictionary.

## V6 sheets

### Parent Accounts
Integrated parent-account status, contact, linked-child count, last login and lifecycle timestamps.

### Parent Student Links
Explicit parent-to-student authorization map and relationship.

### Enrollments
Every course enrollment with start date, end date, grace date and lifecycle status.

### Course History
Ended/completed courses for all students. A student who has rejoined can appear here for older courses while still remaining a current student elsewhere.

### Old Records Alumni
**True alumni only.** A student appears only when they have enrollment history but no Upcoming, Active or Grace enrollment. A rejoined/current student is automatically excluded.

### Payment Proofs
Metadata for the compulsory parent screenshot/receipt and its verification status. Binary proof images/PDFs are intentionally not embedded in the workbook.

### Historical Payments
Superseded or deleted payment versions. The live Payments page and Payments Ledger show the latest record; this sheet retains older values, edit reason, editor and archive timestamp.

### Renewal Requests
Parent course renewal requests and academy decisions.

### Portal Activity
Parent-portal actions from the shared audit trail.

## Current students versus alumni

Current operational student sheets exclude true alumni once enrollment lifecycle data is available. Students with no V6 enrollment configured are treated as legacy/current rather than automatically archived.

Historical class, attendance, fee, payment and test records remain in their detailed registers; V6 does not delete academy history.

## Compatibility

V6 uses the repaired V5.3 XLSX package writer. The automated test validates 36 worksheets and package integrity. The included fake-data sample is:

`sample/Aacharya_Tuition_Master_v6_FAKE_DATA_SAMPLE.xlsx`
