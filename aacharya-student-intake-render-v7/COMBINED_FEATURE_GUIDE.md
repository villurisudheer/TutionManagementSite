# Combined V7 features

## Existing academy application

V7 remains authoritative for students, permanent identities, multiple enrollments, true alumni, admission history, parent invitations and multiple-child links, private compulsory payment proofs, payment edit history, classes, attendance, tests, assignments, announcements, notifications, receipts and reports. The original 44 master-workbook sheets remain. Original academy PNG and safe XLSX generator retain their baseline checksums.

## V2 monthly fee review

Admin header → Review monthly fees. Select student, month, billing type, agreed price/rate and contracted hours. Preview scheduled, delivered, absent, cancelled, online/offline and unmarked hours. Hourly previews use completed classes marked Present or Late. Monthly/package prices remain fixed: ₹5,000 for 20 hours does not automatically become ₹250 per hour. Absence, compensation, holiday and mixed-mode rate exceptions require administrator review.

Confirm amount, charge description, due date, reason and agreement checkbox. Issuing creates a fee in the existing ledger, included in finance totals and Excel. It creates no official payment. Duplicate student/month/description charges are blocked. Changed class data invalidates an earlier preview. Different descriptions allow separate charges intentionally. Correct a reviewed charge through the existing fee editing workflow; voided charges remain historical.

V2's overlapping student, receipt, assignment, announcement, backup and payment features use V7's existing richer modules. The V2 source contains no live database. Its incompatible database schema is not copied over V7. No automatic live V2 database import is implemented.

## Chemistry Practice Lab

Portal link → Chemistry Practice Lab. Original 133 questions across 19 chapters, five-question sets (3 MCQs + 2 short answers), worked solutions, final-answer scoring, assisted scoring and same-set reset remain. Original bank.js/core.js are unchanged. Progress and latest 20 results sync per account. Completed attempts cannot be rewritten; reset creates a new attempt. Stale revisions require a reload. Unsaved drafts are retained on the device.

Practice is separate from official test marks and is not a secure examination: the browser receives question answers. Teachers and parents practice on their own accounts; this edition does not provide a parent view of a child's practice results. Standalone browser history is not automatically assigned to a person. Light/dark and accent preferences follow academy settings stored on the device.

## Cloud storage

One Render web service, one Supabase project. See CLOUD_SETUP.md. Local-disk mode remains available through `npm run start:local`.
