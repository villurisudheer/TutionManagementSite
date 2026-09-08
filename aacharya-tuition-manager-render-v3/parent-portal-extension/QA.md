# QA Report — Parent Portal Extension 1.0

Date: 07 Sep 2026

## Static checks

- Extension server JavaScript syntax: passed
- Parent portal JavaScript syntax: passed
- Signup JavaScript syntax: passed
- Extension-admin JavaScript syntax: passed
- Main-v3 bridge JavaScript syntax: passed
- Patched main-v3 JavaScript syntax: passed

## Extension smoke test

`npm test` passed for:

- integration admission hook
- extension admin login
- student reference creation
- invitation generation
- enrollment creation
- invitation-only parent signup
- parent dashboard
- compulsory payment-proof submission
- renewal request

## Main v3 regression test

The original v3 smoke test still passed after adding the isolated parent bridge:

- admin login/logout
- public intake
- students
- classes
- attendance
- fees
- payments with payer/receiver
- tests
- dashboard
- Excel workbook generation and sheets

## Two-service end-to-end test

A real local test was run with the patched main manager on one port and the Parent Portal Extension on another port.

Passed workflow:

1. Main public admission submitted.
2. Main admin accepted admission.
3. Admission hook created the student reference in the extension.
4. Extension admin regenerated a one-time invite.
5. Course enrollment was created.
6. Parent used invitation and signed up.
7. Parent dashboard read live main-manager data.
8. Main class duration returned 1.5 hours for 19:00–20:30.
9. Parent dashboard showed 100% attendance from the main manager.
10. Parent dashboard showed ₹6,000 pending fees.
11. Parent uploaded a required payment proof with payer and UTR details.
12. Extension admin approved the proof.
13. Main manager created the official ₹2,500 payment with payer, relation, transaction reference, receipt number, and parent-proof idempotency marker.
14. Main Excel workbook rebuilt successfully after the verified payment.
15. Parent submitted a renewal request.
16. Extension admin approved the renewal and created a new enrollment.

## Important deployment requirement

For real parent accounts and payment screenshots on Render, use persistent storage for the extension. The included `render.yaml` mounts `/var/data`.

The main and extension services must use the same `PARENT_PORTAL_SECRET`.
