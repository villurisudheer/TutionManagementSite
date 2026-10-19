# Using V7 every day

## Admin workspace

The main workspace adds live dashboard metrics/charts, current students and true alumni, all academic/financial modules, grouped global search, advanced record filters, pagination, CSV reports, Data Safety Center and accounts/settings. The original V6.1 management panels remain available under **Quick management tools**.

Major lists display **Active filters**, **Clear filters** and **Showing X of Y**. Search is scoped to the selected module; global search groups matches across student codes/names, contacts, parents, teachers, batches, subjects, receipts/UTRs, admissions, enrollments and tests. Use Clear filters after an unexpected empty list.

## Students and admissions

Accept a public admission once; the admission stays in history and the student appears with a permanent ID/code. An optional invitation can be copied and shared with the intended parent. Invitations are not automatically emailed.

Student 360 offers Overview, Courses, Classes, Attendance, Fees, Payments, Tests, Assignments, Parent Accounts, Documents, Activity and Notes. Edit, archive/reactivate, print, export, upload private documents/photos, and re-enroll from the profile/list. Re-enrollment adds another enrollment ID; it does not duplicate the permanent student identity.

A student is true Alumni only when they have enrollment history and no Upcoming, Active, Grace or On Hold enrollment. On Hold is conservatively treated as current. Rejoining immediately removes Alumni eligibility. Completed enrollments remain in Course History. Manual archive is a separate administrative status and never erases linked data.

## Courses and families

Edit start/end dates, grace dates, fee plan, mode, teacher/batch and notes. End cannot precede start; default grace is seven days. At the end date the course enters Grace, then Ended at the grace boundary. Warnings begin in the final seven days by default. Use edit to extend/shorten/change a course or transfer its batch, On hold/Resume for a pause, and Re-enroll for another course.

Invitations are one-time and expire after seven days. Generate/regenerate from the student; regeneration expires earlier unused invitations for that student/email. Parents can redeem another invitation to link another child. Admin can link/unlink children, disable/reactivate, reset credentials and extend access. Multiple guardians can be restricted in Settings.

Parent `/parent` shows only explicitly linked children. It includes course dates/grace, fees when allowed, official receipts, private proof submissions, renewals, classes, attendance, homework, test trends, shared documents, announcements and printable monthly timesheets. Renewal approval creates a new enrollment; clarification and rejection are also recorded.

## Finance and proofs

Create monthly, hourly, package or custom fees. The ledger allocates fee-linked official payments first, then unallocated official payments by due date/ID. It calculates paid/pending/overdue and included/used/remaining class hours. A submitted proof never counts as payment until approved.

Parent payment submission requires PNG/JPG/WEBP/PDF proof (default maximum 5 MB), including a cash receipt photo for cash. The administrator inspects it and approves, rejects or asks for a new proof. Repeated approval reuses the official payment. Proof URLs require authorization and are not public static paths.

Official payment edits require **Reason for Edit**. Website current lists use the latest version; the preceding values appear in Historical Payments. Cancelled, Reversed, Refunded and Entered by mistake records remain stored and excluded from current collections. Refunded is an accounting status, not an automatic bank transfer. Receipt **View / Print** opens the current version and uses the browser's Save as PDF option; no separate PDF rendering service is required.

## Teachers, subjects and batches

Create/edit/archive/reactivate teacher and subject records. Upload a teacher photo; assign students/subjects. Create batches with a subject, teacher, grade/year, dates, mode and capacity. Members can be added/removed without erasing earlier class records. Change a batch teacher by editing the batch. These changes affect assignments/future scheduling; existing historical class ownership remains recorded.

Create teacher/student credentials in Accounts & security and link the account to its teacher/student record. Teachers are restricted to their assigned students and own academic records. Financial access is off unless explicitly permitted. Students see their own record only.

## Classes, attendance, tests and assignments

Schedule an individual or batch once, or select weekly weekdays through an end date (up to one year and 3,000 student-class rows per request). Conflicting student/teacher times reject the entire request. Day, Week, Month, Agenda and List offer dated class views. Editing a shared batch session updates its member rows transactionally; cancelling an individual student-class row preserves it. Class completion computes and retains duration from start/end times.

Mark individual or bulk per-class attendance. Multiple classes on one date are supported; V6.1 daily logs are retained. Attendance percentage is **Present / conducted attendance records × 100**; cancelled classes do not count. Mark all students of a conducted class for a complete denominator. Late and Excused are separately visible and are not counted as Present.

Timesheets filter by month/student/teacher/subject/batch/enrollment. Student totals count their completed classes; teacher totals count a shared batch session once. Print or export CSV, including TOTAL COMPLETED HOURS.

Tests accept student/batch targeting, max/passing marks, marks, topic and remarks. Percentage, grade, latest/best/lowest/average/pass rate and subject trends use recorded results. Teacher tests and assignments appear in authorized student/parent learning views. Students submit homework notes; teachers review and mark completion. Assignments use notes rather than a binary homework attachment workflow.

Announcements target Everyone, Teachers, Students, Parents, Batch or Student with Normal/Important/Urgent priority. In-app reminders deduplicate upcoming classes/tests, course warnings/grace, dues, assignments, proof decisions, renewals and announcements. Read state persists. There is no email/SMS/push delivery service configured.

## Settings, appearance and reports

Academy, academic, finance, parent access, notifications, Excel, application, appearance and accounts/security controls are grouped. India defaults are Asia/Kolkata, INR, seven-day grace/warnings. Currency changes are display settings and do not convert historical amounts. Stored dates remain ISO for safe sorting; the V7 table display honors date/time preferences.

Appearance/device preferences persist locally per browser: Light/Dark/Follow device; separate light primary/secondary and dark primary/secondary; text size, density, corners, contrast, reduced motion, background darkness; automatic/manual Mobile/Tablet/Desktop. Light canvas is #E6E0D1 and dark canvas is #000000. The exact supplied PNG remains the logo/icon.

Reports open real filtered registers for students/alumni, attendance, classes/hours, fee collections/dues, payment edits, admissions, enrollments/endings, renewals, tests, assignments and audit history. Use CSV, the master Excel workbook, or A4-friendly print. CSV import first validates every row; commit is all-or-nothing. Required headers: `full_name,grade,subjects`. Optional supported fields are shown by the import preview; error rows are not silently skipped.

The installed PWA caches only the academy icon. Authenticated pages/APIs/proofs are not available offline from a service-worker cache. Connectivity is required to read or save current academy records.
