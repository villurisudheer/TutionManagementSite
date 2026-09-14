# V7 master workbook

The master export contains **44 sheets**. All original 36 names and the supplied `lib/xlsx-safe.js` writer are retained. Data changes queue a rebuild; harmless page reads do not rebuild Excel. A failed workbook write cannot undo saved academy data. Generated output is written to a temporary path, package-validated, then atomically renamed.

The persistent filename `Aacharya_Tuition_Master_v6.xlsx` is intentionally retained for disk compatibility; the browser download is named for V7. The workbook's guide/dashboard identify version 7 and 44 sheets.

## Original worksheets

1. Workbook Guide
2. Executive Dashboard
3. Student Master
4. Student 360
5. Parent Directory
6. Academic Profiles
7. Class Register
8. Class Hours Summary
9. Monthly Class Hours
10. Attendance Register
11. Attendance Summary
12. Monthly Attendance
13. Fee Register
14. Payments Ledger
15. Student Finance
16. Outstanding Dues
17. Monthly Collections
18. Payment Methods
19. Test Register
20. Performance Summary
21. Subject Performance
22. Intake Submissions
23. Admissions Pipeline
24. Data Quality
25. Audit Log
26. System Settings
27. Data Dictionary
28. Parent Accounts
29. Parent Student Links
30. Enrollments
31. Course History
32. Old Records Alumni
33. Payment Proofs
34. Historical Payments
35. Renewal Requests
36. Portal Activity

## Added worksheets

Teachers, Batches, Subjects, Assignments, Announcements, Users & Roles, Backup History, Notification Summary.

## Operational versus historical reporting

Student Master and Student 360 represent current students; Old Records Alumni represents true alumni only. A returning student with a current/upcoming/grace/hold enrollment is excluded from Alumni. Course History retains ended courses for every student.

Payments Ledger, collections and current finance use current payment records only. Prior values remain in Historical Payments. Financial liabilities remain visible even for alumni. Fee Register uses the website's linked-first/FIFO allocation, rather than treating a submitted proof as income. Class-hour sheets record student-hours; the Teachers sheet and teacher timesheets deduplicate shared batch sessions.

Attendance includes the retained daily history and new per-class records. A day with explicit class attendance supersedes its old day-only entry for calculation, while the original row remains in SQLite. Cancelled classes do not reduce attendance. Present alone counts in the numerator.

Proof images/PDF binaries are never embedded. Workbook proofs include safe metadata and official payment references. Account worksheets exclude password hashes and session/invitation tokens. The workbook still contains private student and financial information and should only be shared with authorized staff.

## Styling and validation

The retained writer provides frozen headers, filters, alternating rows, wrapped text, print settings, tab colours, amount/number/percentage styles and INR formatting. Dates are explicit ISO text where preserving the original format avoids ambiguous spreadsheet date conversion. Report calculations use database values rather than fragile cross-sheet formulas.

Release QA generates a workbook from realistic artificial V6.1/V7 workflows, validates ZIP CRCs and every XML part, checks all expected sheet names and merged ranges, imports it with independent openpyxl, and scans for spreadsheet error cells/tokens. It also asserts that workbook generation does not change application data counts.

Microsoft Excel and Google Sheets were not available for a native application/import test in this environment. Independent validation passed without parser warnings; that is the tested compatibility evidence, not a claim of a native Excel/Google Sheets run. Before sharing an academy workbook widely, open it in the spreadsheet application you use and keep the SQLite/complete-data backup as the recovery source.
