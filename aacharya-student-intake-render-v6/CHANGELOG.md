# Changelog

## V6.0.0 — Integrated Parent Portal Edition

Built as a new sibling version from the V5.3 codebase so the prior V5.3 project can remain untouched in GitHub.

### Added

- Same-app Parent Portal (`/parent`) and invitation signup (`/parent/signup`)
- Dedicated parent accounts and parent/student permission links
- Multiple-child parent support
- Course enrollments with Upcoming/Active/Grace/Ended lifecycle
- 7-day course-ending warning and grace notifications
- Renewal requests with admin approval/rejection
- Compulsory parent payment screenshot/receipt (PNG/JPG/WEBP/PDF)
- Private proof storage under the main persistent `DATA_DIR`
- Admin payment-proof verification and official payment creation
- Payment resubmission history
- Admin payment editing with compulsory edit reason
- Current payment version metadata and historical payment snapshots
- True-alumni-only archive logic with automatic rejoin exclusion
- 9 new V6 workbook sheets; 36 total
- Integrated parent portal admin section
- V6 smoke test

### Preserved

- V5.3 student/class/attendance/fee/payment/test tables and functionality
- V5.3 reliable XLSX writer
- Existing 27 workbook sheets
- V5.2 theme/customization and adaptive layouts
- Exact Aacharya app icon
- Old `parent-portal-extension/` files for backward reference (not used by V6 deployment)
