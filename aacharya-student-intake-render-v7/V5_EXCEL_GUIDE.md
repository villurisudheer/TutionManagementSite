# V5 Excel Master Workbook

Generated file: `Aacharya_Tuition_Master_v5_3.xlsx`

The workbook is rebuilt automatically after important changes in the Tuition Manager and can also be rebuilt/downloaded from **Admin → Settings & Excel**.

## 27 sheets

### Start here
1. **Workbook Guide** — sheet map, usage notes and privacy reminder.
2. **Executive Dashboard** — students, active count, classes/hours, attendance, collections, outstanding balance, test/admission indicators, largest dues, recent payments and upcoming classes.

### Student information
3. **Student Master** — every stored student field including DOB, school, board, grade, contacts, parent contacts, address, subjects, fee plan, status, notes and record metadata.
4. **Student 360** — one comprehensive row per student combining academics, contacts, fees, payments, classes, completed hours, attendance and test performance.
5. **Parent Directory** — parent/guardian and linked student contact directory.
6. **Academic Profiles** — school, board, grade, stream, subjects and academic notes.

### Classes
7. **Class Register** — complete class-level data.
8. **Class Hours Summary** — student/subject totals for classes and completed hours.
9. **Monthly Class Hours** — monthly class and hour analytics by student and subject.

### Attendance
10. **Attendance Register** — every attendance record.
11. **Attendance Summary** — total Present/Absent/Late/Excused and percentage per student.
12. **Monthly Attendance** — monthly attendance percentage and status counts.

### Finance
13. **Fee Register** — fee records, linked payments, outstanding amount, effective status, overdue days and aging bucket.
14. **Payments Ledger** — receipt, student, linked fee, amount, date, **Paid By**, **Payer Relation**, method, UTR/reference, billing period, **Received By**, notes and timestamp.
15. **Student Finance** — fee plan, billed, paid, outstanding/credit, payment count, last payment and oldest due.
16. **Outstanding Dues** — positive balances sorted for follow-up, including collection priority.
17. **Monthly Collections** — monthly collection totals and Cash/GPay/PhonePe/UPI/Bank/Other split.
18. **Payment Methods** — transaction count, unique students, total, average and collection share by method.

### Tests and performance
19. **Test Register** — complete result history.
20. **Performance Summary** — test count, average, best, lowest and latest result per student.
21. **Subject Performance** — aggregate results and pass rate by subject.

### Admissions and administration
22. **Intake Submissions** — every public-form field and admission status.
23. **Admissions Pipeline** — submission counts and latest activity by status.
24. **Data Quality** — automatically flags missing contacts, missing academic details, unreferenced e-payments, zero-duration completed classes and other review items.
25. **Audit Log** — application activity history.
26. **System Settings** — non-secret stored settings. Environment passwords/secrets are intentionally excluded.
27. **Data Dictionary** — explains important calculations and exported fields.

## Formatting improvements

- styled title/subtitle areas
- executive KPI dashboard
- frozen report headers
- filters on detailed tables
- alternating report rows
- Indian Rupee number formatting for detailed finance sheets
- percentage formatting
- status/severity highlighting
- professional sheet tab colours
- sensible column widths and wrapped notes
- landscape print setup for wide reports

## Important financial interpretation

`Student Finance → Pending Balance` is total fees billed minus total payments received for that student.

`Fee Register → Linked Paid` uses payments explicitly linked to the individual fee via `fee_id`. Therefore fee-level and student-level balances can differ when a payment was recorded without linking it to a specific fee.

The workbook is a reporting/export layer. SQLite remains the live application database.
