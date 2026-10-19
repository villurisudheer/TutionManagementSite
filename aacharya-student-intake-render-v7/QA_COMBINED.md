# Combined edition QA — 7.1.0

Automated QA uses synthetic records and the retained V6.1 fixture, never production academy data. Tests are included in this project. The final release gate runs them again against a clean extraction of the packaged ZIP. No real Supabase credentials or live Render account were supplied; live provider/deployment verification remains required.

## Tests

- Source gate: JavaScript syntax, baseline academy logo and XLSX-engine checksums, frontend asset references and relative API paths.
- V7 regression: 44 scenarios, 507 assertions. Covers original V6.1 data opening, admissions acceptance/history/idempotence/repair, students and edit conflicts, teachers/subjects/batches, recurring classes and attendance, fee allocation, private mandatory parent proofs, approval/rejection/replacement, payment version history, receipts, parent/student/teacher authorization, multiple children, enrollment warning/grace/renewal/alumni/rejoin, assignments, announcements, notifications, CSV import, archive/restart preservation, backups, Excel, authentication and migration failure.
- Combined gate: 60 assertions. Runs the actual cloud SQL against PGlite PostgreSQL via a local Supabase REST/private-object emulator. Covers anonymous/authenticated SQL permission refusal, repeatable SQL installation, empty-state startup refusal, read-only import and overwrite refusal, package/hourly fee review, explicit confirmation, duplicate/stale-charge rejection, server-calculated Chemistry scores and immutable completion, account authorization, cache-free restart, new private document restore, failed upload and failed commit with no durable false save, ambiguous successful commit recovery, concurrent writes, missing-file export refusal, writer fencing, public-bucket refusal, full export, bounded backup history retaining original revision.
- Browser gate: 112 checks through Chromium/Playwright, using cloud mode with the same PostgreSQL-backed emulator. Covers 25 admin modules, four portals/public pages, fee review and issue through actual UI, Chemistry save/reload, no horizontal overflow at 320/375/390/430/768/1024/1366/1920, exact academy light/dark backgrounds, persisted device override, receipt print-to-PDF, and no uncaught JavaScript errors. Screenshots were inspected internally.
- Chemistry: 11 question-bank, generation, scoring, numeric/text validation and DOM workflow tests.
- Workbook: independent openpyxl parser and ZIP/XML validation. All 44 expected sheets, 51 XML parts, no formula-error values or parser warnings. The original safe XLSX engine remains unchanged. No claim is made that desktop Microsoft Excel or Google Sheets was launched in this environment.

## Reproduce with Node.js 24

Production has no npm runtime dependencies. Optional QA tools belong in a separate development folder:

```sh
npm ci
npm test
node --test chemistry/tests/core.test.js
```

`test:combined` needs PGlite; set PGLITE_MODULE to its absolute installed package path. Chemistry DOM tests need jsdom (JSDOM_MODULE may point to its absolute `lib/api.js`). Browser tests need PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE (or CHROMIUM_MODULE); set QA_BROWSER_CLOUD=true and PGLITE_MODULE to exercise cloud mode. Set QA_V7_OUTPUT to an external temporary directory for reports and QA workbook.

```sh
npm run test:combined
npm run test:browser
python3 scripts/validate-workbook-v7.py /path/to/Aacharya_V7_QA_Workbook.xlsx /path/to/qa-database.sqlite
```

## Practical limits

See CLOUD_SETUP.md for single-writer snapshot storage, size/bandwidth constraints and provider setup. The V2 attachment contained source code, not a live database; no production V2 database was migrated. Chemistry results are practice records, not secure-exam marks. Complete independent backups must include private files.
