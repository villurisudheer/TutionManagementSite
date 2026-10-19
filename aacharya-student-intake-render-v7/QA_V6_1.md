# V6.1 QA

Run:

```bash
npm test
```

The release test covers the full V6 behavior plus V6.1 reliability cases.

## V6 regression coverage

- admin login/logout
- public intake
- admission acceptance
- integrated parent invitation/signup
- linked-child authorization
- compulsory private payment proof
- admin proof approval
- official payment creation
- payment edit/version history
- enrollment lifecycle / true alumni / rejoin behavior
- 36-sheet Excel generation

## V6.1 reliability coverage

- an Accepted admission remains in `/api/intake`
- accepted admission remains linked to its student
- accepting the same admission again is idempotent and creates no duplicate student
- Data Safety reports SQLite integrity `ok`
- Student Archive keeps the student row
- Student Archive preserves linked class, attendance, fee and test rows
- restart with the same DATA_DIR preserves the student/admission
- a deliberately broken Accepted admission link is self-repaired on next startup
- rolling SQLite snapshots are created and recognized

Release result: **PASS**.
