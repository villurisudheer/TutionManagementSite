# V7 release quality checks

Only successfully executed checks are reported here. Tests use artificial records in an isolated data directory, never the academy production database. The authoritative V6.1 source was separately tested and is unchanged.

## Successful automated checks

| Gate | Result |
|---|---|
| Node source, logo/writer hashes, static assets, relative APIs | 60 checks passed |
| V6.1 compatibility and V7 workflows/reliability | 44 scenarios, 495 assertions passed |
| Chromium UI | 99 checks passed |
| Independent workbook import / ZIP / XML | 149 checks passed; 44 sheets; 51 XML parts |
| Baseline preservation | All 69 original files retained in V7; separate V6.1 folder unchanged |

Detailed machine-readable results are under `qa/`. Browser checks cover login, all 25 new admin sections, student creation/filter clearing, teacher/student tabs, parent tabs, public intake, actual receipt PDF printing, theme initialization and page-width overflow checks at 320, 375, 390, 430, 768, 1024, 1366 and 1920 pixels. Screenshot review corrected tablet navigation stretching, missing button styling and cramped mobile records.

## Reproduce locally

Node 24 runtime tests:

```sh
QA_V7_OUTPUT=/absolute/path/to/qa-results npm test
```

For browser QA, install Playwright in a development environment and install its Chromium browser. These are test-only tools; do not add them to the production Render build.

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
QA_V7_OUTPUT=/absolute/path/to/browser-results npm run test:browser
```

An existing supported Chromium executable can be supplied with `CHROMIUM_EXECUTABLE`. The release check used Playwright with Chromium 153.0.8010.0. `PLAYWRIGHT_MODULE` can locate a separately installed Playwright module.

Independent workbook check (Python 3 with openpyxl):

```sh
python3 scripts/validate-workbook-v7.py /absolute/path/to/qa-results/Aacharya_V7_QA_Workbook.xlsx /absolute/path/to/qa-results/qa-database.sqlite
```

## Clean archive release gate

The first clean extraction passed the same 44 workflow scenarios, 99 browser checks and independent workbook validation. A final admission-history refusal assertion is included in the 495-assertion suite. The distributed archive is rerun through the same clean-extraction gate after packaging.

The final archive must be extracted into an empty directory. Verify its CRC and `V7_RELEASE_MANIFEST.json`, then run the same backend, browser and workbook checks from that extracted project. Do not substitute results from the development directory. No deployment data, real credentials or production database are packaged.

## Reliability and failure tests

The suite creates admissions, students, courses, fees/payments, proofs, teacher/parent/student accounts, batch classes, attendance, tests and assignments; restarts the server; restarts again with the same data directory; archives/reactivates; edits payments; re-enrolls a former student; and rebuilds Excel. Every important table count is checked for unexpected decreases. Deliberate fault scenarios are isolated and repaired or discarded afterwards.

It also checks missing database startup refusal, pre-migration snapshot creation, migration rollback, original-ID recovery, high-water decrease warnings, snapshot-write failure blocking a financial edit, and successful student persistence despite an Excel-write failure. SQL integrity checks pass after the scenarios.

## What was not claimed

- No deployment or destructive restore was performed on the academy's live Render disk.
- Native Microsoft Excel, Google Sheets and LibreOffice application import was not available. The XLSX was validated structurally and independently imported with openpyxl without warnings or spreadsheet error cells. This is not a claim of a native vendor application run.
- Chromium emulated viewport tests do not replace testing physical iOS/Android devices or every browser version.
- No email, SMS, external payment transfer or push-delivery integration is presented as implemented.
- No load capacity/SLA or universal security guarantee is claimed. The project is an additive production-oriented application with the documented tests; monitor real storage, backup and traffic conditions.

## Backend scenario results

1. PASS — V6.1 additive migration preserves every source table and row
2. PASS — Admin login and protected endpoints
3. PASS — Admissions submission, transactional acceptance, permanence and duplicate prevention
4. PASS — Student creation, editing, optimistic conflict and active filters
5. PASS — Subjects and teacher CRUD with assignment
6. PASS — Batch creation, membership and capacity validation
7. PASS — Enrollment dates, warnings, grace, hold and resume
8. PASS — Class scheduler, batch sessions, recurring dates and conflict atomicity
9. PASS — Class completion, per-class/bulk attendance, cancelled denominator and teacher hours
10. PASS — Fees and official payment ledger allocation
11. PASS — Invitation-only signup, one-time use and multiple linked children
12. PASS — Parent IDOR and compulsory private payment proof
13. PASS — Proof reject, replacement, preserved file history and atomic approval
14. PASS — Payment edits, conflict detection, historical values and current-only totals
15. PASS — Receipt generation and parent authorization
16. PASS — Teacher and student account creation and backend authorization
17. PASS — Tests, marks, percentage, teacher scope and student performance
18. PASS — Assignments and student submission lifecycle
19. PASS — Announcement audience enforcement and notification read state
20. PASS — Renewal clarification and idempotent new-enrollment approval
21. PASS — True alumni and rejoined student course history
22. PASS — Parent manual disable persists; reset credentials invalidates old sessions
23. PASS — Parent unlink revokes access without destroying history
24. PASS — Documents remain private and preserve exact branding
25. PASS — CSV preview rejects corruption and commit is atomic/idempotent
26. PASS — Global search, filters, report exports and financial history separation
27. PASS — Student archive/reactivate preserves every related table
28. PASS — Safety backups, integrity and relationship checks
29. PASS — Broken admission links repair and safe missing-student recovery
30. PASS — Class rescheduling detects conflicts and retains batch sessions
31. PASS — Complete backup includes SQLite and private proof files
32. PASS — Financial changes fail safely when a snapshot cannot be written
33. PASS — Excel write failure does not lose a valid student save
34. PASS — Teachers archive/reactivate and existing sessions obey role state
35. PASS — Fee report and Student 360 use identical allocation and status
36. PASS — Legacy remote payment writes cannot bypass proof verification
37. PASS — Multiple admissions stress and missing identity recovery
38. PASS — Financial display permission hides historical fee notifications
39. PASS — Restart and redeploy-style restart preserve all row counts
40. PASS — Excel rebuild is read-only; 44 sheets and archive separation
41. PASS — Security headers, CSRF refusal, last-admin safeguard and logout revocation
42. PASS — Production persistent-disk warning and secure cookies
43. PASS — Missing database fails closed without replacing production data
44. PASS — Failed additive migration rolls back and retains its safety snapshot
