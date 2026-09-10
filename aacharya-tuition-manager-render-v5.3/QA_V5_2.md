# QA — Aacharya Tuition Manager v5.2

## Automated checks

Main application `npm test` passed after the V5.2 theme changes. The test covers login, public intake, students, classes, attendance, fees, payer/receiver payment fields, tests, dashboard data, the 27-sheet Excel workbook and logout.

Parent Portal Extension `npm test` also passed after its dark palette alignment.

JavaScript syntax checks passed for `server.js`, `public/admin.js` and `public/apply.js`.

## Theme checks

- Light canvas is defined as exact `#E6E0D1`.
- Light primary default is `#C8202F` red.
- Light secondary default is `#1F5FBF` blue.
- Dark canvas is exact `#000000`.
- Dark primary default is `#153A6B` navy.
- Dark secondary default is `#7B1E35` maroon.
- Four colour pickers are present in admin Appearance settings.
- Public intake follows device light/dark preference.
- Existing exact Aacharya PNG icon remains in place.
