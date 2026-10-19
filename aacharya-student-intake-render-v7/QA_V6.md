# V6 QA

Run:

```bash
npm test
```

The automated V6 smoke test validates:

- fresh V6 startup on an empty data directory
- V5.3 core tables/functions still work
- public/admin/parent pages are served
- admission acceptance creates an integrated parent invitation
- invitation-only parent signup
- parent can view the linked child
- payment submission **without proof is rejected**
- valid private PNG proof submission
- admin can retrieve and verify the proof
- approval creates an official payment
- current payment metadata records source/version
- admin payment edit requires a reason and creates version 2
- website `/api/payments` returns the edited/current value
- `/api/payment-history` retains the old value and reason
- ended-only student becomes Alumni
- active student is Current
- alumnus who receives a new active/upcoming enrollment becomes Current and is removed from Alumni
- a true alumnus remains in the archive population
- V6 XLSX is generated and validates with all 36 expected sheet names
- V6 workbook status reports version 6.0.0 and 36 sheets

The fake-data workbook generated from this QA path is also independently import-tested with a spreadsheet engine during release preparation.
