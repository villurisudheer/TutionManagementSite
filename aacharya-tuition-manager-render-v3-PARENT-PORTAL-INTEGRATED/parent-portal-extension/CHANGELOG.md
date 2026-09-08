# Changelog

## 1.0.0
- Separate Render-hosted Parent Portal extension.
- Invitation-only parent signup after admission acceptance.
- Multiple-child linking by invitation.
- Live classes, attendance, fees, verified payments and tests read from the main tuition manager through a secret bridge API.
- Course enrollments with 7-day pre-end warning and 7-day post-course grace period.
- Renewal requests that pause account closure while pending.
- Parent account disabling after all linked enrollments finish; credentials are purged later while historical links remain.
- Parent-submitted payment proofs with compulsory JPG/PNG/WEBP/PDF evidence.
- Duplicate proof detection by transaction details and SHA-256 file hash.
- Admin verification flow: approve, reject, or request a clearer proof.
- Approved proofs create an official payment in the main tuition manager and therefore flow into the main Excel workbook.
- Separate extension-admin dashboard for parent accounts, invitations, enrollments, renewals and payment proofs.
